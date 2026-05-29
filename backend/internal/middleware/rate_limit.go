package middleware

import (
	"context"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

type RateLimitClient interface {
	Eval(ctx context.Context, script string, keys []string, args ...interface{}) *redis.Cmd
}

type RateLimitOptions struct {
	Client   RateLimitClient
	Prefix   string
	Capacity int
	Refill   float64
	FailOpen bool
}

const tokenBucketScript = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'updated_at')
local tokens = tonumber(bucket[1])
local updated_at = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  updated_at = now
end

local elapsed = math.max(0, now - updated_at)
tokens = math.min(capacity, tokens + elapsed * refill)
updated_at = now

local allowed = 0
if tokens >= 1 then
  tokens = tokens - 1
  allowed = 1
end

local remaining = math.floor(tokens)
redis.call('HMSET', key, 'tokens', tokens, 'updated_at', updated_at)
redis.call('EXPIRE', key, ttl)

return { allowed, remaining }
`

func RateLimit(opts RateLimitOptions) gin.HandlerFunc {
	return func(c *gin.Context) {
		if opts.Client == nil || opts.Capacity <= 0 || opts.Refill <= 0 {
			c.Next()
			return
		}

		key := fmt.Sprintf("rl:%s:ip:%s", opts.Prefix, c.ClientIP())
		now := float64(time.Now().UnixMilli()) / 1000
		ttl := int(math.Ceil(float64(opts.Capacity)/opts.Refill) * 2)
		if ttl < 1 {
			ttl = 1
		}

		result, err := opts.Client.Eval(c.Request.Context(), tokenBucketScript, []string{key}, opts.Capacity, opts.Refill, now, ttl).Result()
		if err != nil {
			if opts.FailOpen {
				log.Printf("[rate_limit] redis error, allowing request: %v", err)
				c.Next()
				return
			}
			c.JSON(http.StatusServiceUnavailable, gin.H{"message": "rate limit unavailable"})
			c.Abort()
			return
		}

		allowed, remaining, err := parseRateLimitResult(result)
		if err != nil {
			if opts.FailOpen {
				log.Printf("[rate_limit] invalid redis result, allowing request: %v", err)
				c.Next()
				return
			}
			c.JSON(http.StatusServiceUnavailable, gin.H{"message": "rate limit unavailable"})
			c.Abort()
			return
		}

		c.Header("X-RateLimit-Limit", strconv.Itoa(opts.Capacity))
		c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining))

		if !allowed {
			retryAfter := int(math.Ceil((1 - float64(remaining)) / opts.Refill))
			if retryAfter < 1 {
				retryAfter = 1
			}
			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.JSON(http.StatusTooManyRequests, gin.H{"message": "请求过于频繁，请稍后再试"})
			c.Abort()
			return
		}

		c.Next()
	}
}

func parseRateLimitResult(result interface{}) (bool, int, error) {
	items, ok := result.([]interface{})
	if !ok || len(items) < 2 {
		return false, 0, errors.New("unexpected token bucket result")
	}
	allowed, err := toInt64(items[0])
	if err != nil {
		return false, 0, err
	}
	remainingValue, err := toInt64(items[1])
	if err != nil {
		return false, 0, err
	}
	remaining := int(remainingValue)
	if remaining < 0 {
		remaining = 0
	}
	return allowed == 1, remaining, nil
}

func toInt64(value interface{}) (int64, error) {
	switch v := value.(type) {
	case int64:
		return v, nil
	case string:
		return strconv.ParseInt(v, 10, 64)
	default:
		return 0, fmt.Errorf("unexpected integer type %T", value)
	}
}
