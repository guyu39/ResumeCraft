package model

type SendCodeRequest struct {
	Email   string `json:"email" binding:"required,email,max=255"`
	Purpose string `json:"purpose" binding:"required,oneof=register login change_password"`
}

type RegisterRequest struct {
	Email       string `json:"email" binding:"required,email,max=255"`
	Password    string `json:"password" binding:"required,min=8,max=72"`
	Code        string `json:"code" binding:"required"`
	DisplayName string `json:"displayName" binding:"max=100"`
}

type LoginRequest struct {
	Email     string `json:"email" binding:"required,email,max=255"`
	LoginType string `json:"loginType"` // password | code，空默认 password
	Password  string `json:"password" binding:"max=72"`
	Code      string `json:"code"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

type LogoutRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
	AccessToken  string `json:"accessToken"` // 用于即时撤销 access token
}

type ChangePasswordRequest struct {
	NewPassword string `json:"newPassword" binding:"required,min=8,max=72"`
	Code        string `json:"code" binding:"required"`
}

type AuthTokens struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int64  `json:"expiresIn"`
}

type AuthUser struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	AvatarURL   string `json:"avatarUrl,omitempty"`
}

type AuthPayload struct {
	User   AuthUser   `json:"user"`
	Tokens AuthTokens `json:"tokens"`
	// 单设备登录：检测到该账号在其他设备上有在线会话。
	// 为 true 时不签发 token、不踢旧设备，仅返回短效 LoginTicket；
	// 前端需弹二次确认，用户点「是我，继续」后用 LoginTicket 调
	// POST /auth/login/confirm 完成登录（此时才创建会话并踢掉旧设备）。
	// 「不是我」则丢弃 ticket，旧设备完全不受影响。
	RequiresKickConfirm bool   `json:"requiresKickConfirm,omitempty"`
	LoginTicket         string `json:"loginTicket,omitempty"`
}

// ConfirmLoginRequest 二次确认完成登录（单设备登录两阶段流程的第二步）
type ConfirmLoginRequest struct {
	Ticket string `json:"ticket" binding:"required"`
}
