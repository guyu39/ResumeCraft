# AI 功能：JD 匹配与求职信生成技术方案

文档版本：v1.0
更新日期：2026-05-27

## 1. 背景与目标

当前 ResumeCraft 已具备 AI 简历评估和富文本润色能力，但评估维度主要面向通用简历质量，尚未覆盖具体投递场景。新增功能目标是让用户围绕目标岗位完成更有针对性的简历优化和投递材料生成。

本方案包含两个功能：

1. **JD 匹配度分析**：用户粘贴目标岗位 JD，系统基于当前简历分析岗位匹配度、命中关键词、缺口和修改建议。
2. **求职信生成**：用户输入岗位、公司和 JD，系统结合当前简历生成可复制的求职信或投递邮件正文。

## 2. 功能范围

### 2.1 JD 匹配度分析

输入：

- 当前简历结构化内容
- JD 文本
- 目标岗位，可选
- 公司名称，可选

输出：

- 匹配度分数和等级
- 综合摘要
- 关键词匹配情况
- 简历优势
- 能力或经历缺口
- 简历修改建议
- 下一步行动项

### 2.2 求职信生成

输入：

- 当前简历结构化内容
- 岗位名称
- 公司名称
- JD 文本，可选但推荐
- 语气风格
- 语言

输出：

- 求职信标题
- 求职信正文
- 使用到的简历亮点
- 投递前建议

## 3. 复用现有架构

新增功能复用现有 AI 基础设施：

| 层级 | 复用内容 |
|------|----------|
| AI 配置 | `ai_configs`、`GET/POST /api/ai/config` |
| 模型调用 | `backend/internal/service/ai/provider.go` 的 OpenAI-compatible Provider |
| 会话历史 | `ai_conversations`、`ai_messages` |
| 前端请求 | `src/api/ai.ts` |
| 流式交互 | 参考现有 `evaluateStream` 与 `useResumeEvaluation` |
| 右侧面板 | `src/components/layout/RightPanel.tsx` 与 `src/components/layout/ai/` |

不新增数据库表，新增会话类型：

- `jd_match`
- `cover_letter`

## 4. API 设计

### 4.1 JD 匹配度分析

```http
POST /api/ai/jd-match/stream
Content-Type: application/json
Authorization: Bearer <token>
```

请求体：

```json
{
  "resumeId": "resume-id",
  "content": {},
  "jdText": "岗位描述文本",
  "targetTitle": "前端工程师",
  "companyName": "某公司"
}
```

SSE 流式事件：

```json
{"type":"model","model":"模型名称"}
{"type":"summary","summary":"整体匹配摘要"}
{"type":"match_score","matchScore":82,"level":"B+"}
{"type":"keyword_match","keywordMatches":[{"keyword":"React","required":true,"matched":true,"evidence":"项目经历中体现"}]}
{"type":"strength_item","strengths":["项目经历与岗位方向一致"]}
{"type":"gap_item","gaps":[{"severity":"medium","requirement":"K8s 经验","currentEvidence":"简历未体现","suggestion":"补充部署或容器化经历"}]}
{"type":"resume_suggestion","resumeSuggestions":[{"moduleType":"project","title":"补充技术栈","suggestion":"在项目经历中补充 React + TypeScript + 性能优化结果"}]}
{"type":"action_item","actionItems":["优先补充 JD 中出现频率最高的技能关键词"]}
{"type":"finish"}
```

最终 `event: done` 返回：

```json
{
  "matchScore": 82,
  "level": "B+",
  "summary": "...",
  "keywordMatches": [],
  "strengths": [],
  "gaps": [],
  "resumeSuggestions": [],
  "actionItems": [],
  "rawText": "...",
  "model": "...",
  "conversationId": "..."
}
```

### 4.2 求职信生成

```http
POST /api/ai/cover-letter
Content-Type: application/json
Authorization: Bearer <token>
```

请求体：

```json
{
  "resumeId": "resume-id",
  "content": {},
  "jdText": "岗位描述文本",
  "jobTitle": "前端工程师",
  "companyName": "某公司",
  "tone": "professional",
  "language": "zh-CN"
}
```

