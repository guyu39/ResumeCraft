package model

// AIProvider AI 服务商类型
type AIProvider string

const (
	AIProviderDoubao      AIProvider = "doubao"
	AIProviderKimi        AIProvider = "kimi"
	AIProviderMiniMax     AIProvider = "minimax"
	AIProviderDeepSeek    AIProvider = "deepseek"
	AIProviderZhipu       AIProvider = "zhipu"
	AIProviderQwen        AIProvider = "qwen"
	AIProviderWenxin      AIProvider = "wenxin"
	AIProviderSpark       AIProvider = "spark"
	AIProviderSiliconFlow AIProvider = "siliconflow"
	AIProviderOpenAI      AIProvider = "openai"
	AIProviderClaude      AIProvider = "claude"
	AIProviderGemini      AIProvider = "gemini"
	AIProviderCustom      AIProvider = "custom"
)

// DefaultBaseURLs 默认 BaseURL 映射
var DefaultBaseURLs = map[AIProvider]string{
	AIProviderDoubao:      "/api/ark",
	AIProviderKimi:        "https://api.moonshot.cn/v1",
	AIProviderMiniMax:     "https://api.minimax.chat/v1",
	AIProviderDeepSeek:    "https://api.deepseek.com/v1",
	AIProviderZhipu:       "https://open.bigmodel.cn/api/paas/v4",
	AIProviderQwen:        "https://dashscope.aliyuncs.com/compatible-mode/v1",
	AIProviderWenxin:      "https://qianfan.baidubce.com/v2",
	AIProviderSpark:       "https://spark-api.xf-yun.com/v4.0/chat",
	AIProviderSiliconFlow: "https://api.siliconflow.cn/v1",
	AIProviderOpenAI:      "https://api.openai.com/v1",
	AIProviderClaude:      "https://api.anthropic.com/v1",
	AIProviderGemini:      "https://generativelanguage.googleapis.com/v1beta/openai/",
}

// AIConfig AI 配置
type AIConfig struct {
	ID           string     `json:"id"`
	UserID       *string    `json:"userId,omitempty"`
	Provider     AIProvider `json:"provider"`
	BaseURL      string     `json:"baseUrl"`
	DefaultModel string     `json:"defaultModel"`
	HasAPIKey    bool       `json:"hasApiKey"`
	Enabled      bool       `json:"enabled"`
	IsGlobal     bool       `json:"isGlobal"`
	CreatedAt    int64      `json:"createdAt"`
	UpdatedAt    int64      `json:"updatedAt"`
}

// AIConfigRequest 保存 AI 配置请求
type AIConfigRequest struct {
	Provider     AIProvider `json:"provider" binding:"required"`
	APIKey       string     `json:"apiKey"`
	BaseURL      string     `json:"baseUrl"`
	DefaultModel string     `json:"defaultModel" binding:"required"`
	Enabled      *bool      `json:"enabled"`
	IsGlobal     *bool      `json:"isGlobal"`
}

// ConversationType 会话类型
type ConversationType string

const (
	ConversationTypeEvaluate    ConversationType = "evaluate"
	ConversationTypeSuggest     ConversationType = "suggest"
	ConversationTypeRewrite     ConversationType = "rewrite"
	ConversationTypeJDMatch     ConversationType = "jd_match"
	ConversationTypeCoverLetter ConversationType = "cover_letter"
	ConversationTypeTranslate   ConversationType = "translate"
	ConversationTypeInterview   ConversationType = "interview_prep"
)

// AIConversation AI 对话会话
type AIConversation struct {
	ID                string           `json:"id"`
	UserID            string           `json:"userId"`
	ResumeID          *string          `json:"resumeId,omitempty"`
	SnapshotVersionID *string          `json:"snapshotVersionId,omitempty"`
	Type              ConversationType `json:"type"`
	Title             *string          `json:"title,omitempty"`
	Context           map[string]any   `json:"context,omitempty"`
	ModuleType        string           `json:"moduleType,omitempty"`
	ModuleInstanceID  string           `json:"moduleInstanceId,omitempty"`
	CreatedAt         int64            `json:"createdAt"`
	UpdatedAt         int64            `json:"updatedAt"`
	Messages          []AIMessage      `json:"messages,omitempty"`
}

