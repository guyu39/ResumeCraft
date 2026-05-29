package ai

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"resumecraft-pdf-backend/internal/model"
)

func parseJDScoreAIResponse(text string) (model.JDParsedResult, string, []model.JDScoreImprovement, error) {
	firstBrace := strings.Index(text, "{")
	lastBrace := strings.LastIndex(text, "}")
	if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
		return model.JDParsedResult{}, "", nil, fmt.Errorf("invalid JSON response")
	}
	jsonStr := text[firstBrace : lastBrace+1]

	var resp struct {
		Summary      string                     `json:"summary"`
		JDParsed     json.RawMessage            `json:"jdParsed"`
		Improvements []model.JDScoreImprovement `json:"improvements"`
	}
	if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
		return model.JDParsedResult{}, "", nil, err
	}

	jdParsed, err := parseFlexibleJDParsedResult(resp.JDParsed)
	if err != nil {
		return model.JDParsedResult{}, "", nil, err
	}
	if len(jdParsed.KeyPhrases) == 0 && len(jdParsed.HardSkills) == 0 && jdParsed.JobTitle == "" {
		return model.JDParsedResult{}, "", nil, fmt.Errorf("jd parsed result is empty")
	}
	return jdParsed, strings.TrimSpace(resp.Summary), resp.Improvements, nil
}

func parseFlexibleJDParsedResult(raw json.RawMessage) (model.JDParsedResult, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return model.JDParsedResult{}, err
	}

	if rawDomains, ok := fields["domains"]; ok && string(rawDomains) != "null" {
		var skillDomains []model.JDSkillRequirement
		if err := json.Unmarshal(rawDomains, &skillDomains); err != nil {
			var domainNames []string
			if stringErr := json.Unmarshal(rawDomains, &domainNames); stringErr != nil {
				return model.JDParsedResult{}, err
			}
			skillDomains = make([]model.JDSkillRequirement, 0, len(domainNames))
			for _, name := range domainNames {
				name = strings.TrimSpace(name)
				if name == "" {
					continue
				}
				skillDomains = append(skillDomains, model.JDSkillRequirement{Name: name, Proficiency: "unknown"})
			}
		}
		converted, err := json.Marshal(skillDomains)
		if err != nil {
			return model.JDParsedResult{}, err
		}
		fields["domains"] = converted
	}

	normalized, err := json.Marshal(fields)
	if err != nil {
		return model.JDParsedResult{}, err
	}

	var jdParsed model.JDParsedResult
	if err := json.Unmarshal(normalized, &jdParsed); err != nil {
		return model.JDParsedResult{}, err
	}
	return jdParsed, nil
}

func calculateJDScoreBreakdown(content map[string]interface{}, jdParsed model.JDParsedResult) model.JDScoreBreakdown {
	resumeText := strings.ToLower(flattenResumeContent(sanitizeAIResumeContent(content)))
	return model.JDScoreBreakdown{
		ATS:          calculateATSScore(content),
		KeywordMatch: calculateKeywordMatchScore(resumeText, jdParsed),
		SeniorityFit: calculateSeniorityFitScore(content, jdParsed),
	}
}

func calculateATSScore(content map[string]interface{}) model.JDATSScoreDetail {
	checks := []model.JDFormatCheckItem{
		{Key: "has_email", Description: "邮箱地址"},
		{Key: "has_phone", Description: "电话号码"},
		{Key: "has_target_position", Description: "求职意向"},
		{Key: "has_education", Description: "教育经历"},
		{Key: "has_work_or_project", Description: "工作/项目经历"},
		{Key: "has_skills", Description: "专业技能"},
	}

	personal := getModuleData(content, "personal")
	checks[0].Passed = strings.TrimSpace(getString(personal["email"])) != ""
	checks[0].Suggestion = suggestionIfFailed(checks[0].Passed, "补充可联系邮箱")
	checks[1].Passed = strings.TrimSpace(getString(personal["phone"])) != ""
	checks[1].Suggestion = suggestionIfFailed(checks[1].Passed, "补充手机号")
	checks[2].Passed = strings.TrimSpace(getString(personal["targetPosition"])) != ""
	checks[2].Suggestion = suggestionIfFailed(checks[2].Passed, "填写目标岗位")
	checks[3].Passed = moduleHasItems(content, "education")
	checks[3].Suggestion = suggestionIfFailed(checks[3].Passed, "补充教育经历")
	checks[4].Passed = moduleHasItems(content, "work") || moduleHasItems(content, "project")
	checks[4].Suggestion = suggestionIfFailed(checks[4].Passed, "至少补充一段工作或项目经历")
	checks[5].Passed = moduleHasContent(content, "skills")
	checks[5].Suggestion = suggestionIfFailed(checks[5].Passed, "补充与岗位相关的专业技能")

	passed := 0
	for _, check := range checks {
		if check.Passed {
			passed++
		}
	}
	return model.JDATSScoreDetail{Score: clampScore(passed * 100 / len(checks)), Checks: checks}
}

