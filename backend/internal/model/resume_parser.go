package model

// ResumeParserConfig 简历解析专用 AI 配置
type ResumeParserConfig struct {
	ID        string     `json:"id"`
	UserID    *string    `json:"userId,omitempty"`
	Provider  AIProvider `json:"provider"`
	BaseURL   string     `json:"baseUrl"`
	Model     string     `json:"model"`
	HasAPIKey bool       `json:"hasApiKey"`
	Enabled   bool       `json:"enabled"`
	CreatedAt int64      `json:"createdAt"`
	UpdatedAt int64      `json:"updatedAt"`
}

// ResumeParserConfigRequest 保存简历解析配置请求
type ResumeParserConfigRequest struct {
	Provider AIProvider `json:"provider" binding:"required"`
	APIKey   string     `json:"apiKey"`
	BaseURL  string     `json:"baseUrl"`
	Model    string     `json:"model" binding:"required"`
}
