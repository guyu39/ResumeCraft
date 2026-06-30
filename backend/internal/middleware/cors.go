package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CORS 按白名单回显 Origin。allowedOrigins 为空时回退 "*"（仅开发用，
// 此时不允许携带凭据；生产应通过 CORS_ALLOWED_ORIGINS 配置白名单）。
func CORS(allowedOrigins []string) gin.HandlerFunc {
	allowSet := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowSet[o] = true
	}
	wildcard := len(allowSet) == 0

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if wildcard {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin != "" && allowSet[origin] {
			// 命中白名单才回显具体 origin，并允许携带凭据
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Add("Vary", "Origin")
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