// AIMessage AI 消息
type AIMessage struct {
	ID             string  `json:"id"`
	ConversationID string  `json:"conversationId"`
	Role           string  `json:"role"` // user, assistant, system
	Content        string  `json:"content"`
	Model          *string `json:"model,omitempty"`
	InputTokens    *int    `json:"inputTokens,omitempty"`
	OutputTokens   *int    `json:"outputTokens,omitempty"`
	CreatedAt      int64   `json:"createdAt"`
}

// EvaluateRequest 评估请求
type EvaluateRequest struct {
	ResumeID          string                 `json:"resumeId" binding:"required"`
	SnapshotVersionID *string                `json:"snapshotVersionId,omitempty"`
	Content           map[string]interface{} `json:"content" binding:"required"`
	OnProgress        bool                   `json:"onProgress"`
}

// EvaluateResponse 评估响应
type EvaluateResponse struct {
	OverallScore   int                 `json:"overallScore"`
	Level          string              `json:"level"`
	Summary        string              `json:"summary"`
	Dimensions     []EvaluateDimension `json:"dimensions"`
	Issues         []EvaluateIssue     `json:"issues"`
	ActionItems    []string            `json:"actionItems"`
	ReasoningSteps []string            `json:"reasoningSteps,omitempty"`
	RawText        string              `json:"rawText,omitempty"`
	Model          string              `json:"model"`
	ConversationID string              `json:"conversationId"`
}

// EvaluateDimension 评估维度
type EvaluateDimension struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Score   int    `json:"score"`
	Comment string `json:"comment"`
}

// EvaluateIssue 评估问题
type EvaluateIssue struct {
	ID          string `json:"id"`
	Severity    string `json:"severity"` // high, medium, low
	Title       string `json:"title"`
	Description string `json:"description"`
	Suggestion  string `json:"suggestion"`
}

// JDMatchRequest JD 匹配请求
type JDMatchRequest struct {
	ResumeID          string                 `json:"resumeId" binding:"required"`
	SnapshotVersionID *string                `json:"snapshotVersionId,omitempty"`
	Content           map[string]interface{} `json:"content" binding:"required"`
	JDText            string                 `json:"jdText" binding:"required"`
	TargetTitle       string                 `json:"targetTitle"`
	CompanyName       string                 `json:"companyName"`
}

// JDMatchResponse JD 匹配响应
type JDMatchResponse struct {
	MatchScore        int                  `json:"matchScore"`
	Level             string               `json:"level"`
	Summary           string               `json:"summary"`
	KeywordMatches    []JDKeywordMatch     `json:"keywordMatches"`
	Strengths         []string             `json:"strengths"`
	Gaps              []JDGap              `json:"gaps"`
	ResumeSuggestions []JDResumeSuggestion `json:"resumeSuggestions"`
	ActionItems       []string             `json:"actionItems"`
	JDText            string               `json:"jdText,omitempty"`
	TargetTitle       string               `json:"targetTitle,omitempty"`
	CompanyName       string               `json:"companyName,omitempty"`
	RawText           string               `json:"rawText,omitempty"`
	Model             string               `json:"model"`
	ConversationID    string               `json:"conversationId"`
}

// JDKeywordMatch JD 关键词匹配项
type JDKeywordMatch struct {
	Keyword  string `json:"keyword"`
	Required bool   `json:"required"`
	Matched  bool   `json:"matched"`
	Evidence string `json:"evidence"`
}

// JDGap JD 匹配缺口
type JDGap struct {
	Severity        string `json:"severity"`
	Requirement     string `json:"requirement"`
	CurrentEvidence string `json:"currentEvidence"`
	Suggestion      string `json:"suggestion"`
}

// JDResumeSuggestion JD 匹配简历修改建议
type JDResumeSuggestion struct {
	ModuleType string `json:"moduleType"`
	Title      string `json:"title"`
	Suggestion string `json:"suggestion"`
}

// JDScoreRequest JD 深度评分请求
type JDScoreRequest struct {
	ResumeID          string                 `json:"resumeId" binding:"required"`
	Content           map[string]interface{} `json:"content" binding:"required"`
	JDText            string                 `json:"jdText" binding:"required"`
	TargetTitle       string                 `json:"targetTitle"`
	CompanyName       string                 `json:"companyName"`
	SnapshotVersionID *string                `json:"snapshotVersionId,omitempty"`
}