func calculateKeywordMatchScore(resumeText string, jdParsed model.JDParsedResult) model.JDKeywordMatchDetail {
	keywords := collectJDKeywords(jdParsed)
	matches := make([]model.JDKeywordMatch, 0, len(keywords))
	missing := []string{}
	requiredMatched, requiredTotal, optionalMatched, optionalTotal := 0, 0, 0, 0

	for keyword, required := range keywords {
		matched := keywordMatchesResume(resumeText, keyword)
		if required {
			requiredTotal++
			if matched {
				requiredMatched++
			}
		} else {
			optionalTotal++
			if matched {
				optionalMatched++
			}
		}
		if !matched {
			missing = append(missing, keyword)
		}
		evidence := "未体现"
		if matched {
			evidence = "简历文本中已出现相关关键词"
		}
		matches = append(matches, model.JDKeywordMatch{Keyword: keyword, Required: required, Matched: matched, Evidence: evidence})
	}

	total := requiredTotal + optionalTotal
	matchedTotal := requiredMatched + optionalMatched
	coverage := 0.0
	if total > 0 {
		coverage = float64(matchedTotal) / float64(total)
	}
	requiredScore := 100
	if requiredTotal > 0 {
		requiredScore = requiredMatched * 100 / requiredTotal
	}
	optionalScore := 100
	if optionalTotal > 0 {
		optionalScore = optionalMatched * 100 / optionalTotal
	}
	score := clampScore(int(float64(requiredScore)*0.7 + float64(optionalScore)*0.3))
	return model.JDKeywordMatchDetail{Score: score, Coverage: coverage, RequiredMatched: requiredMatched, RequiredTotal: requiredTotal, OptionalMatched: optionalMatched, OptionalTotal: optionalTotal, Keywords: matches, Missing: missing}
}

func calculateSeniorityFitScore(content map[string]interface{}, jdParsed model.JDParsedResult) model.JDSeniorityFitDetail {
	resumeYears := estimateResumeYears(content)
	expectedYears := expectedYearsForSeniority(jdParsed.SeniorityLevel)
	for _, req := range jdParsed.ExperienceRequirements {
		if req.MinYears > expectedYears {
			expectedYears = req.MinYears
		}
	}
	levelMatch := "match"
	score := 100
	if expectedYears > 0 && resumeYears < expectedYears {
		levelMatch = "underqualified"
		score = clampScore(55 + resumeYears*45/expectedYears)
	} else if expectedYears > 0 && resumeYears > expectedYears+5 {
		levelMatch = "overqualified"
		score = 85
	}
	return model.JDSeniorityFitDetail{Score: score, JDSeniority: jdParsed.SeniorityLevel, ResumeYears: resumeYears, LevelMatch: levelMatch}
}

func collectJDKeywords(jdParsed model.JDParsedResult) map[string]bool {
	keywords := map[string]bool{}
	add := func(keyword string, required bool) {
		keyword = strings.TrimSpace(keyword)
		if keyword == "" {
			return
		}
		if existing, ok := keywords[keyword]; !ok || required || existing {
			keywords[keyword] = required
		}
	}
	for _, skill := range jdParsed.HardSkills {
		add(skill.Name, skill.Required)
	}
	for _, skill := range jdParsed.Tools {
		add(skill.Name, skill.Required)
	}
	for _, skill := range jdParsed.Domains {
		add(skill.Name, skill.Required)
	}
	for _, skill := range jdParsed.SoftSkills {
		add(skill.Name, skill.Required)
	}
	for _, keyword := range jdParsed.KeyPhrases {
		add(keyword, false)
	}
	return keywords
}

func keywordMatchesResume(resumeText, keyword string) bool {
	keyword = strings.ToLower(strings.TrimSpace(keyword))
	if keyword == "" {
		return false
	}
	if strings.Contains(resumeText, keyword) {
		return true
	}
	for _, variant := range techSynonymVariants(keyword) {
		if strings.Contains(resumeText, strings.ToLower(variant)) {
			return true
		}
	}
	return false
}

func techSynonymVariants(keyword string) []string {
	synonyms := map[string][]string{
		"kubernetes": {"k8s", "kube"},
		"go":         {"golang"},
		"golang":     {"go"},
		"postgresql": {"postgres", "pg"},
		"typescript": {"ts"},
		"react":      {"reactjs", "react.js"},
		"ci/cd":      {"持续集成", "持续部署"},
	}
	return synonyms[keyword]
}

func flattenResumeContent(value interface{}) string {
	var parts []string
	var walk func(interface{})
	walk = func(v interface{}) {
		switch typed := v.(type) {
		case string:
			if strings.TrimSpace(typed) != "" {
				parts = append(parts, typed)
			}
		case []interface{}:
			for _, item := range typed {
				walk(item)
			}
		case []map[string]interface{}:
			for _, item := range typed {
				walk(item)
			}
		case map[string]interface{}:
			for _, item := range typed {
				walk(item)
			}
		}
	}
	walk(value)
	return strings.Join(parts, " ")
}

