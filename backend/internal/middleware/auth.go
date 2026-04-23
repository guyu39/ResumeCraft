package middleware

import (
	"net/http"
	"strings"

	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

const ContextUserIDKey = "userID"

func AuthRequired(authService auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
			c.Abort()
			return
		}

		token := strings.TrimSpace(authHeader[len("Bearer "):])
		if token == "" {
			response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
			c.Abort()
			return
		}

		userID, err := authService.ParseAccessToken(token)
		if err != nil {
			response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
			c.Abort()
			return
		}

		c.Set(ContextUserIDKey, userID)
		c.Next()
	}
}