// JDParsedResult JD 结构化抽取结果
type JDParsedResult struct {
	JobTitle               string                    `json:"jobTitle"`
	Company                string                    `json:"company"`
	SeniorityLevel         string                    `json:"seniorityLevel"`
	EmploymentType         string                    `json:"employmentType"`
	HardSkills             []JDSkillRequirement      `json:"hardSkills"`
	SoftSkills             []JDSkillRequirement      `json:"softSkills"`
	Tools                  []JDSkillRequirement      `json:"tools"`
	Domains                []JDSkillRequirement      `json:"domains"`
	ExperienceRequirements []JDExperienceRequirement `json:"experienceRequirements"`
	EducationRequirement   *JDEducationRequirement   `json:"educationRequirement,omitempty"`
	Certifications         []string                  `json:"certifications"`
	Languages              []string                  `json:"languages"`
	KeyPhrases             []string                  `json:"keyPhrases"`
	Categories             []string                  `json:"categories"`
}

type JDSkillRequirement struct {
	Name        string `json:"name"`
	Required    bool   `json:"required"`
	Proficiency string `json:"proficiency"`
	Context     string `json:"context"`
}

type JDExperienceRequirement struct {
	Field    string `json:"field"`
	MinYears int    `json:"minYears"`
	Required bool   `json:"required"`
	Context  string `json:"context"`
}

type JDEducationRequirement struct {
	Level    string   `json:"level"`
	Majors   []string `json:"majors"`
	Required bool     `json:"required"`
}

type JDScoreResponse struct {
	OverallScore   int                  `json:"overallScore"`
	Level          string               `json:"level"`
	Summary        string               `json:"summary"`
	JDParsed       JDParsedResult       `json:"jdParsed"`
	Breakdown      JDScoreBreakdown     `json:"breakdown"`
	Improvements   []JDScoreImprovement `json:"improvements"`
	TargetTitle    string               `json:"targetTitle,omitempty"`
	CompanyName    string               `json:"companyName,omitempty"`
	JDText         string               `json:"jdText,omitempty"`
	RawText        string               `json:"rawText,omitempty"`
	Model          string               `json:"model"`
	ConversationID string               `json:"conversationId"`
}

type JDScoreBreakdown struct {
	ATS          JDATSScoreDetail     `json:"ats"`
	KeywordMatch JDKeywordMatchDetail `json:"keywordMatch"`
	SeniorityFit JDSeniorityFitDetail `json:"seniorityFit"`
}

type JDATSScoreDetail struct {
	Score  int                 `json:"score"`
	Checks []JDFormatCheckItem `json:"checks"`
}

type JDFormatCheckItem struct {
	Key         string `json:"key"`
	Passed      bool   `json:"passed"`
	Description string `json:"description"`
	Suggestion  string `json:"suggestion,omitempty"`
}

type JDKeywordMatchDetail struct {
	Score           int              `json:"score"`
	Coverage        float64          `json:"coverage"`
	RequiredMatched int              `json:"requiredMatched"`
	RequiredTotal   int              `json:"requiredTotal"`
	OptionalMatched int              `json:"optionalMatched"`
	OptionalTotal   int              `json:"optionalTotal"`
	Keywords        []JDKeywordMatch `json:"keywords"`
	Missing         []string         `json:"missing"`
}

type JDSeniorityFitDetail struct {
	Score       int    `json:"score"`
	JDSeniority string `json:"jdSeniority"`
	ResumeYears int    `json:"resumeYears"`
	LevelMatch  string `json:"levelMatch"`
}

type JDScoreImprovement struct {
	Category      string `json:"category"`
	PotentialGain int    `json:"potentialGain"`
	Action        string `json:"action"`
	Priority      string `json:"priority"`
}

