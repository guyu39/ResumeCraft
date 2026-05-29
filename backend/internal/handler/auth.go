package handler

import (
	"log"
	"net/http"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

func (h *Handler) Register(c *gin.Context) {
	log.Printf("[auth] Register called, authService is nil: %v", h.authService == nil)
	if h.authService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AUTH_DISABLED", "登录功能未启用")
		return
	}

	var req model.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[auth] Register parse error: %v", err)
		response.JSONError(c, http.StatusBadRequest, "INVALID_PARAMS", "参数格式错误")
		return
	}

	log.Printf("[auth] Register email: %s", req.Email)
	payload, err := h.authService.Register(c.Request.Context(), req, clientIP(c), c.GetHeader("User-Agent"))
	if err != nil {
		log.Printf("[auth] Register failed: %v", err)
		switch err {
		case auth.ErrEmailExists:
			response.JSONError(c, http.StatusConflict, "EMAIL_EXISTS", "该邮箱已注册")
		default:
			response.JSONError(c, http.StatusInternalServerError, "REGISTER_FAILED", "注册失败")
		}
		return
	}

	log.Printf("[auth] Register success: %s", payload.User.ID)
	response.JSONSuccess(c, payload)
}

func (h *Handler) Login(c *gin.Context) {
	log.Printf("[auth] Login called, authService is nil: %v", h.authService == nil)
	if h.authService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AUTH_DISABLED", "登录功能未启用")
		return
	}

	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[auth] Login parse error: %v", err)
		response.JSONError(c, http.StatusBadRequest, "INVALID_PARAMS", "参数格式错误")
		return
	}

	log.Printf("[auth] Login email: %s", req.Email)
	payload, err := h.authService.Login(c.Request.Context(), req, clientIP(c), c.GetHeader("User-Agent"))
	if err != nil {
		log.Printf("[auth] Login failed: %v", err)
		switch err {
		case auth.ErrInvalidCredentials:
			response.JSONError(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "账号或密码错误")
		default:
			response.JSONError(c, http.StatusInternalServerError, "LOGIN_FAILED", "登录失败")
		}
		return
	}

	log.Printf("[auth] Login success: %s", payload.User.ID)
	response.JSONSuccess(c, payload)
}

func (h *Handler) Refresh(c *gin.Context) {
	if h.authService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AUTH_DISABLED", "登录功能未启用")
		return
	}

	var req model.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "INVALID_PARAMS", "参数格式错误")
		return
	}

	payload, err := h.authService.Refresh(c.Request.Context(), req.RefreshToken, clientIP(c), c.GetHeader("User-Agent"))
	if err != nil {
		switch err {
		case auth.ErrTokenRevoked:
			response.JSONError(c, http.StatusUnauthorized, "TOKEN_REVOKED", "令牌已撤销")
		default:
			response.JSONError(c, http.StatusUnauthorized, "INVALID_REFRESH_TOKEN", "刷新令牌无效")
		}
		return
	}

	response.JSONSuccess(c, payload)
}

func (h *Handler) Logout(c *gin.Context) {
	if h.authService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AUTH_DISABLED", "登录功能未启用")
		return
	}

	var req model.LogoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "INVALID_PARAMS", "参数格式错误")
		return
	}

	// 优先从请求体获取 accessToken，若为空则从 Authorization header 获取
	accessToken := req.AccessToken
	if accessToken == "" {
		authHeader := c.GetHeader("Authorization")
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			accessToken = authHeader[7:]
		}
	}

	if err := h.authService.Logout(c.Request.Context(), accessToken, req.RefreshToken); err != nil {
		// Logout 不因 token 无效而报错，客户端已清除本地状态
		log.Printf("[auth] Logout warning: %v", err)
	}

	response.JSONSuccess(c, gin.H{"loggedOut": true})
}

func (h *Handler) Me(c *gin.Context) {
	if h.authService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AUTH_DISABLED", "登录功能未启用")
		return
	}

	userIDAny, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	userID, _ := userIDAny.(string)
	user, err := h.authService.Me(c.Request.Context(), userID)
	if err != nil {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录或登录已过期")
		return
	}

	response.JSONSuccess(c, user)
}

// clientIP 获取客户端 IP。
// 不再无条件信任 X-Forwarded-For，使用 Gin 的 ClientIP() 方法。
// 当部署在可信反向代理后时，应通过 Engine.SetTrustedProxies() 配置。
func clientIP(c *gin.Context) string {
	return c.ClientIP()
}
