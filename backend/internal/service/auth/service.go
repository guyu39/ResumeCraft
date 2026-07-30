package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/mail"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials      = errors.New("invalid credentials")
	ErrInvalidToken            = errors.New("invalid token")
	ErrEmailExists             = errors.New("email already exists")
	ErrTokenRevoked            = errors.New("token revoked")
	ErrCodeInvalid             = errors.New("verification code invalid or expired")
	ErrCodeTooFrequent         = errors.New("verification code requested too frequently")
	ErrEmailNotRegistered      = errors.New("email not registered")
	ErrSMTPNotConfigured       = errors.New("email service not configured")
	ErrCodeUnavailable         = errors.New("verification code service unavailable")
	ErrSessionKicked           = errors.New("session kicked by new login")
	ErrSessionStoreUnavailable = errors.New("auth session store unavailable")
)

type Service interface {
	SendEmailCode(ctx context.Context, email, purpose string) error
	Register(ctx context.Context, req model.RegisterRequest, ip, ua string) (*model.AuthPayload, error)
	Login(ctx context.Context, req model.LoginRequest, ip, ua string) (*model.AuthPayload, error)
	// ConfirmLogin 单设备登录两阶段流程第二步：验证 loginConfirm ticket 后创建会话并踢掉他设备。
	// 「顶号」的实际副作用（撤销旧设备 token）在此发生，而非 Login 时。
	ConfirmLogin(ctx context.Context, ticket, ip, ua string) (*model.AuthPayload, error)
	Refresh(ctx context.Context, refreshToken, ip, ua string) (*model.AuthPayload, error)
	Logout(ctx context.Context, accessToken, refreshToken string) error
	Me(ctx context.Context, userID string) (*model.AuthUser, error)
	ChangePassword(ctx context.Context, userID string, req model.ChangePasswordRequest) error
	ParseAccessToken(token string) (string, error)
	GetAvatarMeta(ctx context.Context, userID string) (string, string, error)
	UpdateAvatar(ctx context.Context, userID, avatarURL, avatarHash string) error
}

// sessionData 存储在 Redis 中的会话数据
type sessionData struct {
	UserID          string `json:"uid"`
	TokenHash       string `json:"th"`            // refresh token hash
	AccessTokenHash string `json:"ath,omitempty"` // access token hash（用于单设备登录时同步清理旧 AT）
	IP              string `json:"ip,omitempty"`
	UA              string `json:"ua,omitempty"`
}

type service struct {
	pool            *pgxpool.Pool
	rdb             *redis.Client
	mailer          *mail.Sender
	jwtSecret       []byte
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
}

// loginConfirmTTL 单设备登录两阶段流程中 loginConfirm ticket 的有效期。
// 用户需在此窗口内点「是我，继续」完成登录；超时则需重新登录。
const loginConfirmTTL = 3 * time.Minute

type userRow struct {
	ID          string
	Email       string
	DisplayName string
}

type tokenClaims struct {
	UserID    string `json:"uid"`
	SessionID string `json:"sid,omitempty"`
	Type      string `json:"typ"`
	jwt.RegisteredClaims
}

// Redis key 模式
const (
	keyAccessToken  = "auth:at:%s"           // auth:at:{sha256(accessToken)} → userID（即时撤销）
	keySession      = "auth:session:%s"      // auth:session:{sessionID} → JSON{sessionData}（refresh 校验）
	keyUserSessions = "auth:us:%s"           // auth:us:{userID} → Set{sessionID, ...}（会话索引）
	keyUserSession  = "auth:user_session:%s" // auth:user_session:{userID} → 当前生效的 sessionID（单设备登录的「顶号」判据）
)

// 原子校验并消费旧 Refresh Session。旧 Access Token 一并撤销，避免并发轮换时
// 两个请求都通过“先查后删”的校验窗口。
var consumeRefreshSessionScript = redis.NewScript(`
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end

local ok, session = pcall(cjson.decode, raw)
if not ok then
  return -2
end
if session.uid ~= ARGV[1] or session.th ~= ARGV[2] then
  return -1
end

redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], ARGV[3])
if session.ath and session.ath ~= '' then
  redis.call('DEL', ARGV[4] .. session.ath)
end
return 1
`)

