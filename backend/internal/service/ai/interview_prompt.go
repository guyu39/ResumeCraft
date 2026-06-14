package ai

import (
	"encoding/json"
	"fmt"
	"strings"

	"resumecraft-pdf-backend/internal/model"
)

func (s *service) buildInterviewGeneratePrompt(content map[string]interface{}, jdText, targetTitle, companyName string, questionCount int, rc roundConfig, focusAreas []string) string {
	resumeJSON, _ := json.MarshalIndent(sanitizeAIResumeContent(content), "", "  ")

	areaNames := map[string]string{
		"technical":  "技术深度",
		"project":    "项目经验",
		"industry":   "行业知识",
		"soft_skill": "软技能",
		"behavioral": "行为面试",
	}
	categoryOrder := []string{"technical", "project", "industry", "soft_skill", "behavioral"}

	// 计算每类绝对题数
	counts := map[string]int{}
	focusDesc := "全部维度（按轮次默认权重）"

	if len(focusAreas) > 0 {
		var names []string
		validAreas := make(map[string]bool)
		for _, a := range focusAreas {
			if n, ok := areaNames[a]; ok {
				names = append(names, n)
				validAreas[a] = true
			}
		}
		if len(names) > 0 {
			focusDesc = "用户勾选: " + strings.Join(names, "、") + "（重点考察）"
			// 勾选维度均分题数；未勾选维度仅当 questionCount >= 5 时每类各分 1 题（保证多样性）
			selectedCount := len(validAreas)
			unselectedCount := 5 - selectedCount

			unselectedEach := 0
			if questionCount >= 10 && unselectedCount > 0 {
				unselectedEach = 1
			}

			remaining := questionCount - unselectedEach*unselectedCount
			if remaining < selectedCount {
				remaining = selectedCount
				unselectedEach = 0
			}
			perSelected := remaining / selectedCount
			leftover := remaining - perSelected*selectedCount

			for _, key := range categoryOrder {
				if validAreas[key] {
					n := perSelected
					if leftover > 0 {
						n++
						leftover--
					}
					counts[key] = n
				} else {
					counts[key] = unselectedEach
				}
			}
		}
	}

	if len(counts) == 0 {
		// 按轮次默认百分比计算
		weights := map[string]int{
			"technical":  rc.techW,
			"project":    rc.projectW,
			"industry":   rc.industryW,
			"soft_skill": rc.softSkillW,
			"behavioral": rc.behavioralW,
		}
		assigned := 0
		for _, key := range categoryOrder {
			n := questionCount * weights[key] / 100
			counts[key] = n
			assigned += n
		}
		// 余数补给项目经验或技术深度
		diff := questionCount - assigned
		if diff > 0 {
			if counts["project"] > 0 || weights["project"] > 0 {
				counts["project"] += diff
			} else {
				counts["technical"] += diff
			}
		} else if diff < 0 {
			counts["technical"] += diff
		}
	}

	// 生成"每类题数明细"文本
	var distLines []string
	for _, key := range categoryOrder {
		distLines = append(distLines, fmt.Sprintf("- %s (%s): %d 道", areaNames[key], key, counts[key]))
	}

	return fmt.Sprintf(`你是一位资深面试官。根据以下岗位 JD 和候选人简历，生成**恰好 %d 道**面试考察题。

⚠️ 强制要求：
- 必须生成且仅生成 %d 道题，不能少，也不能多
- 每道题的 evaluationCriteria 简洁即可（keyPoints 2-3 条，bonusPoints/redFlags 各 1 条）
- 题目文本控制在 50 字以内，要点描述每条 20 字以内
- 不要输出任何 NDJSON 之外的解释性文字（不要 markdown 代码块）

## 目标岗位
- 岗位：%s
- 公司：%s

## 岗位 JD
%s

## 候选人简历摘要
%s

## 面试轮次
%s

## 面试侧重
%s

## 题目分配（绝对题数，必须严格遵守）

%s

合计：%d 道

⚠️ 即使某类只有 1 道题也必须生成；如果某类是 0 道则完全跳过该类。
难度分布：基础 %d%% / 中等 %d%% / 进阶 %d%%

项目经验类题目必须结合候选人简历中的具体项目提问，例如：
"你在简历中提到在{公司}负责{项目}，请描述..."

## 输出格式

只输出 NDJSON，每行一个 JSON 对象。共输出 %d 行 question + 1 行 finish，总共 %d 行。

第 1 行：{"type":"question","index":0,"question":{...}}
第 2 行：{"type":"question","index":1,"question":{...}}
...
第 %d 行：{"type":"question","index":%d,"question":{...}}
最后一行：{"type":"finish","timestamp":1700000000000}

## 单题 question 字段结构（紧凑版）

{
  "id": "q_N",
  "category": "technical|project|industry|soft_skill|behavioral",
  "difficulty": "basic|medium|advanced",
  "question": "题目（≤50字）",
  "hints": ["提示1"],
  "evaluationCriteria": {
    "keyPoints": ["要点1", "要点2"],
    "bonusPoints": ["加分项1"],
    "redFlags": ["减分1"]
  }
}

现在请按要求输出 %d 道题 + 1 行 finish：`,
		questionCount, questionCount,
		targetTitle, companyName, jdText, string(resumeJSON),
		rc.description, focusDesc,
		strings.Join(distLines, "\n"), questionCount,
		rc.basicPct, rc.mediumPct, rc.advancedPct,
		questionCount, questionCount+1,
		questionCount, questionCount-1,
		questionCount,
	)
}

