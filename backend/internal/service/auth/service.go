package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
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
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
	ErrEmailExists        = errors.New("email already exists")
	ErrTokenRevoked       = errors.New("token revoked")
	ErrCodeInvalid        = errors.New("verification code invalid or expired")
	ErrCodeTooFrequent    = errors.New("verification code requested too frequently")
	ErrEmailNotRegistered = errors.New("email not registered")
	ErrSMTPNotConfigured  = errors.New("email service not configured")
	ErrCodeUnavailable    = errors.New("verification code service unavailable")
)

type Service interface {
	SendEmailCode(ctx context.Context, email, purpose string) error
	Register(ctx context.Context, req model.RegisterRequest, ip, ua string) (*model.AuthPayload, error)
	Login(ctx context.Context, req model.LoginRequest, ip, ua string) (*model.AuthPayload, error)
	Refresh(ctx context.Context, refreshToken, ip, ua string) (*model.AuthPayload, error)
	Logout(ctx context.Context, accessToken, refreshToken string) error
	Me(ctx context.Context, userID string) (*model.AuthUser, error)
	ParseAccessToken(token string) (string, error)
	GetAvatarMeta(ctx context.Context, userID string) (string, string, error)
	UpdateAvatar(ctx context.Context, userID, avatarURL, avatarHash string) error
}

// sessionData 存储在 Redis 中的会话数据
type sessionData struct {
	UserID    string `json:"uid"`
	TokenHash string `json:"th"`
	IP        string `json:"ip,omitempty"`
	UA        string `json:"ua,omitempty"`
}

type service struct {
	pool            *pgxpool.Pool
	rdb             *redis.Client
	mailer          *mail.Sender
	jwtSecret       []byte
	accessTokenTTL  time.Duration
	refreshTokenTTL time.Duration
}

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
	keyAccessToken  = "auth:at:%s"      // auth:at:{sha256(accessToken)} → userID
	keySession      = "auth:session:%s" // auth:session:{sessionID} → JSON{sessionData}
	keyUserSessions = "auth:us:%s"      // auth:us:{userID} → Set{sessionID, ...}
)

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

func emailCodeKey(purpose, email string) string  { return "email_code:" + purpose + ":" + email }
func emailCodeCDKey(purpose, email string) string { return "email_code_cd:" + purpose + ":" + email }

// SendEmailCode 生成并发送邮箱验证码。purpose: register | login。
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

	// 注册：邮箱已存在则拒绝；登录：邮箱不存在则拒绝
	exists, err := s.emailExists(ctx, email)
	if err != nil {
		return err
	}
	if purpose == "register" && exists {
		return ErrEmailExists
	}
	if purpose == "login" && !exists {
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

// verifyEmailCode 校验验证码，成功后立即删除（一次性）
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
		return ErrCodeInvalid
	}
	s.rdb.Del(ctx, emailCodeKey(purpose, email))
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

	payload, err := s.createSessionAndTokens(ctx, u, ip, ua)
	if err != nil {
		return nil, err
	}

	return payload, nil
}

