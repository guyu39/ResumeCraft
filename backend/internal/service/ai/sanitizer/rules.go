package sanitizer

import "regexp"

// Rule 脱敏规则
type Rule struct {
	Type        string         // PII 类型（name/phone/email...）
	Pattern     *regexp.Regexp // 匹配正则
	Placeholder string         // 占位符模板（不含编号），如 "NAME"
	enabled     bool
}

// builtinRules 返回内置规则列表
func builtinRules(cfg Config) []Rule {
	rules := []Rule{}

	// 姓名（3 条规则：标识词后、称谓前、简历头部）
	rules = append(rules,
		Rule{Type: "NAME", Pattern: reChineseName, Placeholder: "NAME", enabled: true},
		Rule{Type: "NAME", Pattern: reNameWithTitle, Placeholder: "NAME", enabled: true},
		Rule{Type: "NAME", Pattern: reNameInHeader, Placeholder: "NAME", enabled: true},
	)

	// 手机号
	if !cfg.SkipPhone {
		rules = append(rules, Rule{
			Type:        "PHONE",
			Pattern:     rePhone,
			Placeholder: "PHONE",
			enabled:     true,
		})
		// 固定电话也用 PHONE 占位
		rules = append(rules, Rule{
			Type:        "PHONE",
			Pattern:     reTel,
			Placeholder: "PHONE",
			enabled:     true,
		})
	}

	// 邮箱
	if !cfg.SkipEmail {
		rules = append(rules, Rule{
			Type:        "EMAIL",
			Pattern:     reEmail,
			Placeholder: "EMAIL",
			enabled:     true,
		})
	}

	// 身份证
	rules = append(rules, Rule{
		Type:        "ID",
		Pattern:     reIDCard,
		Placeholder: "ID",
		enabled:     true,
	})

	// URL
	if !cfg.SkipURL {
		rules = append(rules, Rule{
			Type:        "URL",
			Pattern:     reURL,
			Placeholder: "URL",
			enabled:     true,
		})
		// Github 用户名
		rules = append(rules, Rule{
			Type:        "URL",
			Pattern:     reGithubUser,
			Placeholder: "URL",
			enabled:     true,
		})
		// LinkedIn 用户名
		rules = append(rules, Rule{
			Type:        "URL",
			Pattern:     reLinkedIn,
			Placeholder: "URL",
			enabled:     true,
		})
	}

	// 地址
	rules = append(rules, Rule{
		Type:        "ADDR",
		Pattern:     reAddress,
		Placeholder: "ADDR",
		enabled:     true,
	})

	// 薪资
	if !cfg.PreserveNumbers {
		rules = append(rules, Rule{
			Type:        "SALARY",
			Pattern:     reSalary,
			Placeholder: "SALARY",
			enabled:     true,
		})
	}

	// 自定义关键词（内部代号等）
	for _, kw := range cfg.CustomKeywords {
		if kw == "" {
			continue
		}
		escaped := regexp.QuoteMeta(kw)
		rules = append(rules, Rule{
			Type:        "CODE",
			Pattern:     regexp.MustCompile(escaped),
			Placeholder: "CODE",
			enabled:     true,
		})
	}

	// 公司名
	for _, company := range cfg.CompanyNames {
		if company == "" {
			continue
		}
		escaped := regexp.QuoteMeta(company)
		rules = append(rules, Rule{
			Type:        "COMP",
			Pattern:     regexp.MustCompile(escaped),
			Placeholder: "COMP",
			enabled:     true,
		})
	}

	return rules
}
