package export

import (
	"bytes"
	"fmt"
	"strings"

	"resumecraft-pdf-backend/internal/model"
)

type MarkdownRenderer struct{}

func (m *MarkdownRenderer) Render(resume *model.ResumeDetail) ([]byte, string, error) {
	var buf bytes.Buffer

	for _, mod := range resume.Modules {
		modType, _ := mod["type"].(string)
		data, _ := mod["data"].(map[string]interface{})
		if data == nil {
			data = map[string]interface{}{}
		}
		title, _ := mod["title"].(string)

		switch modType {
		case "personal":
			m.renderPersonal(&buf, data)
		case "summary":
			m.renderSummary(&buf, title, data)
		case "work":
			m.renderItems(&buf, title, "工作经历", data, m.renderWorkItem)
		case "education":
			m.renderItems(&buf, title, "教育经历", data, m.renderEducationItem)
		case "project":
			m.renderItems(&buf, title, "项目经历", data, m.renderProjectItem)
		case "skills":
			m.renderSkills(&buf, title, data)
		case "awards":
			m.renderItems(&buf, title, "获奖经历", data, m.renderAwardItem)
		case "certificates":
			m.renderItems(&buf, title, "证书资质", data, m.renderCertificateItem)
		case "languages":
			m.renderItems(&buf, title, "语言能力", data, m.renderLanguageItem)
		case "portfolio":
			m.renderItems(&buf, title, "作品集", data, m.renderPortfolioItem)
		case "custom":
			m.renderItems(&buf, title, "自定义模块", data, m.renderCustomItem)
		}
	}

	return buf.Bytes(), "text/markdown; charset=utf-8", nil
}

func (m *MarkdownRenderer) renderPersonal(buf *bytes.Buffer, data map[string]interface{}) {
	name, _ := data["name"].(string)
	if name == "" {
		return
	}

	buf.WriteString(fmt.Sprintf("# %s", name))

	targetPosition, _ := data["targetPosition"].(string)
	if targetPosition != "" {
		buf.WriteString(fmt.Sprintf(" · %s", targetPosition))
	}
	buf.WriteString("\n\n")

	var basics []string
	if v, ok := data["gender"].(string); ok && v != "" {
		basics = append(basics, v)
	}
	if v, ok := data["age"].(string); ok && v != "" {
		basics = append(basics, v)
	}
	if v, ok := data["hometown"].(string); ok && v != "" {
		basics = append(basics, fmt.Sprintf("籍贯: %s", v))
	}
	if v, ok := data["education"].(string); ok && v != "" {
		basics = append(basics, v)
	}
	if v, ok := data["workYears"].(string); ok && v != "" {
		basics = append(basics, v)
	}
	if v, ok := data["politics"].(string); ok && v != "" {
		basics = append(basics, v)
	}
	if v, ok := data["city"].(string); ok && v != "" {
		basics = append(basics, fmt.Sprintf("📍 %s", v))
	}
	if len(basics) > 0 {
		buf.WriteString(fmt.Sprintf("> %s\n\n", strings.Join(basics, " | ")))
	}

	var contacts []string
	if v, ok := data["email"].(string); ok && v != "" {
		contacts = append(contacts, fmt.Sprintf("📧 %s", v))
	}
	if v, ok := data["phone"].(string); ok && v != "" {
		contacts = append(contacts, fmt.Sprintf("📱 %s", v))
	}
	if v, ok := data["github"].(string); ok && v != "" {
		contacts = append(contacts, fmt.Sprintf("🔗 %s", v))
	}
	if v, ok := data["website"].(string); ok && v != "" {
		contacts = append(contacts, fmt.Sprintf("🌐 %s", v))
	}
	if v, ok := data["linkedin"].(string); ok && v != "" {
		contacts = append(contacts, fmt.Sprintf("💼 %s", v))
	}
	if acct, ok := data["personalAccount"].(map[string]interface{}); ok {
		platform, _ := acct["platform"].(string)
		url, _ := acct["url"].(string)
		if platform != "" && url != "" {
			contacts = append(contacts, fmt.Sprintf("%s: %s", platform, url))
		}
	}
	if len(contacts) > 0 {
		buf.WriteString(fmt.Sprintf("> %s\n\n", strings.Join(contacts, " | ")))
	}

	if items, ok := data["extraInfos"].([]interface{}); ok {
		for _, item := range items {
			info, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			title, _ := info["title"].(string)
			value, _ := info["value"].(string)
			if title != "" && value != "" {
				buf.WriteString(fmt.Sprintf("- **%s**: %s\n", title, value))
			}
		}
		if len(items) > 0 {
			buf.WriteString("\n")
		}
	}
}