func (s *service) Refresh(ctx context.Context, refreshToken, ip, ua string) (*model.AuthPayload, error) {
	claims, err := s.parseToken(refreshToken, "refresh")
	if err != nil {
		return nil, ErrInvalidToken
	}

	// 从 Redis 验证会话
	if s.rdb != nil {
		sessKey := fmt.Sprintf(keySession, claims.SessionID)
		val, err := s.rdb.Get(ctx, sessKey).Result()
		if err == redis.Nil {
			return nil, ErrTokenRevoked
		}
		if err != nil {
			log.Printf("[auth] redis get session error: %v", err)
			return nil, ErrInvalidToken
		}

		var sess sessionData
		if err := json.Unmarshal([]byte(val), &sess); err != nil {
			return nil, ErrInvalidToken
		}

		// 验证 refresh token hash
		if sess.TokenHash != hashToken(refreshToken) {
			return nil, ErrInvalidToken
		}

		// 删除旧会话（refresh token rotation）
		s.deleteSessionFromRedis(ctx, claims.SessionID, sess.UserID)
	} else {
		// Redis 不可用，回退到 PostgreSQL
		return s.refreshFromPostgres(ctx, claims, refreshToken)
	}

	u := userRow{ID: claims.UserID}
	// 从 PostgreSQL 获取用户信息
	err = s.pool.QueryRow(ctx,
		`SELECT email, display_name FROM users WHERE id = $1 AND deleted_at IS NULL`,
		claims.UserID,
	).Scan(&u.Email, &u.DisplayName)
	if err != nil {
		return nil, ErrInvalidToken
	}

	return s.createSessionAndTokens(ctx, u, ip, ua)
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
		atKey := fmt.Sprintf(keyAccessToken, hashToken(token))
		ctx := context.Background()
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

// ============================================================================
// 内部方法
// ============================================================================

func (s *service) createSessionAndTokens(ctx context.Context, u userRow, ip, ua string) (*model.AuthPayload, error) {
	now := time.Now()

	// 1. 生成 access token
	accessClaims := tokenClaims{
		UserID: u.ID,
		Type:   "access",
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

	// 2. 生成 session ID
	sessionID := generateSessionID()

	// 3. 生成 refresh token
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

	// 4. 存储到 Redis
	if s.rdb != nil {
		// 4a. 存储 access token → userID（用于验证 + 即时撤销）
		atKey := fmt.Sprintf(keyAccessToken, hashToken(accessToken))
		if err := s.rdb.Set(ctx, atKey, u.ID, s.accessTokenTTL).Err(); err != nil {
			log.Printf("[auth] redis set access token error: %v", err)
			// 不中断流程，access token 仍可通过 JWT 签名验证
		}

		// 4b. 存储会话数据（用于 refresh token 验证）
		sess := sessionData{
			UserID:    u.ID,
			TokenHash: hashToken(refreshToken),
			IP:        ip,
			UA:        ua,
		}
		sessBytes, _ := json.Marshal(sess)
		sessKey := fmt.Sprintf(keySession, sessionID)
		if err := s.rdb.Set(ctx, sessKey, string(sessBytes), s.refreshTokenTTL).Err(); err != nil {
			log.Printf("[auth] redis set session error: %v", err)
		}

		// 4c. 用户会话索引（便于管理用户所有会话）
		usKey := fmt.Sprintf(keyUserSessions, u.ID)
		s.rdb.SAdd(ctx, usKey, sessionID)
		s.rdb.Expire(ctx, usKey, s.refreshTokenTTL)
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

// refreshFromPostgres 当 Redis 不可用时回退到 PostgreSQL 验证 refresh
func (s *service) refreshFromPostgres(ctx context.Context, claims *tokenClaims, refreshToken string) (*model.AuthPayload, error) {
	var (
		userID      string
		expiresAt   time.Time
		revokedAt   sql.NullTime
		tokenHash   string
		userEmail   string
		displayName string
	)

	err := s.pool.QueryRow(ctx,
		`SELECT s.user_id, s.expires_at, s.revoked_at, s.refresh_token_hash, u.email, u.display_name
		 FROM auth_sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.id = $1 AND u.deleted_at IS NULL`,
		claims.SessionID,
	).Scan(&userID, &expiresAt, &revokedAt, &tokenHash, &userEmail, &displayName)
	if err != nil {
		return nil, ErrInvalidToken
	}

	if revokedAt.Valid || time.Now().After(expiresAt) {
		return nil, ErrInvalidToken
	}
	if tokenHash != hashToken(refreshToken) {
		return nil, ErrInvalidToken
	}

	// 撤销旧会话
	_, _ = s.pool.Exec(ctx, `UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`, claims.SessionID)

	u := userRow{ID: userID, Email: userEmail, DisplayName: displayName}
	return s.createSessionAndTokens(ctx, u, "", "")
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
