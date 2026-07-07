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
	// PreviousSessionKicked 表示本次登录是否挤掉了该账号在其他设备上的会话（单设备登录）。
	// 前端据此提示「已在其他设备登录，已将其挤下线」。
	PreviousSessionKicked bool `json:"previousSessionKicked,omitempty"`
}