响应体：

```json
{
  "title": "求职信 - 前端工程师",
  "coverLetter": "尊敬的招聘负责人：...",
  "highlightsUsed": ["React + TypeScript 项目经验"],
  "tips": ["投递前建议补充公司业务相关内容"],
  "rawText": "...",
  "model": "...",
  "conversationId": "..."
}
```

## 5. 后端设计

### 5.1 数据模型

修改 `backend/internal/model/ai.go`：

- 新增 `ConversationTypeJDMatch`
- 新增 `ConversationTypeCoverLetter`
- 新增 `JDMatchRequest` / `JDMatchResponse`
- 新增 `CoverLetterRequest` / `CoverLetterResponse`

### 5.2 Handler

修改 `backend/internal/handler/ai.go`：

- 新增 `JDMatchStream`
- 新增 `GenerateCoverLetter`

JD 匹配接口负责设置 SSE 响应头，并转发 Service 推送的流式事件。

### 5.3 Service

修改 `backend/internal/service/ai/service.go`：

- 新增 `StreamJDMatch`
- 新增 `GenerateCoverLetter`
- 新增 `buildJDMatchPrompt`
- 新增 `buildCoverLetterPrompt`
- 新增结果解析函数

Service 负责读取 AI 配置、解密 API Key、调用模型、解析结果、保存会话历史。

## 6. 前端设计

### 6.1 API 客户端

修改 `src/api/ai.ts`：

- 新增 `JDMatchRequest`
- 新增 `JDMatchResponse`
- 新增 `JDMatchStreamPartialResult`
- 新增 `CoverLetterRequest`
- 新增 `CoverLetterResponse`
- 新增 `aiApi.jdMatchStream`
- 新增 `aiApi.generateCoverLetter`

### 6.2 Hooks

新增：

- `src/hooks/useJDMatch.ts`
- `src/hooks/useCoverLetter.ts`

### 6.3 UI 组件

新增：

- `src/components/layout/ai/JDMatchPanel.tsx`
- `src/components/layout/ai/CoverLetterPanel.tsx`

右侧 AI 入口接入方式：

- 保留原有简历评估功能。
- 新增 JD 匹配和求职信入口。
- 后续可收敛为统一 AI 助手 Tab。

## 7. Prompt 输出格式

### 7.1 JD Matching

JD Matching 使用 NDJSON，每行一个完整 JSON 对象。输出顺序固定，便于前端流式渲染。

### 7.2 Cover Letter

求职信使用单个 JSON 对象。Service 解析第一个 `{` 到最后一个 `}` 之间的内容，避免模型附加说明导致解析失败。

## 8. 输入限制与异常处理

| 场景 | 处理 |
|------|------|
| 未登录 | 返回 401 |
| 未配置 AI | 返回明确错误，前端提示先配置 AI |
| JD 为空 | 前端禁止提交，后端返回 400 |
| JD 超长 | 前端建议限制 20,000 字符，后端强制限制 30,000 字符 |
| AI 输出格式异常 | 保留 rawText，提示用户重试 |
| 模型调用失败 | 返回标准错误信息 |

## 9. 会话历史

新增功能历史继续写入 `ai_conversations`：

- JD 匹配：`type = jd_match`
- 求职信：`type = cover_letter`

最终结构化结果写入 `context`，完整 AI 输出写入 `ai_messages`。

## 10. 验证步骤

### 10.1 自动验证

```bash
npm run build
cd backend && go test ./...
cd backend && go build ./...
```

### 10.2 手动验证

1. 未登录访问新接口返回 401。
2. 未配置 AI 时提示先配置 AI。
3. JD 为空时不可提交。
4. JD 超长时返回 400。
5. JD 匹配可流式展示结果，最终结果结构完整。
6. 求职信可生成、复制、重新生成。
7. 历史记录能按 `jd_match` 和 `cover_letter` 查询。
8. 原有 AI 简历评估、AI 润色、简历保存、PDF 导出不受影响。
