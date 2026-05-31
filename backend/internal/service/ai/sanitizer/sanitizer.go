package sanitizer

import (
	"fmt"
	"sort"
	"strings"
	"sync"
)

// Sanitizer 脱敏器（每次 AI 调用创建一个实例，线程安全）
type Sanitizer struct {
	mu       sync.Mutex
	rules    []Rule
	mapping  map[string]string // placeholder → original
	counter  map[string]int
	skipList map[string]bool // 白名单：不应替换的词
}

// 全局白名单：常见非姓名的双字/三字中文词
var skipWords = []string{
	"本科", "硕士", "博士", "大专", "中专", "高中", "初中", "小学",
	"个人", "工作", "项目", "教育", "技能", "语言", "证书", "奖项",
	"实习", "兼职", "全职", "离职", "在职", "应届",
	"产品", "运营", "设计", "开发", "测试", "前端", "后端", "算法",
	"数据", "架构", "管理", "技术", "工程", "研究", "分析",
	"软件", "硬件", "系统", "网络", "安全", "平台",
	"上海", "北京", "深圳", "广州", "杭州", "成都", "武汉", "南京",
	"人力资源", "行政", "财务", "市场", "销售", "客服",
	"有限", "公司", "集团", "科技", "信息", "技术", "网络",
}

func buildSkipList() map[string]bool {
	m := make(map[string]bool, len(skipWords))
	for _, w := range skipWords {
		m[w] = true
	}
	return m
}

// New 创建脱敏器
func New(cfg Config) *Sanitizer {
	return &Sanitizer{
		rules:    builtinRules(cfg),
		mapping:  make(map[string]string),
		counter:  make(map[string]int),
		skipList: buildSkipList(),
	}
}

// mappingKey 生成占位符 key
func (s *Sanitizer) mappingKey(placeholder string) string {
	s.counter[placeholder]++
	return fmt.Sprintf("[%s_%d]", placeholder, s.counter[placeholder])
}

// Mask 对输入文本做脱敏
func (s *Sanitizer) Mask(input string) string {
	if input == "" {
		return input
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// ---- Step 1: 保护白名单区域 ----
	// 已经存在的占位符：保护起来避免重复替换
	existingPlaceholders := findExistingPlaceholders(input)
	protected := make(map[string]string)
	for i, p := range existingPlaceholders {
		key := fmt.Sprintf("__PROTECTED_%d__", i)
		protected[key] = p
		input = strings.ReplaceAll(input, p, key)
	}

	// 保护 Markdown 代码块内容
	input = protectCodeBlocks(input, &protected)

	// ---- Step 2: 按规则遍历替换 ----
	result := input
	for _, rule := range s.rules {
		if !rule.enabled {
			continue
		}
		matches := rule.Pattern.FindAllString(result, -1)
		for _, match := range matches {
			// 跳过已保护的占位符
			if strings.Contains(match, "__PROTECTED_") {
				continue
			}
			match = strings.TrimSpace(match)
			if match == "" {
				continue
			}
			// 白名单检查：NAME 类型的短中文词可能是学历/职衔，跳过
			if rule.Type == "NAME" {
				core := extractCore(match)
				if s.skipList[core] {
					continue
				}
			}
			key := s.mappingKey(rule.Placeholder)
			s.mapping[key] = match
			result = strings.Replace(result, match, key, 1)
		}
	}

	// ---- Step 3: 恢复保护区域 ----
	for key, original := range protected {
		result = strings.ReplaceAll(result, key, original)
	}

	return result
}

// Unmask 将占位符还原为原始值
func (s *Sanitizer) Unmask(input string) string {
	if input == "" || len(s.mapping) == 0 {
		return input
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	result := input

	// 按占位符长度降序排列，避免短占位符先替换导致长占位符残片
	keys := make([]string, 0, len(s.mapping))
	for k := range s.mapping {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		return len(keys[i]) > len(keys[j])
	})

	for _, key := range keys {
		result = strings.ReplaceAll(result, key, s.mapping[key])
	}

	return result
}

// MaskedPrompt 返回脱敏后的 prompt 摘要（调试用）
func (s *Sanitizer) MaskedPrompt() string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("脱敏统计: %d 项\n", len(s.mapping)))
	keys := make([]string, 0, len(s.mapping))
	for k := range s.mapping {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		b.WriteString(fmt.Sprintf("  %s → %s\n", s.mapping[k][:min(20, len(s.mapping[k]))], k))
	}
	return b.String()
}

// ---- 内部辅助函数 ----

// findExistingPlaceholders 扫描文本中已有的占位符（如[NAME_1]）
func findExistingPlaceholders(input string) []string {
	var result []string
	for i := 0; i < len(input); i++ {
		if input[i] == '[' {
			end := strings.IndexByte(input[i:], ']')
			if end > 0 && end < 30 { // 合理长度范围
				placeholder := input[i : i+end+1]
				result = append(result, placeholder)
			}
		}
	}
	return result
}

// protectCodeBlocks 保护 markdown 代码块内容
func protectCodeBlocks(input string, protected *map[string]string) string {
	result := input
	// 匹配 ``` ... ``` 代码块
	start := 0
	count := 0
	for {
		idx := strings.Index(result[start:], "```")
		if idx < 0 {
			break
		}
		blockStart := start + idx
		end := strings.Index(result[blockStart+3:], "```")
		if end < 0 {
			break
		}
		blockEnd := blockStart + 3 + end + 3
		content := result[blockStart:blockEnd]
		key := fmt.Sprintf("__PROTECTED_CODE_%d__", count)
		(*protected)[key] = content
		result = strings.Replace(result, content, key, 1)
		count++
		start = blockEnd
	}
	return result
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// extractCore 从带称谓的名词中提取核心词（如"工程师" → "工程师"）
func extractCore(match string) string {
	suffixes := []string{"女士", "先生", "同学", "同志", "老师", "经理", "总监", "主管",
		"工程师", "设计师", "架构师", "负责人", " ", "，", ",", "。", ".", "；", ";", "：", ":", "、", "\n", "\r"}
	for _, s := range suffixes {
		match = strings.TrimSuffix(match, s)
	}
	return match
}