func NewService(pool *pgxpool.Pool, rdb *redis.Client, cfg config.AuthConfig, mailer *mail.Sender) Service {
	return &service{
		pool:            pool,
		rdb:             rdb,
		mailer:          mailer,
		jwtSecret:       []byte(cfg.JWTSecret),
		accessTokenTTL:  cfg.AccessTokenTTL,
		refreshTokenTTL: cfg.RefreshTokenTTL,
	}
}

// ---------- 邮箱验证码 ----------

func emailCodeKey(purpose, email string) string    { return "email_code:" + purpose + ":" + email }
func emailCodeCDKey(purpose, email string) string  { return "email_code_cd:" + purpose + ":" + email }
func emailCodeTryKey(purpose, email string) string { return "email_code_try:" + purpose + ":" + email }

// 验证码最多允许校验失败次数，达上限作废该码强制重发，防止 6 位码被暴力枚举
const maxCodeAttempts = 5

// SendEmailCode 生成并发送邮箱验证码。purpose: register | login | change_password。
func (s *service) SendEmailCode(ctx context.Context, email, purpose string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return ErrCodeInvalid
	}
	if s.rdb == nil {
		return ErrCodeUnavailable
	}
	if s.mailer == nil || !s.mailer.Configured() {
		return ErrSMTPNotConfigured
	}

	// 注册：邮箱已存在则拒绝；登录/改密：邮箱不存在则拒绝
	exists, err := s.emailExists(ctx, email)
	if err != nil {
		return err
	}
	if purpose == "register" && exists {
		return ErrEmailExists
	}
	if (purpose == "login" || purpose == "change_password") && !exists {
		return ErrEmailNotRegistered
	}

	// 60s 发送频率限制
	cd, err := s.rdb.Exists(ctx, emailCodeCDKey(purpose, email)).Result()
	if err != nil {
		return ErrCodeUnavailable
	}
	if cd > 0 {
		return ErrCodeTooFrequent
	}

	code := genNumericCode(6)
	if err := s.rdb.Set(ctx, emailCodeKey(purpose, email), code, 5*time.Minute).Err(); err != nil {
		return ErrCodeUnavailable
	}
	// 重置该码的失败计数
	s.rdb.Del(ctx, emailCodeTryKey(purpose, email))
	s.rdb.Set(ctx, emailCodeCDKey(purpose, email), "1", 60*time.Second)

	if err := s.mailer.SendCode(email, code, purpose); err != nil {
		// 发送失败时清掉已存的码，避免占用
		s.rdb.Del(ctx, emailCodeKey(purpose, email))
		log.Printf("[auth] send email code failed: %v", err)
		if errors.Is(err, mail.ErrNotConfigured) {
			return ErrSMTPNotConfigured
		}
		return fmt.Errorf("send email: %w", err)
	}
	return nil
}

// verifyEmailCode 校验验证码，成功后立即删除（一次性）；
// 失败累计，达 maxCodeAttempts 次即作废该码，防止暴力枚举。
func (s *service) verifyEmailCode(ctx context.Context, email, purpose, code string) error {
	if s.rdb == nil {
		return ErrCodeUnavailable
	}
	if strings.TrimSpace(code) == "" {
		return ErrCodeInvalid
	}
	stored, err := s.rdb.Get(ctx, emailCodeKey(purpose, email)).Result()
	if err != nil {
		return ErrCodeInvalid
	}
	if stored != strings.TrimSpace(code) {
		// 失败计数 +1，首次设置 5min 过期（与码同寿命）；超限作废码
		tryKey := emailCodeTryKey(purpose, email)
		n, _ := s.rdb.Incr(ctx, tryKey).Result()
		if n == 1 {
			s.rdb.Expire(ctx, tryKey, 5*time.Minute)
		}
		if n >= maxCodeAttempts {
			s.rdb.Del(ctx, emailCodeKey(purpose, email))
			s.rdb.Del(ctx, tryKey)
		}
		return ErrCodeInvalid
	}
	s.rdb.Del(ctx, emailCodeKey(purpose, email))
	s.rdb.Del(ctx, emailCodeTryKey(purpose, email))
	return nil
}

