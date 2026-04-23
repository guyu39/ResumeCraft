package model

// AIProvider AI 服务商类型
type AIProvider string

const (
	AIProviderDoubao   AIProvider = "doubao"
	AIProviderKimi     AIProvider = "kimi"
	AIProviderMiniMax  AIProvider = "minimax"
	AIProviderDeepSeek AIProvider = "deepseek"
	AIProviderZhipu    AIProvider = "zhipu"
	AIProviderQwen     AIProvider = "qwen"
	AIProviderWenxin      AIProvider = "wenxin"
	AIProviderSpark      AIProvider = "spark"
	AIProviderSiliconFlow AIProvider = "siliconflow"
	AIProviderOpenAI    AIProvider = "openai"
	AIProviderClaude    AIProvider = "claude"
	AIProviderGemini    AIProvider = "gemini"
	AIProviderCustom    AIProvider = "custom"
)

// DefaultBaseURLs 默认 BaseURL 映射
var DefaultBaseURLs = map[AIProvider]string{
	AIProviderDoubao:     "/api/ark",
	AIProviderKimi:       "https://api.moonshot.cn/v1",
	AIProviderMiniMax:    "https://api.minimax.chat/v1",
	AIProviderDeepSeek:   "https://api.deepseek.com/v1",
	AIProviderZhipu:      "https://open.bigmodel.cn/api/paas/v4",
	AIProviderQwen:       "https://dashscope.aliyuncs.com/compatible-mode/v1",
	AIProviderWenxin:     "https://qianfan.baidubce.com/v2",
	AIProviderSpark:      "https://spark-api.xf-yun.com/v4.0/chat",
	AIProviderSiliconFlow: "https://api.siliconflow.cn/v1",
	AIProviderOpenAI:     "https://api.openai.com/v1",
	AIProviderClaude:     "https://api.anthropic.com/v1",
	AIProviderGemini:     "https://generativelanguage.googleapis.com/v1beta/openai/",
}

// AIConfig AI 配置
type AIConfig struct {
	ID           string     `json:"id"`
	UserID       *string    `json:"userId,omitempty"`
	Provider     AIProvider `json:"provider"`
	BaseURL      string     `json:"baseUrl"`
	DefaultModel string     `json:"defaultModel"`
	Enabled      bool       `json:"enabled"`
	IsGlobal     bool       `json:"isGlobal"`
	CreatedAt    int64      `json:"createdAt"`
	UpdatedAt    int64      `json:"updatedAt"`
}

// AIConfigRequest 保存 AI 配置请求
type AIConfigRequest struct {
	Provider     AIProvider `json:"provider" binding:"required"`
	APIKey       string     `json:"apiKey" binding:"required"`
	BaseURL      string     `json:"baseUrl"`
	DefaultModel string     `json:"defaultModel" binding:"required"`
	Enabled      *bool      `json:"enabled"`
	IsGlobal     *bool      `json:"isGlobal"`
}

// ConversationType 会话类型
type ConversationType string

const (
	ConversationTypeEvaluate ConversationType = "evaluate"
	ConversationTypeSuggest ConversationType = "suggest"
	ConversationTypeRewrite ConversationType = "rewrite"
)

// AIConversation AI 对话会话
type AIConversation struct {
	ID                string            `json:"id"`
	UserID            string            `json:"userId"`
	ResumeID          *string           `json:"resumeId,omitempty"`
	Type              ConversationType  `json:"type"`
	Title             *string           `json:"title,omitempty"`
	Context           map[string]any   `json:"context,omitempty"`
	ModuleType        string            `json:"moduleType,omitempty"`
	ModuleInstanceID  string            `json:"moduleInstanceId,omitempty"`
	CreatedAt         int64             `json:"createdAt"`
	UpdatedAt         int64             `json:"updatedAt"`
	Messages          []AIMessage       `json:"messages,omitempty"`
}

