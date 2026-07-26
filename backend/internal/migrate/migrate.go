package migrate

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RunMigrations 在后端启动时自动执行 migrations 目录下的所有 *.sql 文件（按文件名升序）。
// 通过 schema_migrations 跟踪表确保每份迁移只执行一次，未执行过的新迁移会在启动时被自动补齐，
// 避免“漏跑迁移导致接口 500”的问题。
//
// 约定：迁移文件必须幂等（使用 IF NOT EXISTS / DROP IF EXISTS），并可重复执行。
func RunMigrations(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	if dir == "" {
		dir = resolveMigrationsDir()
	}
	if _, err := os.Stat(dir); err != nil {
		return fmt.Errorf("migrations dir not found: %s", dir)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read migrations dir %s: %w", dir, err)
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		files = append(files, e.Name())
	}
	if len(files) == 0 {
		log.Printf("[migrate] no .sql files in %s, nothing to do", dir)
		return nil
	}
	sort.Strings(files)

	// 跟踪表：记录已应用的迁移，保证每份只跑一次
	if _, err := pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name       TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	for _, f := range files {
		var applied bool
		if err := pool.QueryRow(ctx,
			`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)`, f,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", f, err)
		}
		if applied {
			log.Printf("[migrate] skip (already applied): %s", f)
			continue
		}

		content, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			return fmt.Errorf("read migration %s: %w", f, err)
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", f, err)
		}
		if _, err := tx.Exec(ctx, string(content)); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("apply migration %s: %w", f, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, f); err != nil {
			_ = tx.Rollback(ctx)
			return fmt.Errorf("record migration %s: %w", f, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit migration %s: %w", f, err)
		}
		log.Printf("[migrate] applied: %s", f)
	}
	return nil
}

// resolveMigrationsDir 依次尝试若干候选路径（兼容从 backend/ 或项目根启动）。
func resolveMigrationsDir() string {
	candidates := []string{
		os.Getenv("MIGRATIONS_DIR"),
		"migrations",
		"../migrations",
		filepath.Join("..", "..", "migrations"),
	}
	for _, c := range candidates {
		if c == "" {
			continue
		}
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			return c
		}
	}
	return "migrations" // 兜底，交由调用方报错
}