func (s *service) emailExists(ctx context.Context, email string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL)`,
		email,
	).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check email exists: %w", err)
	}
	return exists, nil
}

// genNumericCode 生成 n 位数字验证码（crypto/rand）
func genNumericCode(n int) string {
	const digits = "0123456789"
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = digits[int(b[i])%10]
	}
	return string(b)
}

func (s *service) Register(ctx context.Context, req model.RegisterRequest, ip, ua string) (*model.AuthPayload, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))

	// 校验注册验证码（确保邮箱真实）
	if err := s.verifyEmailCode(ctx, email, "register", req.Code); err != nil {
		return nil, err
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		displayName = strings.Split(email, "@")[0]
	}

	var u userRow
	err = s.pool.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, display_name)
		 VALUES ($1, $2, $3)
		 RETURNING id, email, display_name`,
		email, string(passwordHash), displayName,
	).Scan(&u.ID, &u.Email, &u.DisplayName)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrEmailExists
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}

	payload, err := s.createSessionAndTokens(ctx, u, ip, ua)
	if err != nil {
		return nil, err
	}

	return payload, nil
}

func (s *service) Login(ctx context.Context, req model.LoginRequest, ip, ua string) (*model.AuthPayload, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))

	var (
		u            userRow
		passwordHash string
	)
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name, password_hash
		 FROM users
		 WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
		email,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &passwordHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			reason := "user_not_found"
			if req.LoginType == "code" {
				s.recordLoginAttempt(ctx, email, false, reason, ip, ua)
				return nil, ErrEmailNotRegistered
			}
			s.recordLoginAttempt(ctx, email, false, reason, ip, ua)
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	// 双模式：验证码登录 / 密码登录（LoginType 为空默认密码，向后兼容）
	if req.LoginType == "code" {
		if err := s.verifyEmailCode(ctx, email, "login", req.Code); err != nil {
			s.recordLoginAttempt(ctx, email, false, "wrong_code", ip, ua)
			return nil, err
		}
	} else {
		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
			s.recordLoginAttempt(ctx, email, false, "wrong_password", ip, ua)
			return nil, ErrInvalidCredentials
		}
	}

	s.recordLoginAttempt(ctx, email, true, "", ip, ua)
	_, _ = s.pool.Exec(ctx, `UPDATE users SET last_login_at = NOW() WHERE id = $1`, u.ID)

	// 单设备登录两阶段流程：检测他设备在线会话。
	// 若存在 → 暂不签发 token、不踢旧设备，返回短效 loginConfirm ticket 交前端二次确认。
	// 「顶号」副作用推迟到 ConfirmLogin，保证「不是我」时旧设备毫发无损。
	if s.hasOtherDeviceSession(ctx, u.ID, ua) {
		ticket, err := s.signLoginConfirmTicket(u.ID)
		if err != nil {
			return nil, fmt.Errorf("sign login confirm ticket: %w", err)
		}
		return &model.AuthPayload{
			User: model.AuthUser{
				ID:          u.ID,
				Email:       u.Email,
				DisplayName: u.DisplayName,
			},
			RequiresKickConfirm: true,
			LoginTicket:         ticket,
		}, nil
	}

	payload, err := s.createSessionAndTokens(ctx, u, ip, ua)
	if err != nil {
		return nil, err
	}

	return payload, nil
}

// hasOtherDeviceSession 是否存在「他设备」在线会话（UA 与当前登录不同）。
// 同设备重登录（UA 相同）返回 false，无需二次确认。仅做读取，不修改任何会话状态。
func (s *service) hasOtherDeviceSession(ctx context.Context, userID, currentUA string) bool {
	if s.rdb == nil {
		return false // Redis 不可用无法判定，按无他设备处理（单设备登录本就依赖 Redis）
	}
	usKey := fmt.Sprintf(keyUserSessions, userID)
	members, err := s.rdb.SMembers(ctx, usKey).Result()
	if err != nil || len(members) == 0 {
		return false
	}
	for _, sid := range members {
		sessKey := fmt.Sprintf(keySession, sid)
		val, err := s.rdb.Get(ctx, sessKey).Result()
		if err != nil || val == "" {
			continue // 会话已过期/不存在，跳过（集合成员可能滞后）
		}
		var sess sessionData
		if json.Unmarshal([]byte(val), &sess) != nil {
			continue
		}
		// 他设备判定：UA 非空且与当前登录不同（与同设备重登录区分）
		if sess.UA != "" && sess.UA != currentUA {
			return true
		}
	}
	return false
}