// BulletRewriteRequest Bullet Point 重写请求
type BulletRewriteRequest struct {
	ResumeID         string `json:"resumeId" binding:"required"`
	ModuleType       string `json:"moduleType" binding:"required"`
	ModuleInstanceID string `json:"moduleInstanceId"`
	FieldKey         string `json:"fieldKey" binding:"required"`
	Content          string `json:"content" binding:"required"`
	JDText           string `json:"jdText"`
	TargetTitle      string `json:"targetTitle"`
	CompanyName      string `json:"companyName"`
}

// BulletRewriteResponse Bullet Point 重写响应
type BulletRewriteResponse struct {
	Original       string                 `json:"original"`
	Versions       []BulletRewriteVersion `json:"versions"`
	MissingData    []string               `json:"missingData"`
	JDText         string                 `json:"jdText,omitempty"`
	TargetTitle    string                 `json:"targetTitle,omitempty"`
	CompanyName    string                 `json:"companyName,omitempty"`
	RawText        string                 `json:"rawText,omitempty"`
	Model          string                 `json:"model"`
	ConversationID string                 `json:"conversationId"`
}

// BulletRewriteVersion 单个重写版本
type BulletRewriteVersion struct {
	Type       string   `json:"type"`
	Text       string   `json:"text"`
	Highlights []string `json:"highlights"`
	Confidence float64  `json:"confidence"`
}

// ModuleRewriteRequest 整模块批量改写请求
type ModuleRewriteRequest struct {
	ResumeID         string                 `json:"resumeId" binding:"required"`
	ModuleType       string                 `json:"moduleType" binding:"required"`
	ModuleInstanceID string                 `json:"moduleInstanceId"`
	Content          map[string]interface{} `json:"content" binding:"required"` // 模块完整数据（含 items）
	JDText           string                 `json:"jdText"`
	TargetTitle      string                 `json:"targetTitle"`
	CompanyName      string                 `json:"companyName"`
}

// ModuleRewriteItem 单条改写结果（与原条目按 index 对齐）
type ModuleRewriteItem struct {
	Index      int      `json:"index"`
	Original   string   `json:"original"`
	Rewritten  string   `json:"rewritten"`
	Highlights []string `json:"highlights"`
}

// ModuleRewriteResponse 整模块改写响应
type ModuleRewriteResponse struct {
	ModuleType     string              `json:"moduleType"`
	Items          []ModuleRewriteItem `json:"items"`
	Model          string              `json:"model"`
	RawText        string              `json:"rawText,omitempty"`
	ConversationID string              `json:"conversationId"`
}

