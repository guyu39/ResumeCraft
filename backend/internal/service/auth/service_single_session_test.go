package auth

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

// newTestService 用于单设备登录测试。仅依赖 Redis（通过 TEST_REDIS_ADDR 注入），
// pool 置 nil——evict/parse 在 rdb 可用时不触碰 pool。
func newTestService(t *testing.T) (*service, func()) {
	t.Helper()
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("set TEST_REDIS_ADDR to run single-session test (e.g. localhost:6379)")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		t.Fatalf("redis ping failed: %v", err)
	}
	svc := &service{
		rdb:             rdb,
		jwtSecret:       []byte("test-secret"),
		accessTokenTTL:  15 * time.Minute,
		refreshTokenTTL: 7 * 24 * time.Hour,
	}
	return svc, func() { _ = rdb.Close() }
}

// TestSingleSessionKicksPrevious 同一用户二次登录后，旧会话应被判定为被顶号。
func TestSingleSessionKicksPrevious(t *testing.T) {
	svc, cleanup := newTestService(t)
	defer cleanup()
	ctx := context.Background()

	u := userRow{ID: "user-1", Email: "a@b.com", DisplayName: "A"}

	p1, err := svc.createSessionAndTokens(ctx, u, "1.1.1.1", "ua1")
	if err != nil {
		t.Fatalf("first login failed: %v", err)
	}
	p2, err := svc.createSessionAndTokens(ctx, u, "2.2.2.2", "ua2")
	if err != nil {
		t.Fatalf("second login failed: %v", err)
	}

	// 旧设备 access token 应被判定为被踢
	if _, err := svc.ParseAccessToken(p1.Tokens.AccessToken); err != ErrSessionKicked {
		t.Fatalf("old token should be kicked, got %v", err)
	}
	// 新设备 access token 仍有效
	if _, err := svc.ParseAccessToken(p2.Tokens.AccessToken); err != nil {
		t.Fatalf("new token should be valid, got %v", err)
	}

	// 在线集合应仅保留新会话
	members, err := svc.rdb.SMembers(ctx, "auth:us:user-1").Result()
	if err != nil {
		t.Fatalf("smembers error: %v", err)
	}
	if len(members) != 1 {
		t.Fatalf("expected 1 online session, got %d: %v", len(members), members)
	}
}