// signLoginConfirmTicket 签发短效 loginConfirm ticket（单设备登录两阶段流程的临时凭证）。
// 持有者可在 loginConfirmTTL 内调用 ConfirmLogin 完成登录；本身不承载任何会话权限。
func (s *service) signLoginConfirmTicket(userID string) (string, error) {
	now := time.Now()
	claims := tokenClaims{
		UserID: userID,
		Type:   "login_confirm",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(loginConfirmTTL)),
			Subject:   userID,
		},
	}
	return s.signClaims(claims)
}

// ConfirmLogin 单设备登录两阶段流程第二步：验证 ticket 后创建会话并踢掉他设备。
// 「顶号」的实际副作用（撤销旧设备 access token + 覆盖当前会话指针）在这里发生。
func (s *service) ConfirmLogin(ctx context.Context, ticket, ip, ua string) (*model.AuthPayload, error) {
	claims, err := s.parseToken(ticket, "login_confirm")
	if err != nil {
		return nil, ErrInvalidToken
	}
	var u userRow
	err = s.pool.QueryRow(ctx,
		`SELECT id, email, display_name FROM users WHERE id = $1 AND deleted_at IS NULL`,
		claims.UserID,
	).Scan(&u.ID, &u.Email, &u.DisplayName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidToken
		}
		return nil, fmt.Errorf("query user: %w", err)
	}
	return s.createSessionAndTokens(ctx, u, ip, ua)
}

func (s *service) Refresh(ctx context.Context, refreshToken, ip, ua string) (*model.AuthPayload, error) {
	claims, err := s.parseToken(refreshToken, "refresh")
	if err != nil {
		return nil, ErrInvalidToken
	}

	if s.rdb != nil {
		// 消费前先完成用户读取，减少旧 Token 已消费但新会话未创建的失败窗口。
		u := userRow{ID: claims.UserID}
		err = s.pool.QueryRow(ctx,
			`SELECT email, display_name FROM users WHERE id = $1 AND deleted_at IS NULL`,
			claims.UserID,
		).Scan(&u.Email, &u.DisplayName)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrInvalidToken
			}
			return nil, fmt.Errorf("%w: query refresh user: %v", ErrSessionStoreUnavailable, err)
		}

		if err := s.consumeRefreshSession(ctx, claims.SessionID, claims.UserID, hashToken(refreshToken)); err != nil {
			return nil, err
		}
		payload, err := s.createSessionAndTokens(ctx, u, ip, ua)
		if err != nil {
			return nil, fmt.Errorf("%w: create rotated redis session: %v", ErrSessionStoreUnavailable, err)
		}
		return payload, nil
	}

	return s.refreshFromPostgres(ctx, claims, refreshToken, ip, ua)
}

func (s *service) consumeRefreshSession(ctx context.Context, sessionID, userID, tokenHash string) error {
	sessKey := fmt.Sprintf(keySession, sessionID)
	userSessionsKey := fmt.Sprintf(keyUserSessions, userID)
	status, err := consumeRefreshSessionScript.Run(
		ctx,
		s.rdb,
		[]string{sessKey, userSessionsKey},
		userID,
		tokenHash,
		sessionID,
		"auth:at:",
	).Int64()
	if err != nil {
		return fmt.Errorf("%w: consume redis refresh session: %v", ErrSessionStoreUnavailable, err)
	}
	switch status {
	case 1:
		return nil
	case 0:
		return ErrTokenRevoked
	default:
		return ErrInvalidToken
	}
}