func (s *service) buildInterviewEvaluatePrompt(questions []model.InterviewQuestion, answers []model.InterviewAnswer, targetTitle, companyName string, rc roundConfig) string {
	var qaPairs []string
	answerMap := make(map[string]model.InterviewAnswer)
	for _, a := range answers {
		answerMap[a.QuestionID] = a
	}

	for i, q := range questions {
		a, ok := answerMap[q.ID]
		answerText := "（未回答/跳过）"
		if ok && !a.Skipped {
			answerText = a.Answer
		}
		qaPairs = append(qaPairs, fmt.Sprintf("### Q%d [%s] %s\n候选人回答：%s", i+1, q.Difficulty, q.Question, answerText))
	}

	return fmt.Sprintf(`你是一位资深面试官，正在评估候选人对面试题的回答。

## 岗位信息
- 岗位：%s
- 公司：%s
- 面试轮次：%s

## 面试题目与回答
%s

## 评估要求

1. 逐题评分（0-100分），标注命中要点、遗漏要点、减分信号
2. 按维度汇总评分（技术深度/项目经验/行业知识/软技能/行为面试）
3. 按面试轮次预估通过率：
   - technical_1 (一面): 侧重基础技术+项目概述
   - technical_2 (二面): 侧重架构设计+系统思维
   - hr (HR面): 侧重软技能+行为面试
4. 给出分优先级的提升建议，标注针对哪一轮面试

## 通过率评级映射
- A  (90-100): 极有竞争力
- A- (80-89):  很有竞争力
- B+ (70-79):  有竞争力
- B  (60-69):  有一定竞争力
- B- (50-59):  竞争力不足
- C+ (40-49):  竞争力较弱
- C  (30-39):  竞争力很弱
- D  (0-29):   建议换岗

## 输出格式：NDJSON

逐题评估：
{"type":"question_eval","questionId":"q_N","score":85,"briefFeedback":"50字反馈","keyPointsHit":[...],"missedPoints":[...],"redFlagsFound":[...]}

维度评分：
{"type":"dimension_score","dimension":"technical","score":78,"level":"B+","feedback":"100字维度反馈"}

轮次通过率：
{"type":"round_score","round":"technical_1","score":85}

综合评分：
{"type":"overall","score":72,"level":"B+","roundScores":{"technical_1":85,"technical_2":72,"hr":80}}

提升建议：
{"type":"improvement","priority":"high","area":"技术深度","suggestion":"具体建议","estimatedGain":8,"targetRound":"technical_2"}

结束：
{"type":"finish","timestamp":毫秒时间戳}`, targetTitle, companyName, rc.description, strings.Join(qaPairs, "\n\n"))
}

func (s *service) buildTranscriptAnalyzePrompt(content map[string]interface{}, transcriptText, jdText, targetTitle, companyName string, rc roundConfig) string {
	resumeJSON, _ := json.MarshalIndent(sanitizeAIResumeContent(content), "", "  ")
	_ = jdText // JD 暂未参与提示词，保留参数

	return fmt.Sprintf(`你是一位资深面试官，正在分析一份面试录音的转写文本。

⚠️ 强制要求（必须遵守）：
- 最多提取 12 个最有代表性的问答对（如果转写更长，挑选最关键的提问）
- 所有反馈控制在 30 字以内（briefFeedback / feedback / suggestion）
- keyPointsHit / missedPoints 各最多 3 条，每条 ≤15 字
- 不要 markdown 代码块，只输出 NDJSON

## 岗位信息
- 岗位：%s
- 公司：%s
- 面试轮次：%s

## 候选人简历摘要
%s

## 面试录音转写
%s

## 输出顺序（严格按此顺序输出）

第一阶段（每个问答对一行）：
{"type":"qa_extracted","index":0,"question":"...","answer":"..."}
{"type":"qa_eval","index":0,"score":72,"briefFeedback":"...","keyPointsHit":["..."],"missedPoints":["..."]}
（重复 N 个问答对，N ≤ 12）

第二阶段（5 个维度，每个一行）：
{"type":"dimension_score","dimension":"technical","score":78,"level":"B+","feedback":"≤30字"}
（5 个维度：technical / project / industry / soft_skill / behavioral）

第三阶段（轮次通过率，3 个，必须给出 reason 解释为什么是这个分）：
{"type":"round_score","round":"technical_1","score":72,"reason":"基础概念扎实但深度不足，30字内说明"}
{"type":"round_score","round":"technical_2","score":65,"reason":"系统设计经验欠缺，30字内说明"}
{"type":"round_score","round":"hr","score":80,"reason":"沟通自然、动机清晰，30字内说明"}

第四阶段（综合，必须有 summary 总结候选人整体表现）：
{"type":"overall","score":72,"level":"B+","summary":"50字内总评：候选人优势/短板/总体建议","roundScores":{"technical_1":72,"technical_2":65,"hr":80}}

第五阶段（最多 5 条改进建议）：
{"type":"improvement","priority":"high","area":"...","suggestion":"≤30字","estimatedGain":10,"targetRound":"technical_2"}

结束：
{"type":"finish","sessionId":"","timestamp":1700000000000}

## 提取规则
- 面试官提问通常以"请"、"能不能"、"怎么"、"为什么"等开头
- 候选人回答紧跟在面试官提问之后
- 忽略寒暄和闲聊
- 如果转写不规整，根据语义判断角色

现在开始输出（直接以 {"type":"qa_extracted",... 开头，不要任何前缀）：`,
		targetTitle, companyName, rc.description, string(resumeJSON), transcriptText)
}
