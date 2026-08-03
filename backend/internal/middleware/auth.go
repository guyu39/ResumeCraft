package middleware

import (
	"errors"
	"net/http"
	"strings"

	"resumecraft-pdf-backend/internal/requestmeta"
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
			if errors.Is(err, auth.ErrSessionKicked) {
				// 单设备登录：当前账号已在其他设备登录，本端会话被顶号
				response.JSONError(c, http.StatusUnauthorized, "SESSION_KICKED", "账号已在其他设备登录")
			} else {
				response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
			}
			c.Abort()
			return
		}

		c.Set(ContextUserIDKey, userID)
		c.Request = c.Request.WithContext(requestmeta.WithActor(c.Request.Context(), userID))
		c.Next()
	}
}

// OptionalAuth 与 AuthRequired 类似，但未登录、Token 缺失或校验失败时不拦截请求，
// 仅在成功解析出 userID 时写入 Context；用于「登录可用/未登录也可访问」的公开接口
// （如招聘聚合列表，需要在登录态下带出当前用户的个性化标记）。
func OptionalAuth(authService auth.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := strings.TrimSpace(c.GetHeader("Authorization"))
		if !strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			c.Next()
			return
		}
		token := strings.TrimSpace(authHeader[len("Bearer "):])
		if token == "" {
			c.Next()
			return
		}
		userID, err := authService.ParseAccessToken(token)
		if err != nil {
			c.Next()
			return
		}
		c.Set(ContextUserIDKey, userID)
		c.Request = c.Request.WithContext(requestmeta.WithActor(c.Request.Context(), userID))
		c.Next()
	}
}