func (m *MarkdownRenderer) renderSummary(buf *bytes.Buffer, title string, data map[string]interface{}) {
	content, _ := data["content"].(string)
	if content == "" {
		return
	}
	sectionTitle := ifEmpty(title, "自我评价")
	buf.WriteString(fmt.Sprintf("## %s\n\n", sectionTitle))
	buf.WriteString(stripHTMLTags(content))
	buf.WriteString("\n\n")
}

func (m *MarkdownRenderer) renderWorkItem(buf *bytes.Buffer, item map[string]interface{}) {
	company, _ := item["company"].(string)
	position, _ := item["position"].(string)
	startDate, _ := item["startDate"].(string)
	endDate, _ := item["endDate"].(string)

	var heading string
	if position != "" && company != "" {
		heading = fmt.Sprintf("%s · %s", position, company)
	} else {
		heading = ifEmpty(company, ifEmpty(position, "未命名"))
	}
	buf.WriteString(fmt.Sprintf("### %s", heading))

	if startDate != "" {
		buf.WriteString(fmt.Sprintf("（%s", startDate))
		if endDate != "" {
			buf.WriteString(fmt.Sprintf(" - %s", endDate))
		} else {
			buf.WriteString(" - 至今")
		}
		buf.WriteString("）")
	}
	buf.WriteString("\n\n")

	desc, _ := item["description"].(string)
	if desc != "" {
		buf.WriteString(stripHTMLTags(desc))
		buf.WriteString("\n\n")
	}
}

func (m *MarkdownRenderer) renderEducationItem(buf *bytes.Buffer, item map[string]interface{}) {
	school, _ := item["school"].(string)
	major, _ := item["major"].(string)
	degree, _ := item["degree"].(string)
	startDate, _ := item["startDate"].(string)
	endDate, _ := item["endDate"].(string)

	var parts []string
	if degree != "" {
		parts = append(parts, degree)
	}
	if major != "" {
		parts = append(parts, major)
	}

	heading := ifEmpty(school, "未命名学校")
	buf.WriteString(fmt.Sprintf("### %s", heading))
	if len(parts) > 0 {
		buf.WriteString(fmt.Sprintf(" · %s", strings.Join(parts, " - ")))
	}

	if startDate != "" {
		buf.WriteString(fmt.Sprintf("（%s", startDate))
		if endDate != "" {
			buf.WriteString(fmt.Sprintf(" - %s", endDate))
		}
		buf.WriteString("）")
	}
	buf.WriteString("\n\n")

	honors, _ := item["honors"].(string)
	if honors != "" {
		buf.WriteString(fmt.Sprintf("- %s\n", honors))
		buf.WriteString("\n")
	}
}

func (m *MarkdownRenderer) renderProjectItem(buf *bytes.Buffer, item map[string]interface{}) {
	name, _ := item["name"].(string)
	role, _ := item["role"].(string)
	startDate, _ := item["startDate"].(string)
	endDate, _ := item["endDate"].(string)

	heading := ifEmpty(name, "未命名项目")
	buf.WriteString(fmt.Sprintf("### %s", heading))
	if role != "" {
		buf.WriteString(fmt.Sprintf(" · %s", role))
	}
	if startDate != "" {
		buf.WriteString(fmt.Sprintf("（%s", startDate))
		if endDate != "" {
			buf.WriteString(fmt.Sprintf(" - %s", endDate))
		}
		buf.WriteString("）")
	}
	buf.WriteString("\n\n")

	desc, _ := item["description"].(string)
	if desc != "" {
		buf.WriteString(stripHTMLTags(desc))
		buf.WriteString("\n\n")
	}

	techStack := toStringSlice(item["techStack"])
	if len(techStack) > 0 {
		buf.WriteString(fmt.Sprintf("**技术栈**: %s\n\n", strings.Join(techStack, "、")))
	}
}

