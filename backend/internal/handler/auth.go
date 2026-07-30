package handler

import (
	"errors"
	"log"
	"net/http"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/auth"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// SendCode 发送邮箱验证码（注册/登录/修改密码）
func (h *Handler) SendCode(c *gin.Context) {
	if h.authService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AUTH_DISABLED", "登录功能未启用")
		return
	}
	var req model.SendCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "INVALID_PARAMS", "参数格式错误")
		return
	}
	err := h.authService.SendEmailCode(c.Request.Context(), req.Email, req.Purpose)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrEmailExists):
			response.JSONError(c, http.StatusConflict, "EMAIL_EXISTS", "该邮箱已注册，请直接登录")
		case errors.Is(err, auth.ErrEmailNotRegistered):
			response.JSONError(c, http.StatusNotFound, "EMAIL_NOT_REGISTERED", "该邮箱未注册，请先注册")
		case errors.Is(err, auth.ErrCodeTooFrequent):
			response.JSONError(c, http.StatusTooManyRequests, "CODE_TOO_FREQUENT", "验证码发送过于频繁，请稍后再试")
		case errors.Is(err, auth.ErrSMTPNotConfigured):
			response.JSONError(c, http.StatusServiceUnavailable, "SMTP_NOT_CONFIGURED", "邮件服务未配置，无法发送验证码")
		case errors.Is(err, auth.ErrCodeUnavailable):
			response.JSONError(c, http.StatusServiceUnavailable, "CODE_UNAVAILABLE", "验证码服务暂不可用")
		default:
			log.Printf("[auth] SendCode failed: %v", err)
			response.JSONError(c, http.StatusInternalServerError, "SEND_CODE_FAILED", "发送验证码失败")
		}
		return
	}
	response.JSONSuccess(c, gin.H{"sent": true})
}

func (h *Handler) Register(c *gin.Context) {
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

	payload, err := h.authService.Register(c.Request.Context(), req, clientIP(c), c.GetHeader("User-Agent"))
	if err != nil {
		log.Printf("[auth] Register failed: %v", err)
		switch {
		case errors.Is(err, auth.ErrEmailExists):
			response.JSONError(c, http.StatusConflict, "EMAIL_EXISTS", "该邮箱已注册")
		case errors.Is(err, auth.ErrCodeInvalid):
			response.JSONError(c, http.StatusBadRequest, "CODE_INVALID", "验证码错误或已过期")
		case errors.Is(err, auth.ErrCodeUnavailable):
			response.JSONError(c, http.StatusServiceUnavailable, "CODE_UNAVAILABLE", "验证码服务暂不可用")
		default:
			response.JSONError(c, http.StatusInternalServerError, "REGISTER_FAILED", "注册失败")
		}
		return
	}

	response.JSONSuccess(c, payload)
}

func (h *Handler) Login(c *gin.Context) {
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

	payload, err := h.authService.Login(c.Request.Context(), req, clientIP(c), c.GetHeader("User-Agent"))
	if err != nil {
		log.Printf("[auth] Login failed: %v", err)
		switch {
		case errors.Is(err, auth.ErrInvalidCredentials):
			response.JSONError(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "账号或密码错误")
		case errors.Is(err, auth.ErrCodeInvalid):
			response.JSONError(c, http.StatusUnauthorized, "CODE_INVALID", "验证码错误或已过期")
		case errors.Is(err, auth.ErrEmailNotRegistered):
			response.JSONError(c, http.StatusNotFound, "EMAIL_NOT_REGISTERED", "该邮箱未注册，请先注册")
		case errors.Is(err, auth.ErrCodeUnavailable):
			response.JSONError(c, http.StatusServiceUnavailable, "CODE_UNAVAILABLE", "验证码服务暂不可用")
		default:
			response.JSONError(c, http.StatusInternalServerError, "LOGIN_FAILED", "登录失败")
		}
		return
	}

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
		switch {
		case errors.Is(err, auth.ErrTokenRevoked):
			response.JSONError(c, http.StatusUnauthorized, "TOKEN_REVOKED", "令牌已撤销")
		case errors.Is(err, auth.ErrSessionStoreUnavailable):
			log.Printf("[auth] Refresh session store unavailable: %v", err)
			response.JSONError(c, http.StatusServiceUnavailable, "AUTH_SESSION_UNAVAILABLE", "登录服务暂时不可用，请稍后重试")
		default:
			response.JSONError(c, http.StatusUnauthorized, "INVALID_REFRESH_TOKEN", "刷新令牌无效")
		}
		return
	}

	response.JSONSuccess(c, payload)
}

// ConfirmLogin 单设备登录两阶段流程第二步：用户在前端确认「是我，继续」后，
// 用 Login 返回的 ticket 完成登录（此时才创建会话并踢掉他设备）。
func (h *Handler) ConfirmLogin(c *gin.Context) {
	if h.authService == nil {
		response.JSONError(c, http.StatusServiceUnavailable, "AUTH_DISABLED", "登录功能未启用")
		return
	}

	var req model.ConfirmLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "INVALID_PARAMS", "参数格式错误")
		return
	}

	payload, err := h.authService.ConfirmLogin(c.Request.Context(), req.Ticket, clientIP(c), c.GetHeader("User-Agent"))
	if err != nil {
		log.Printf("[auth] ConfirmLogin failed: %v", err)
		response.JSONError(c, http.StatusUnauthorized, "INVALID_TICKET", "确认凭证无效或已过期，请重新登录")
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

// ChangePassword 修改密码（需邮箱验证码）
func (h *Handler) ChangePassword(c *gin.Context) {
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

	var req model.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.JSONError(c, http.StatusBadRequest, "INVALID_PARAMS", "参数格式错误")
		return
	}

	err := h.authService.ChangePassword(c.Request.Context(), userID, req)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrCodeInvalid):
			response.JSONError(c, http.StatusBadRequest, "CODE_INVALID", "验证码错误或已过期")
		case errors.Is(err, auth.ErrCodeUnavailable):
			response.JSONError(c, http.StatusServiceUnavailable, "CODE_UNAVAILABLE", "验证码服务暂不可用")
		default:
			log.Printf("[auth] ChangePassword failed: %v", err)
			response.JSONError(c, http.StatusInternalServerError, "CHANGE_PASSWORD_FAILED", "修改密码失败")
		}
		return
	}

	response.JSONSuccess(c, gin.H{"changed": true})
}

// clientIP 获取客户端 IP。
// 不再无条件信任 X-Forwarded-For，使用 Gin 的 ClientIP() 方法。
// 当部署在可信反向代理后时，应通过 Engine.SetTrustedProxies() 配置。
func clientIP(c *gin.Context) string {
	return c.ClientIP()
}