func getModuleData(content map[string]interface{}, moduleType string) map[string]interface{} {
	modules, ok := content["modules"].([]interface{})
	if !ok {
		return map[string]interface{}{}
	}
	for _, moduleValue := range modules {
		module, ok := moduleValue.(map[string]interface{})
		if !ok || getString(module["type"]) != moduleType {
			continue
		}
		data, _ := module["data"].(map[string]interface{})
		return data
	}
	return map[string]interface{}{}
}

func moduleHasItems(content map[string]interface{}, moduleType string) bool {
	data := getModuleData(content, moduleType)
	items, ok := data["items"].([]interface{})
	if !ok {
		return false
	}
	for _, itemValue := range items {
		if strings.TrimSpace(flattenResumeContent(itemValue)) != "" {
			return true
		}
	}
	return false
}

func moduleHasContent(content map[string]interface{}, moduleType string) bool {
	data := getModuleData(content, moduleType)
	return strings.TrimSpace(flattenResumeContent(data)) != ""
}

func estimateResumeYears(content map[string]interface{}) int {
	maxYears := 0
	for _, moduleType := range []string{"work", "project"} {
		data := getModuleData(content, moduleType)
		items, ok := data["items"].([]interface{})
		if !ok {
			continue
		}
		for _, itemValue := range items {
			item, ok := itemValue.(map[string]interface{})
			if !ok {
				continue
			}
			startYear := parseYear(getString(item["startDate"]))
			endYear := parseYear(getString(item["endDate"]))
			if startYear == 0 {
				continue
			}
			if endYear == 0 {
				endYear = time.Now().Year()
			}
			if years := endYear - startYear; years > maxYears {
				maxYears = years
			}
		}
	}
	return maxYears
}

func parseYear(value string) int {
	value = strings.TrimSpace(value)
	if len(value) < 4 {
		return 0
	}
	var year int
	if _, err := fmt.Sscanf(value[:4], "%d", &year); err != nil {
		return 0
	}
	return year
}

func expectedYearsForSeniority(level string) int {
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "intern":
		return 0
	case "junior":
		return 1
	case "mid":
		return 3
	case "senior":
		return 5
	case "lead":
		return 7
	case "principal":
		return 10
	default:
		return 0
	}
}

func buildJDScoreSummary(overallScore int, breakdown model.JDScoreBreakdown) string {
	return fmt.Sprintf("综合匹配分为%d分，ATS完整性%d分，关键词匹配%d分，资历匹配%d分。", overallScore, breakdown.ATS.Score, breakdown.KeywordMatch.Score, breakdown.SeniorityFit.Score)
}

func buildJDScoreImprovements(breakdown model.JDScoreBreakdown) []model.JDScoreImprovement {
	items := []model.JDScoreImprovement{}
	if len(breakdown.KeywordMatch.Missing) > 0 {
		items = append(items, model.JDScoreImprovement{Category: "keyword", PotentialGain: 12, Action: "在工作或项目经历中补充缺失关键词：" + strings.Join(limitStrings(breakdown.KeywordMatch.Missing, 5), "、"), Priority: "high"})
	}
	for _, check := range breakdown.ATS.Checks {
		if !check.Passed && check.Suggestion != "" {
			items = append(items, model.JDScoreImprovement{Category: "ats", PotentialGain: 6, Action: check.Suggestion, Priority: "medium"})
		}
	}
	if breakdown.SeniorityFit.LevelMatch == "underqualified" {
		items = append(items, model.JDScoreImprovement{Category: "seniority", PotentialGain: 8, Action: "强化与目标岗位年限和职责匹配的经历描述", Priority: "high"})
	}
	return limitImprovements(items, 5)
}

func limitStrings(values []string, limit int) []string {
	if len(values) <= limit {
		return values
	}
	return values[:limit]
}

func limitImprovements(values []model.JDScoreImprovement, limit int) []model.JDScoreImprovement {
	if len(values) <= limit {
		return values
	}
	return values[:limit]
}

func suggestionIfFailed(passed bool, suggestion string) string {
	if passed {
		return ""
	}
	return suggestion
}

func clampScore(score int) int {
	if score < 0 {
		return 0
	}
	if score > 100 {
		return 100
	}
	return score
}

func scoreLevel(score int) string {
	switch {
	case score >= 90:
		return "A"
	case score >= 85:
		return "A-"
	case score >= 80:
		return "B+"
	case score >= 75:
		return "B"
	case score >= 70:
		return "B-"
	case score >= 65:
		return "C+"
	case score >= 60:
		return "C"
	default:
		return "D"
	}
}