// SuggestRequest 润色请求
type SuggestRequest struct {
	ResumeID         string `json:"resumeId" binding:"required"`
	ModuleType       string `json:"moduleType" binding:"required"`
	ModuleInstanceID string `json:"moduleInstanceId" binding:"required"`
	FieldKey         string `json:"fieldKey" binding:"required"`
	Content          string `json:"content" binding:"required"`
	ContentHash      string `json:"contentHash"`
	OnProgress       bool   `json:"onProgress"`
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

// TranslateRequest 简历翻译请求
type TranslateRequest struct {
	ResumeID     string           `json:"resumeId" binding:"required"`
	TargetLocale string           `json:"targetLocale" binding:"required,oneof=zh-CN en-US"`
	Options      TranslateOptions `json:"options"`
}

// TranslateOptions 翻译选项
type TranslateOptions struct {
	KeepChineseFields bool `json:"keepChineseFields"`
	FontFallback      bool `json:"fontFallback"`
}

// TranslateResponse 简历翻译响应
type TranslateResponse struct {
	TranslatedModules      []map[string]interface{} `json:"translatedModules"`
	TranslatedTitle        string                   `json:"translatedTitle"`
	TargetLocale           string                   `json:"targetLocale"`
	SuggestedStyleSettings *ResumeStyleSettings     `json:"suggestedStyleSettings,omitempty"`
	ConversationID         string                   `json:"conversationId"`
	Model                  string                   `json:"model"`
	Warnings               []string                 `json:"warnings"`
}

// EnhanceOperation AI 增强操作类型
type EnhanceOperation string

const (
	EnhanceMetrics EnhanceOperation = "metrics" // 抽取量化指标
	EnhanceRisk    EnhanceOperation = "risk"    // 补全风控描述
	EnhanceStar    EnhanceOperation = "star"    // 转化为 STAR 工作流
)

// EnhanceRequest AI 增强请求
type EnhanceRequest struct {
	Scenario  string           `json:"scenario" binding:"required"`
	Operation EnhanceOperation `json:"operation" binding:"required,oneof=metrics risk star"`
}

// EnhanceResponse AI 增强响应
type EnhanceResponse struct {
	Result string `json:"result"`
}

// --- Interview 面试准备 ---

type InterviewRound string

const (
	InterviewRoundTech1 InterviewRound = "technical_1"
	InterviewRoundTech2 InterviewRound = "technical_2"
	InterviewRoundHR    InterviewRound = "hr"
)

type InterviewMode string

const (
	InterviewModeSimulate   InterviewMode = "simulate"
	InterviewModeTranscript InterviewMode = "transcript"
)

type InterviewGenerateRequest struct {
	ResumeID          string                 `json:"resumeId" binding:"required"`
	SnapshotVersionID *string                `json:"snapshotVersionId,omitempty"`
	Content           map[string]interface{} `json:"content" binding:"required"`
	JDText            string                 `json:"jdText" binding:"required"`
	TargetTitle       string                 `json:"targetTitle"`
	CompanyName       string                 `json:"companyName"`
	FocusAreas        []string               `json:"focusAreas"`
	QuestionCount     int                    `json:"questionCount"`
	InterviewRound    string                 `json:"interviewRound"`
}

type InterviewEvaluateRequest struct {
	SessionID      string            `json:"sessionId" binding:"required"`
	Answers        []InterviewAnswer `json:"answers" binding:"required"`
	InterviewRound string            `json:"interviewRound"`
}

// InterviewFollowupTurn 追问对话中的一轮（user=候选人回答 / assistant=面试官追问）
type InterviewFollowupTurn struct {
	Role    string `json:"role"` // user | assistant
	Content string `json:"content"`
}

// InterviewFollowupRequest 面试追问请求
type InterviewFollowupRequest struct {
	SessionID  string                  `json:"sessionId" binding:"required"`
	QuestionID string                  `json:"questionId" binding:"required"`
	Question   string                  `json:"question" binding:"required"`
	Answer     string                  `json:"answer" binding:"required"`
	History    []InterviewFollowupTurn `json:"history"`
}

type AnalyzeTranscriptRequest struct {
	ResumeID          string                 `json:"resumeId" binding:"required"`
	SnapshotVersionID *string                `json:"snapshotVersionId,omitempty"`
	Content           map[string]interface{} `json:"content" binding:"required"`
	JDText            string                 `json:"jdText"`
	TargetTitle       string                 `json:"targetTitle"`
	CompanyName       string                 `json:"companyName"`
	TranscriptText    string                 `json:"transcriptText" binding:"required"`
	TranscriptSource  string                 `json:"transcriptSource"`
	InterviewRound    string                 `json:"interviewRound"`
}

type InterviewQuestion struct {
	ID                   string                  `json:"id"`
	Category             string                  `json:"category"`
	Difficulty           string                  `json:"difficulty"`
	Question             string                  `json:"question"`
	Context              string                  `json:"context,omitempty"`
	Hints                []string                `json:"hints,omitempty"`
	EvaluationCriteria   InterviewEvalCriteria   `json:"evaluationCriteria"`
	RelatedResumeSection string                  `json:"relatedResumeSection,omitempty"`
	SourceSegment        *InterviewSourceSegment `json:"sourceSegment,omitempty"`
}

type InterviewEvalCriteria struct {
	KeyPoints   []string `json:"keyPoints"`
	BonusPoints []string `json:"bonusPoints"`
	RedFlags    []string `json:"redFlags"`
}

type InterviewSourceSegment struct {
	StartChar int `json:"startChar"`
	EndChar   int `json:"endChar"`
}

type InterviewAnswer struct {
	QuestionID     string `json:"questionId"`
	Answer         string `json:"answer"`
	Skipped        bool   `json:"skipped"`
	AnsweredAt     string `json:"answeredAt"`
	FromTranscript bool   `json:"fromTranscript,omitempty"`
	OriginalText   string `json:"originalText,omitempty"`
}

type InterviewEvaluation struct {
	Summary                string                       `json:"summary"`
	OverallScore           *int                         `json:"overallScore,omitempty"`
	OverallLevel           string                       `json:"overallLevel,omitempty"`
	DimensionScores        map[string]InterviewDimScore `json:"dimensionScores"`
	RoundScores            map[string]int               `json:"roundScores"`
	RoundReasons           map[string]string            `json:"roundReasons,omitempty"`
	QuestionEvaluations    []InterviewQEval             `json:"questionEvaluations"`
	ImprovementSuggestions []InterviewImprovement       `json:"improvementSuggestions"`
	Model                  string                       `json:"model"`
	EvaluatedAt            string                       `json:"evaluatedAt"`
}

type InterviewDimScore struct {
	Score    int    `json:"score"`
	Level    string `json:"level"`
	Feedback string `json:"feedback"`
}

type InterviewQEval struct {
	QuestionID    string   `json:"questionId"`
	Score         int      `json:"score"`
	KeyPointsHit  []string `json:"keyPointsHit"`
	MissedPoints  []string `json:"missedPoints"`
	RedFlagsFound []string `json:"redFlagsFound"`
	BriefFeedback string   `json:"briefFeedback"`
}

type InterviewImprovement struct {
	Priority      string `json:"priority"`
	Area          string `json:"area"`
	Suggestion    string `json:"suggestion"`
	EstimatedGain int    `json:"estimatedGain"`
	TargetRound   string `json:"targetRound"`
}

type SaveInterviewProgressRequest struct {
	Answers       []InterviewAnswer `json:"answers"`
	AnsweredCount int               `json:"answeredCount"`
	SkippedCount  int               `json:"skippedCount"`
}

type InterviewSession struct {
	ID               string               `json:"id"`
	UserID           string               `json:"userId"`
	ResumeID         string               `json:"resumeId,omitempty"`
	SnapshotID       string               `json:"snapshotId,omitempty"`
	ConversationID   string               `json:"conversationId,omitempty"`
	TargetTitle      string               `json:"targetTitle"`
	CompanyName      string               `json:"companyName"`
	JDText           string               `json:"jdText"`
	JDHash           string               `json:"jdHash,omitempty"`
	FocusAreas       []string             `json:"focusAreas"`
	QuestionCount    int                  `json:"questionCount"`
	InterviewRound   string               `json:"interviewRound"`
	Mode             string               `json:"mode"`
	TranscriptText   string               `json:"transcriptText,omitempty"`
	TranscriptSource string               `json:"transcriptSource,omitempty"`
	Questions        []InterviewQuestion  `json:"questions"`
	Answers          []InterviewAnswer    `json:"answers"`
	AnsweredCount    int                  `json:"answeredCount"`
	SkippedCount     int                  `json:"skippedCount"`
	Evaluation       *InterviewEvaluation `json:"evaluation,omitempty"`
	OverallScore     *int                 `json:"overallScore,omitempty"`
	PassLevel        string               `json:"passLevel,omitempty"`
	Model            string               `json:"model,omitempty"`
	Status           string               `json:"status"`
	CreatedAt        int64                `json:"createdAt"`
	UpdatedAt        int64                `json:"updatedAt"`
}

// InterviewSessionListItem 面试历史列表轻量结构（不含 jdText/transcriptText/questions/evaluation 大字段）
type InterviewSessionListItem struct {
	ID             string `json:"id"`
	TargetTitle    string `json:"targetTitle"`
	CompanyName    string `json:"companyName"`
	InterviewRound string `json:"interviewRound"`
	Mode           string `json:"mode"`
	QuestionCount  int    `json:"questionCount"`
	AnsweredCount  int    `json:"answeredCount"`
	SkippedCount   int    `json:"skippedCount"`
	OverallScore   *int   `json:"overallScore,omitempty"`
	PassLevel      string `json:"passLevel,omitempty"`
	Status         string `json:"status"`
	CreatedAt      int64  `json:"createdAt"`
	UpdatedAt      int64  `json:"updatedAt"`
}

// InterviewSessionListResponse 面试历史分页响应
type InterviewSessionListResponse struct {
	Items  []InterviewSessionListItem `json:"items"`
	Total  int                        `json:"total"`
	Limit  int                        `json:"limit"`
	Offset int                        `json:"offset"`
}
