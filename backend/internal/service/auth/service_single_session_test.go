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

// TestSessionPointerAbsentFailOpen Redis 丢失「当前生效会话」指针时不应误判为被顶号。
// 场景：Redis 重启 / flushall / LRU 驱逐导致指针缺失 → 此时状态歧义，应 fail-open 放行，
// 而不是误导用户「账号已在其他设备登录」。这是单设备登录健壮性的核心保障。
func TestSessionPointerAbsentFailOpen(t *testing.T) {
	svc, cleanup := newTestService(t)
	defer cleanup()
	ctx := context.Background()

	u := userRow{ID: "user-2", Email: "b@c.com", DisplayName: "B"}
	p, err := svc.createSessionAndTokens(ctx, u, "1.1.1.1", "ua1")
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}

	// 模拟 Redis 丢失指针（重启 / 驱逐）
	if err := svc.rdb.Del(ctx, "auth:user_session:user-2").Err(); err != nil {
		t.Fatalf("del pointer failed: %v", err)
	}

	// 旧 token 不应被判定为被踢（fail-open），仅按 JWT 签名 + at key 校验
	if _, err := svc.ParseAccessToken(p.Tokens.AccessToken); err == ErrSessionKicked {
		t.Fatalf("pointer absence must NOT be treated as kicked (fail-open), got ErrSessionKicked")
	}
}

// TestHasOtherDeviceSession 单设备登录两阶段流程：登录前的「他设备」检测。
// - 同 UA 的既有会话 → 视为同设备重登录，无需二次确认（false）
// - 不同 UA 的既有会话 → 他设备，需二次确认（true）
// 仅读取，不踢任何会话；配合 ConfirmLogin 实现「确认后才踢」。
func TestHasOtherDeviceSession(t *testing.T) {
	svc, cleanup := newTestService(t)
	defer cleanup()
	ctx := context.Background()

	u := userRow{ID: "user-3", Email: "d@e.com", DisplayName: "D"}
	// 建立 ua1 会话
	if _, err := svc.createSessionAndTokens(ctx, u, "1.1.1.1", "ua1"); err != nil {
		t.Fatalf("first login failed: %v", err)
	}

	// 同 UA 检测 → false（同设备重登录，不弹确认）
	if svc.hasOtherDeviceSession(ctx, u.ID, "ua1") {
		t.Fatalf("same-UA session must NOT be treated as other device")
	}
	// 不同 UA 检测 → true（他设备，需确认）
	if !svc.hasOtherDeviceSession(ctx, u.ID, "ua2") {
		t.Fatalf("different-UA session must be detected as other device")
	}
}