func (m *MarkdownRenderer) renderSkills(buf *bytes.Buffer, title string, data map[string]interface{}) {
	content, _ := data["content"].(string)
	if content == "" {
		return
	}
	sectionTitle := ifEmpty(title, "专业技能")
	buf.WriteString(fmt.Sprintf("## %s\n\n", sectionTitle))
	buf.WriteString(stripHTMLTags(content))
	buf.WriteString("\n\n")
}

func (m *MarkdownRenderer) renderAwardItem(buf *bytes.Buffer, item map[string]interface{}) {
	name, _ := item["name"].(string)
	level, _ := item["level"].(string)
	date, _ := item["date"].(string)

	line := ifEmpty(name, "未命名奖项")
	if level != "" {
		line += fmt.Sprintf(" · %s", level)
	}
	if date != "" {
		line += fmt.Sprintf("（%s）", date)
	}
	buf.WriteString(fmt.Sprintf("- %s\n", line))
}

func (m *MarkdownRenderer) renderCertificateItem(buf *bytes.Buffer, item map[string]interface{}) {
	name, _ := item["name"].(string)
	issuer, _ := item["issuer"].(string)
	date, _ := item["date"].(string)

	line := ifEmpty(name, "未命名证书")
	if issuer != "" {
		line += fmt.Sprintf(" · %s", issuer)
	}
	if date != "" {
		line += fmt.Sprintf("（%s）", date)
	}
	buf.WriteString(fmt.Sprintf("- %s\n", line))
}

func (m *MarkdownRenderer) renderLanguageItem(buf *bytes.Buffer, item map[string]interface{}) {
	language, _ := item["language"].(string)
	level, _ := item["level"].(string)

	line := ifEmpty(language, "未命名语言")
	if level != "" {
		line += fmt.Sprintf(" · %s", level)
	}
	buf.WriteString(fmt.Sprintf("- %s\n", line))
}

func (m *MarkdownRenderer) renderPortfolioItem(buf *bytes.Buffer, item map[string]interface{}) {
	title, _ := item["title"].(string)
	url, _ := item["url"].(string)

	if url != "" {
		buf.WriteString(fmt.Sprintf("- [%s](%s)\n", ifEmpty(title, "未命名作品"), url))
	} else {
		buf.WriteString(fmt.Sprintf("- %s\n", ifEmpty(title, "未命名作品")))
	}
}

func (m *MarkdownRenderer) renderCustomItem(buf *bytes.Buffer, item map[string]interface{}) {
	title, _ := item["title"].(string)
	content, _ := item["content"].(string)
	date, _ := item["date"].(string)

	if title != "" {
		buf.WriteString(fmt.Sprintf("### %s", title))
		if date != "" {
			buf.WriteString(fmt.Sprintf("（%s）", date))
		}
		buf.WriteString("\n\n")
	}
	if content != "" {
		buf.WriteString(stripHTMLTags(content))
		buf.WriteString("\n\n")
	}
}

func (m *MarkdownRenderer) renderItems(buf *bytes.Buffer, title string, defaultTitle string, data map[string]interface{}, renderItem func(*bytes.Buffer, map[string]interface{})) {
	itemsRaw, ok := data["items"]
	if !ok {
		return
	}
	items, ok := itemsRaw.([]interface{})
	if !ok || len(items) == 0 {
		return
	}

	sectionTitle := ifEmpty(title, defaultTitle)
	buf.WriteString(fmt.Sprintf("## %s\n\n", sectionTitle))

	for _, item := range items {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		renderItem(buf, itemMap)
	}
}

func ifEmpty(val, fallback string) string {
	if val != "" {
		return val
	}
	return fallback
}

func stripHTMLTags(s string) string {
	var result strings.Builder
	inTag := false
	for _, r := range s {
		if r == '<' {
			inTag = true
			continue
		}
		if r == '>' {
			inTag = false
			// add newline after block-level tags
			continue
		}
		if !inTag {
			result.WriteRune(r)
		}
	}
	return strings.TrimSpace(result.String())
}

func toStringSlice(v interface{}) []string {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case []interface{}:
		result := make([]string, 0, len(val))
		for _, item := range val {
			if s, ok := item.(string); ok && s != "" {
				result = append(result, s)
			}
		}
		return result
	case []string:
		return val
	default:
		return nil
	}
}