func (s *service) Logout(ctx context.Context, accessToken, refreshToken string) error {
	// 1. 撤销 access token（即时失效）
	if accessToken != "" && s.rdb != nil {
		atKey := fmt.Sprintf(keyAccessToken, hashToken(accessToken))
		s.rdb.Del(ctx, atKey)
	}

	// 2. 撤销 refresh token 对应的会话
	if refreshToken == "" {
		return nil
	}

	claims, err := s.parseToken(refreshToken, "refresh")
	if err != nil {
		// refresh token 无效也不报错，客户端已清除
		return nil
	}

	if s.rdb != nil {
		sessKey := fmt.Sprintf(keySession, claims.SessionID)
		val, err := s.rdb.Get(ctx, sessKey).Result()
		if err != nil {
			// 会话不存在或 Redis 错误，不报错
			return nil
		}
		var sess sessionData
		if err := json.Unmarshal([]byte(val), &sess); err != nil {
			return nil
		}
		// 验证 token hash 防止误删
		if sess.TokenHash == hashToken(refreshToken) {
			s.deleteSessionFromRedis(ctx, claims.SessionID, sess.UserID)
		}
	} else {
		// 回退到 PostgreSQL
		_, _ = s.pool.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1 AND refresh_token_hash = $2 AND revoked_at IS NULL`,
			claims.SessionID, hashToken(refreshToken),
		)
	}

	return nil
}

func (s *service) Me(ctx context.Context, userID string) (*model.AuthUser, error) {
	var u model.AuthUser
	var avatarURL *string
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name, avatar_url
		 FROM users
		 WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &avatarURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidToken
		}
		return nil, fmt.Errorf("query me: %w", err)
	}
	if avatarURL != nil {
		u.AvatarURL = *avatarURL
	}
	return &u, nil
}

func (s *service) ParseAccessToken(token string) (string, error) {
	claims, err := s.parseToken(token, "access")
	if err != nil {
		return "", err
	}

	// 检查 Redis 中 access token 是否仍然有效（支持即时撤销）
	if s.rdb != nil {
		ctx := context.Background()

		// 单设备登录判据：读取「当前生效会话」指针。
		// - 指针存在且 ≠ 我的 sessionID → 已被其他设备顶号 → SESSION_KICKED
		// - 指针缺失（redis 丢 key / 重启 / LRU 驱逐）→ 状态歧义 → fail-open，不踢
		//   （不把「redis 丢数据」误判为「被顶号」，避免误导性的全量登出）
		// - redis 故障（err）→ fail-open
		if claims.SessionID != "" {
			ptrKey := fmt.Sprintf(keyUserSession, claims.UserID)
			curSID, err := s.rdb.Get(ctx, ptrKey).Result()
			if err == redis.Nil {
				// 指针缺失：歧义，落回 access token 校验，不踢
			} else if err != nil {
				log.Printf("[auth] redis get user_session error: %v (fail-open)", err)
			} else if curSID != claims.SessionID {
				log.Printf("[auth] SESSION_KICKED user=%s session=%s (current=%s)", claims.UserID, claims.SessionID, curSID)
				return "", ErrSessionKicked
			}
		}

		atKey := fmt.Sprintf(keyAccessToken, hashToken(token))
		exists, err := s.rdb.Exists(ctx, atKey).Result()
		if err != nil {
			// Redis 故障时 fail-open：仅日志警告，不阻断请求
			log.Printf("[auth] redis check access token error: %v (fail-open)", err)
		} else if exists == 0 {
			// token 已被撤销或已过期（TTL 到期自动删除）
			return "", ErrTokenRevoked
		}
	}

	return claims.UserID, nil
}

func (s *service) GetAvatarMeta(ctx context.Context, userID string) (string, string, error) {
	var avatarURL *string
	var avatarHash *string
	if err := s.pool.QueryRow(ctx,
		`SELECT avatar_url, avatar_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&avatarURL, &avatarHash); err != nil {
		return "", "", err
	}
	if avatarURL == nil {
		return "", "", nil
	}
	if avatarHash == nil {
		return *avatarURL, "", nil
	}
	return *avatarURL, *avatarHash, nil
}