// AIMessage AI 消息
type AIMessage struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversationId"`
	Role           string    `json:"role"` // user, assistant, system
	Content        string    `json:"content"`
	Model          *string   `json:"model,omitempty"`
	InputTokens    *int      `json:"inputTokens,omitempty"`
	OutputTokens   *int      `json:"outputTokens,omitempty"`
	CreatedAt      int64     `json:"createdAt"`
}

// EvaluateRequest 评估请求
type EvaluateRequest struct {
	ResumeID    string                 `json:"resumeId" binding:"required"`
	Content     map[string]interface{} `json:"content" binding:"required"`
	OnProgress  bool                  `json:"onProgress"`
}

// EvaluateResponse 评估响应
type EvaluateResponse struct {
	OverallScore   int                    `json:"overallScore"`
	Level          string                 `json:"level"`
	Summary        string                 `json:"summary"`
	Dimensions     []EvaluateDimension     `json:"dimensions"`
	Issues         []EvaluateIssue        `json:"issues"`
	ActionItems    []string               `json:"actionItems"`
	ReasoningSteps []string               `json:"reasoningSteps,omitempty"`
	RawText        string                 `json:"rawText,omitempty"`
	Model          string                 `json:"model"`
	ConversationID string                 `json:"conversationId"`
}

// EvaluateDimension 评估维度
type EvaluateDimension struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Score    int    `json:"score"`
	Comment  string `json:"comment"`
}

// EvaluateIssue 评估问题
type EvaluateIssue struct {
	ID          string `json:"id"`
	Severity    string `json:"severity"` // high, medium, low
	Title       string `json:"title"`
	Description string `json:"description"`
	Suggestion  string `json:"suggestion"`
}

// SuggestRequest 润色请求
type SuggestRequest struct {
	ResumeID         string `json:"resumeId" binding:"required"`
	ModuleType      string `json:"moduleType" binding:"required"`
	ModuleInstanceID string `json:"moduleInstanceId" binding:"required"`
	FieldKey        string `json:"fieldKey" binding:"required"`
	Content         string `json:"content" binding:"required"`
	ContentHash     string `json:"contentHash"`
	OnProgress      bool   `json:"onProgress"`
}

// SuggestResponse 润色响应
type SuggestResponse struct {
	Suggestions    []SuggestItem `json:"suggestions"`
	RawText        string        `json:"rawText,omitempty"`
	Model          string        `json:"model"`
	ConversationID string        `json:"conversationId"`
	FromCache      bool          `json:"fromCache"`
}

// SuggestItem 单条润色建议
type SuggestItem struct {
	Content string `json:"content"`
	Reason  string `json:"reason"`
}

// ConversationListResponse 会话列表响应
type ConversationListResponse struct {
	Items      []AIConversation `json:"items"`
	Pagination Pagination       `json:"pagination"`
}

// SuggestRecord 润色记录
type SuggestRecord struct {
	ID               string        `json:"id"`
	UserID           string        `json:"userId"`
	ResumeID         string        `json:"resumeId,omitempty"`
	ConversationID   string        `json:"conversationId,omitempty"`
	ModuleType       string        `json:"moduleType"`
	ModuleInstanceID string        `json:"moduleInstanceId,omitempty"`
	FieldKey         string        `json:"fieldKey"`
	OriginalContent  string        `json:"originalContent"`
	OptimizedContent string        `json:"optimizedContent,omitempty"`
	Suggestions      []SuggestItem `json:"suggestions,omitempty"`
	CreatedAt        int64         `json:"createdAt"`
}

// SuggestRecordListResponse 润色记录列表响应
type SuggestRecordListResponse struct {
	Items []SuggestRecord `json:"items"`
}

// SaveSuggestRecordRequest 保存润色记录的请求
type SaveSuggestRecordRequest struct {
	ResumeID         string
	ConversationID   string
	ModuleType       string
	ModuleInstanceID string
	FieldKey         string
	OriginalContent  string
	OptimizedContent string
	Suggestions      []SuggestItem
}
