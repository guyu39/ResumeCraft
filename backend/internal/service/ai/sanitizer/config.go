package sanitizer

// Config 脱敏配置
type Config struct {
	Enabled         bool     // 全局开关，默认 true
	CustomKeywords  []string // 自定义脱敏关键词（内部代号等）
	CompanyNames    []string // 公司名列表
	SkipPhone       bool     // 跳过手机号脱敏
	SkipEmail       bool     // 跳过邮箱脱敏
	SkipURL         bool     // 跳过 URL 脱敏
	PreserveNumbers bool     // 保留所有数字
}

// DefaultConfig 默认配置
func DefaultConfig() Config {
	return Config{
		Enabled:         true,
		CustomKeywords:  nil,
		CompanyNames:    nil,
		SkipPhone:       false,
		SkipEmail:       false,
		SkipURL:         false,
		PreserveNumbers: false,
	}
}