func (s *service) UpdateAvatar(ctx context.Context, userID, avatarURL, avatarHash string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE users SET avatar_url = $1, avatar_hash = $2 WHERE id = $3 AND deleted_at IS NULL`,
		avatarURL, avatarHash, userID,
	)
	return err
}

func (s *service) ChangePassword(ctx context.Context, userID string, req model.ChangePasswordRequest) error {
	var email string
	err := s.pool.QueryRow(ctx,
		`SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidCredentials
		}
		return fmt.Errorf("query user: %w", err)
	}

	// 校验邮箱验证码
	if err := s.verifyEmailCode(ctx, email, "change_password", req.Code); err != nil {
		return err
	}

	// 加密新密码并更新
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash new password: %w", err)
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`,
		string(newHash), userID,
	); err != nil {
		return fmt.Errorf("update password: %w", err)
	}

	return nil
}

// ============================================================================
// 内部方法
// ============================================================================

func (s *service) createSessionAndTokens(ctx context.Context, u userRow, ip, ua string) (*model.AuthPayload, error) {
	now := time.Now()

	// 1. 生成 access token（携带 SessionID 以支持单设备登录时的会话存在性校验）
	sessionID := generateSessionID()
	log.Printf("[auth] createSession user=%s session=%s (single-session=on)", u.ID, sessionID)
	accessClaims := tokenClaims{
		UserID:    u.ID,
		SessionID: sessionID,
		Type:      "access",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTokenTTL)),
			Subject:   u.ID,
		},
	}
	accessToken, err := s.signClaims(accessClaims)
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}

	// 2. 生成 refresh token
	refreshClaims := tokenClaims{
		UserID:    u.ID,
		SessionID: sessionID,
		Type:      "refresh",
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.refreshTokenTTL)),
			Subject:   u.ID,
			ID:        sessionID,
		},
	}
	refreshToken, err := s.signClaims(refreshClaims)
	if err != nil {
		return nil, fmt.Errorf("sign refresh token: %w", err)
	}

	// 4. 单设备登录：踢掉该用户的其他在线会话（撤销旧设备 token）。
	//    注意：此函数在 ConfirmLogin（用户确认后）或无他设备的普通登录时才被调用，
	//    因此这里的副作用不会先于用户确认发生。
	_ = s.evictOtherSessions(ctx, u.ID, sessionID)

	// 5. 存储到 Redis
	if s.rdb != nil {
		// 5a. 存储 access token → userID（用于验证 + 即时撤销）
		atKey := fmt.Sprintf(keyAccessToken, hashToken(accessToken))
		if err := s.rdb.Set(ctx, atKey, u.ID, s.accessTokenTTL).Err(); err != nil {
			log.Printf("[auth] redis set access token error: %v", err)
			// 不中断流程，access token 仍可通过 JWT 签名验证
		}

		// 5b. 存储会话数据（用于 refresh token 验证 + 单设备登录时清理旧 AT）
		sess := sessionData{
			UserID:          u.ID,
			TokenHash:       hashToken(refreshToken),
			AccessTokenHash: hashToken(accessToken),
			IP:              ip,
			UA:              ua,
		}
		sessBytes, _ := json.Marshal(sess)
		sessKey := fmt.Sprintf(keySession, sessionID)
		if err := s.rdb.Set(ctx, sessKey, string(sessBytes), s.refreshTokenTTL).Err(); err != nil {
			log.Printf("[auth] redis set session error: %v", err)
		}

		// 5c. 用户会话索引（便于管理用户所有会话）
		usKey := fmt.Sprintf(keyUserSessions, u.ID)
		s.rdb.SAdd(ctx, usKey, sessionID)
		s.rdb.Expire(ctx, usKey, s.refreshTokenTTL)

		// 5d. 当前生效会话指针（单设备登录的「顶号」判据：ParseAccessToken 据此判定旧端是否被顶）
		ptrKey := fmt.Sprintf(keyUserSession, u.ID)
		if err := s.rdb.Set(ctx, ptrKey, sessionID, s.refreshTokenTTL).Err(); err != nil {
			log.Printf("[auth] redis set user_session ptr error: %v", err)
		}
	} else {
		// Redis 不可用，回退到 PostgreSQL
		_, err := s.pool.Exec(ctx,
			`INSERT INTO auth_sessions (id, user_id, refresh_token_hash, user_agent, ip_address, expires_at)
			 VALUES ($1, $2, $3, $4, NULLIF($5, '')::inet, $6)`,
			sessionID, u.ID, hashToken(refreshToken), ua, ip, now.Add(s.refreshTokenTTL),
		)
		if err != nil {
			return nil, fmt.Errorf("create auth session: %w", err)
		}
	}

	return &model.AuthPayload{
		User: model.AuthUser{
			ID:          u.ID,
			Email:       u.Email,
			DisplayName: u.DisplayName,
		},
		Tokens: model.AuthTokens{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			ExpiresIn:    int64(s.accessTokenTTL.Seconds()),
		},
	}, nil
}

// deleteSessionFromRedis 从 Redis 删除会话及其索引
func (s *service) deleteSessionFromRedis(ctx context.Context, sessionID, userID string) {
	sessKey := fmt.Sprintf(keySession, sessionID)
	s.rdb.Del(ctx, sessKey)

	usKey := fmt.Sprintf(keyUserSessions, userID)
	s.rdb.SRem(ctx, usKey, sessionID)
}

// evictOtherSessions 单设备登录核心：撤销该用户除 exceptSessionID 之外的所有会话。
// 被驱逐会话的 auth:session:{sid} 被删除后，旧设备后续请求经 ParseAccessToken 的指针校验即被拒
// （指针在 createSessionAndTokens 中被覆盖为 exceptSessionID）。
// 仅在用户确认（ConfirmLogin）或无他设备的普通登录路径调用，保证踢号不先于用户确认。
func (s *service) evictOtherSessions(ctx context.Context, userID, exceptSessionID string) int {
	if s.rdb == nil {
		// Redis 不可用：回退 PostgreSQL，撤销其他未撤销的会话行
		res, err := s.pool.Exec(ctx,
			`UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND id != $2 AND revoked_at IS NULL`,
			userID, exceptSessionID,
		)
		if err != nil {
			log.Printf("[auth] evict other sessions (postgres) error: %v", err)
			return 0
		}
		return int(res.RowsAffected())
	}

	usKey := fmt.Sprintf(keyUserSessions, userID)
	members, err := s.rdb.SMembers(ctx, usKey).Result()
	if err != nil {
		log.Printf("[auth] evict: smembers error: %v", err)
		return 0
	}
	evicted := 0
	for _, sid := range members {
		if sid == exceptSessionID {
			continue
		}
		// 先读取旧会话数据，拿到 access token hash 用于清理
		oldSessKey := fmt.Sprintf(keySession, sid)
		if val, err := s.rdb.Get(ctx, oldSessKey).Result(); err == nil && val != "" {
			var oldSess sessionData
			if json.Unmarshal([]byte(val), &oldSess) == nil && oldSess.AccessTokenHash != "" {
				atKey := fmt.Sprintf(keyAccessToken, oldSess.AccessTokenHash)
				s.rdb.Del(ctx, atKey)
				log.Printf("[auth] evict access-token for session=%s", sid)
			}
		}
		s.rdb.Del(ctx, oldSessKey)
		log.Printf("[auth] evict session=%s for user=%s (new session=%s)", sid, userID, exceptSessionID)
		evicted++
	}
	// 清空集合，新建会话时由 createSessionAndTokens 的 SAdd 写回（仅保留新会话）
	s.rdb.Del(ctx, usKey)
	return evicted
}

// refreshFromPostgres 当 Redis 不可用时回退到 PostgreSQL 验证 refresh
func (s *service) refreshFromPostgres(ctx context.Context, claims *tokenClaims, refreshToken, ip, ua string) (*model.AuthPayload, error) {
	var (
		userEmail   string
		displayName string
	)

	err := s.pool.QueryRow(ctx,
		`WITH consumed AS (
			UPDATE auth_sessions
			SET revoked_at = NOW(), updated_at = NOW()
			WHERE id = $1
			  AND user_id = $2
			  AND refresh_token_hash = $3
			  AND revoked_at IS NULL
			  AND expires_at > NOW()
			RETURNING user_id
		)
		SELECT u.email, u.display_name
		FROM consumed c
		JOIN users u ON u.id = c.user_id
		WHERE u.deleted_at IS NULL`,
		claims.SessionID, claims.UserID, hashToken(refreshToken),
	).Scan(&userEmail, &displayName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTokenRevoked
		}
		return nil, fmt.Errorf("%w: consume postgres refresh session: %v", ErrSessionStoreUnavailable, err)
	}

	u := userRow{ID: claims.UserID, Email: userEmail, DisplayName: displayName}
	payload, err := s.createSessionAndTokens(ctx, u, ip, ua)
	if err != nil {
		return nil, fmt.Errorf("%w: create rotated postgres session: %v", ErrSessionStoreUnavailable, err)
	}
	return payload, nil
}

func (s *service) parseToken(tokenValue string, expectType string) (*tokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenValue, &tokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return s.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*tokenClaims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Type != expectType {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

func (s *service) signClaims(claims tokenClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// generateSessionID 生成会话 ID（UUID v4 格式，兼容 PostgreSQL uuid 列类型）
func generateSessionID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	// UUID v4 设置版本号和变体位
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		binary.BigEndian.Uint32(b[0:4]),
		binary.BigEndian.Uint16(b[4:6]),
		binary.BigEndian.Uint16(b[6:8]),
		binary.BigEndian.Uint16(b[8:10]),
		b[10:])
}

func (s *service) recordLoginAttempt(ctx context.Context, email string, success bool, reason, ip, ua string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO login_attempt_logs (email, success, reason, ip_address, user_agent)
		 VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, '')::inet, $5)`,
		email, success, reason, ip, ua,
	)
}
