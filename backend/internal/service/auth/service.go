package auth

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/config"
	"resumecraft-pdf-backend/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrInvalidToken       = errors.New("invalid token")
	ErrEmailExists        = errors.New("email already exists")
)

type Service interface {
	Register(ctx context.Context, req model.RegisterRequest, ip, ua string) (*model.AuthPayload, error)
	Login(ctx context.Context, req model.LoginRequest, ip, ua string) (*model.AuthPayload, error)
	Refresh(ctx context.Context, refreshToken, ip, ua string) (*model.AuthPayload, error)
	Logout(ctx context.Context, refreshToken string) error
	Me(ctx context.Context, userID string) (*model.AuthUser, error)
	ParseAccessToken(token string) (string, error)
}

type service struct {
	pool            *pgxpool.Pool
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

func NewService(pool *pgxpool.Pool, cfg config.AuthConfig) Service {
	return &service{
		pool:            pool,
		jwtSecret:       []byte(cfg.JWTSecret),
		accessTokenTTL:  cfg.AccessTokenTTL,
		refreshTokenTTL: cfg.RefreshTokenTTL,
	}
}

func (s *service) Register(ctx context.Context, req model.RegisterRequest, ip, ua string) (*model.AuthPayload, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
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
			s.recordLoginAttempt(ctx, email, false, "user_not_found", ip, ua)
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		s.recordLoginAttempt(ctx, email, false, "wrong_password", ip, ua)
		return nil, ErrInvalidCredentials
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

	var (
		userID      string
		expiresAt   time.Time
		revokedAt   sql.NullTime
		tokenHash   string
		userEmail   string
		displayName string
	)

	err = s.pool.QueryRow(ctx,
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

	_, _ = s.pool.Exec(ctx, `UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`, claims.SessionID)

	u := userRow{ID: userID, Email: userEmail, DisplayName: displayName}
	return s.createSessionAndTokens(ctx, u, ip, ua)
}

func (s *service) Logout(ctx context.Context, refreshToken string) error {
	claims, err := s.parseToken(refreshToken, "refresh")
	if err != nil {
		return ErrInvalidToken
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE auth_sessions
		 SET revoked_at = NOW()
		 WHERE id = $1 AND refresh_token_hash = $2 AND revoked_at IS NULL`,
		claims.SessionID, hashToken(refreshToken),
	)
	if err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}
	return nil
}

func (s *service) Me(ctx context.Context, userID string) (*model.AuthUser, error) {
	var u model.AuthUser
	err := s.pool.QueryRow(ctx,
		`SELECT id, email, display_name
		 FROM users
		 WHERE id = $1 AND deleted_at IS NULL`,
		userID,
	).Scan(&u.ID, &u.Email, &u.DisplayName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidToken
		}
		return nil, fmt.Errorf("query me: %w", err)
	}
	return &u, nil
}

func (s *service) ParseAccessToken(token string) (string, error) {
	claims, err := s.parseToken(token, "access")
	if err != nil {
		return "", err
	}
	return claims.UserID, nil
}

func (s *service) createSessionAndTokens(ctx context.Context, u userRow, ip, ua string) (*model.AuthPayload, error) {
	now := time.Now()
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

	sessionID, err := s.createSession(ctx, u.ID, ip, ua)
	if err != nil {
		return nil, err
	}

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

	_, err = s.pool.Exec(ctx,
		`UPDATE auth_sessions SET refresh_token_hash = $1 WHERE id = $2`,
		hashToken(refreshToken), sessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("update refresh token hash: %w", err)
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

func (s *service) createSession(ctx context.Context, userID, ip, ua string) (string, error) {
	var sessionID string
	err := s.pool.QueryRow(ctx,
		`INSERT INTO auth_sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
		 VALUES ($1, '', $2, NULLIF($3, '')::inet, $4)
		 RETURNING id`,
		userID, ua, ip, time.Now().Add(s.refreshTokenTTL),
	).Scan(&sessionID)
	if err != nil {
		return "", fmt.Errorf("create auth session: %w", err)
	}
	return sessionID, nil
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

func (s *service) recordLoginAttempt(ctx context.Context, email string, success bool, reason, ip, ua string) {
	_, _ = s.pool.Exec(ctx,
		`INSERT INTO login_attempt_logs (email, success, reason, ip_address, user_agent)
		 VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, '')::inet, $5)`,
		email, success, reason, ip, ua,
	)
}
