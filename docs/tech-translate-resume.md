# 多语言简历一键转化 (i18n & Translation) — 技术设计文档

> 版本：v1.0 | 日期：2026-05-29 | 作者：AI Agent  
> 项目：ResumeCraft（简历大师）| 技术栈：React + Go + PostgreSQL + AI

---

## 1. 背景与目标

### 1.1 问题

许多外企和跨国公司要求候选人提供**中英双语简历**。当前系统中简历的 `locale` 字段（`zh-CN` / `en-US`）仅在创建时设定，用户若需要另一语言版本，必须从零手动创建并逐项翻译——耗时且易遗漏、格式难以对齐。

### 1.2 目标

| # | 目标 | 验收标准 |
|---|------|----------|
| G1 | **一键翻译**：在现有简历基础上，AI 驱动翻译为另一语言版本 | 点击"翻译为英文"→ 生成新简历副本，所有文本字段已翻译，排版/模板/主题色完全继承 |
| G2 | **排版保真**：翻译后的简历保留原简历的全部样式和模块结构 | template、themeColor、styleSettings、模块顺序/显隐完全一致 |
| G3 | **双向支持**：中文→英文、英文→中文 | locale 切换正确，枚举值（学历、技能等级等）按目标语言映射 |
| G4 | **可审计**：翻译操作生成 AI 对话记录 | ai_conversations 表可追溯，conversation type = `translate` |
| G5 | **渐进式**：翻译完成后用户可在编辑器中微调 | 生成的是完整 Resume 副本，用户可自由修改 |

### 1.3 非目标

- 不做"实时双语对照编辑器"
- 不做"自动检测简历语言"
- 不做"简历片段级翻译"（MVP 只做全量翻译）

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────┐
│  前端 (React)                                             │
│                                                           │
│  ┌──────────┐    点击"翻译为英文/中文"                       │
│  │ 编辑器    │ ─────────────────────────────────┐          │
│  │ 工具栏    │                                  ▼          │
│  └──────────┘    ┌──────────────────────────────────┐     │
│                  │  TranslateDialog                  │     │
│                  │  - 选择目标语言                     │     │
│                  │  - 预览翻译范围                     │     │
│                  │  - 确认翻译 → POST /translate      │     │
│                  └──────────┬───────────────────────┘     │
│                             │                              │
│                  ┌──────────▼───────────────────────┐     │
│                  │  翻译结果预览 (DiffView)           │     │
│                  │  - 左右对照 / 叠加对比             │     │
│                  │  - 确认创建 → POST /resumes        │     │
│                  └──────────────────────────────────┘     │
└──────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────┐
│  后端 (Go / Gin)                                          │
│                                                           │
│  POST /api/ai/translate                                   │
│  ┌───────────────────────────────────────────────────┐    │
│  │  TranslateResume (service/ai)                      │    │
│  │  1. 获取源简历 → sanitizeAIResumeContent           │    │
│  │  2. 构建 translate prompt                          │    │
│  │  3. 调用 AI (Complete, 非 Stream)                   │    │
│  │  4. 解析 JSON 响应 → 翻译后的 modules              │    │
│  │  5. 合并原样式 + 翻译内容 → 完整 Resume 结构       │    │
│  │  6. 保存 ai_conversation                           │    │
│  │  7. 返回翻译结果 (不自动创建简历)                    │    │
│  └───────────────────────────────────────────────────┘    │
│                                                           │
│  前端确认后 → POST /api/resumes (现有 CreateResume)       │
└──────────────────────────────────────────────────────────┘
```

**设计决策**：翻译 API 只返回翻译后的数据，不自动创建简历。前端先展示翻译结果供用户确认，确认后再调用现有的 `CreateResume` 创建副本。这样用户有机会在创建前修正 AI 的翻译。

---

## 3. 数据模型

### 3.1 无需新增数据库表

翻译结果是新的 Resume 副本，走现有的 `resumes` 表。唯一新增字段是 AI 对话类型 `translate`（在 `ai_conversations.type` 枚举中扩展）。

### 3.2 源简历 → 翻译简历映射

| 字段 | 源简历 | 翻译简历 | 规则 |
|------|--------|----------|------|
| `id` | 原始 UUID | 新 UUID | 全新记录 |
| `title` | "张三-前端工程师" | "Zhang San - Frontend Engineer" | AI 翻译 |
| `locale` | `zh-CN` | `en-US` | 翻译方向决定 |
| `template` | `classic` | `classic` | **完全继承** |
| `themeColor` | `#1A56DB` | `#1A56DB` | **完全继承** |
| `styleSettings` | 原值 | 原值 | **完全继承**（字体可按 locale 调整，见 3.3） |
| `modules` | 原模块 | 翻译模块 | 结构继承，文本翻译 |

### 3.3 字体回退策略

英文简历不应使用"Microsoft YaHei"，中文简历不应使用纯英文字体。翻译时 `styleSettings` 的字体字段需要按 locale 回退：

```go
// 后端回退规则
var LocaleFontFallback = map[string]struct {
    BodyFont       string
    TitleFont      string
}{
    "zh-CN": {BodyFont: "Microsoft YaHei", TitleFont: "Microsoft YaHei"},
    "en-US": {BodyFont: "Georgia",        TitleFont: "Georgia"},
}
```

前端也可以在创建副本时自动调整，两种方案均可。推荐**前端调整**——前端有完整的 `DEFAULT_RESUME_STYLE_SETTINGS` 和行业预设，逻辑更集中。

### 3.4 枚举值翻译映射

以下字段的值是中文枚举，翻译时需要映射到英文等价物：

| 字段 | 中文值 | 英文映射 |
|------|--------|----------|
| `degree` | 初中/中专/高中/大专/本科/硕士/博士 | Middle School/Vocational/High School/Associate/Bachelor/Master/PhD |
| `skillLevel` | 1(入门)/2(熟悉)/3(熟练)/4(精通) | 数值不变，label 映射：Beginner/Familiar/Proficient/Expert |
| `workYears` | 应届毕业生/1年以下/... | Fresh Graduate/Less than 1 year/... |
| `gender` | 男/女 | Male/Female |
| `politics` | 群众/共青团员/中共党员 | — **英文简历通常移除此字段** |

> **关键决策**：`politics`（政治面貌）、`hometown`（籍贯）在英文简历中属于中国特有字段，翻译时 AI 应**默认隐藏**这些模块（设 `visible: false`）或移除对应 extraInfo 项，用户可手动恢复。

---

## 4. API 设计

### 4.1 新增接口

```
POST /api/ai/translate
```

**请求体**：

```json
{
  "resumeId": "源简历ID",
  "targetLocale": "en-US",
  "options": {
    "keepChineseFields": false,
    "fontFallback": true
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `resumeId` | string | ✅ | 源简历 ID |
| `targetLocale` | string | ✅ | 目标语言：`en-US` 或 `zh-CN` |
| `options.keepChineseFields` | bool | ❌ | 默认 false。为 true 时保留 politics/hometown 等中国特有字段 |
| `options.fontFallback` | bool | ❌ | 默认 true。自动调整字体为 locale 适配字体 |

**响应体**：

```json
{
  "translatedModules": [...],
  "translatedTitle": "Zhang San - Frontend Engineer",
  "targetLocale": "en-US",
  "suggestedStyleSettings": {
    "fontFamily": "Georgia",
    "moduleTitleFontFamily": "Georgia"
  },
  "conversationId": "ai-对话ID",
  "model": "deepseek-chat",
  "warnings": ["politics 字段已隐藏（英文简历通常不需要）"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `translatedModules` | Module[] | 翻译后的模块数组，结构与原 modules 一致 |
| `translatedTitle` | string | 翻译后的简历标题 |
| `targetLocale` | string | 目标语言 |
| `suggestedStyleSettings` | object | 建议调整的样式设置（仅字体相关） |
| `conversationId` | string | AI 对话 ID |
| `model` | string | 使用的 AI 模型 |
| `warnings` | string[] | 翻译过程中的警告信息 |

### 4.2 现有接口复用

| 接口 | 用途 |
|------|------|
| `GET /api/resumes/:id` | 获取源简历数据 |
| `POST /api/resumes` | 创建翻译后的简历副本 |
| `GET /api/ai/config` | 获取 AI 配置（检查是否启用） |

### 4.3 路由注册

```go
// router/router.go - 在 ai 路由组下新增
aiGroup.POST("/translate", h.TranslateResume)
```

---

## 5. 后端实现

### 5.1 目录结构变更

```
backend/internal/
├── model/
│   └── ai.go                  # 新增 TranslateRequest, TranslateResponse
├── handler/
│   └── ai.go                  # 新增 TranslateResume handler
├── service/ai/
│   ├── service.go             # Service interface 新增 Translate 方法
│   └── translate.go           # 🆕 翻译核心逻辑（新文件）
```

### 5.2 Model 定义

**`model/ai.go` 新增**：

```go
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
    TranslatedModules     []map[string]interface{} `json:"translatedModules"`
    TranslatedTitle       string                   `json:"translatedTitle"`
    TargetLocale          string                   `json:"targetLocale"`
    SuggestedStyleSettings *ResumeStyleSettings    `json:"suggestedStyleSettings,omitempty"`
    ConversationID        string                   `json:"conversationId"`
    Model                 string                   `json:"model"`
    Warnings              []string                 `json:"warnings"`
}
```

**`model/ai.go` ConversationType 新增**：

```go
ConversationTypeTranslate ConversationType = "translate"
```

### 5.3 Service 接口扩展

```go
// service/ai/service.go - Service interface 新增
Translate(ctx context.Context, userID string, req model.TranslateRequest) (*model.TranslateResponse, error)
```

### 5.4 翻译核心逻辑

**`service/ai/translate.go`**（新文件）：

```go
package ai

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "strings"

    "resumecraft-pdf-backend/internal/model"
    aiStorage "resumecraft-pdf-backend/internal/storage/ai"

    "github.com/google/uuid"
)

// localeFontFallback 字体回退映射
var localeFontFallback = map[string]struct {
    BodyFont  string
    TitleFont string
}{
    "zh-CN": {BodyFont: "Microsoft YaHei", TitleFont: "Microsoft YaHei"},
    "en-US": {BodyFont: "Georgia", TitleFont: "Georgia"},
}

// Translate 翻译简历
func (s *service) Translate(ctx context.Context, userID string, req model.TranslateRequest) (*model.TranslateResponse, error) {
    // 1. 获取 AI 配置
    cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
    if err != nil {
        return nil, ErrAIConfigNotFound
    }
    if !cfg.Enabled {
        return nil, fmt.Errorf("AI 功能未启用")
    }
    apiKey, err := s.encryption.Decrypt(cfg.APIKeyEncrypted)
    if err != nil {
        return nil, fmt.Errorf("failed to decrypt API key")
    }

    // 2. 获取源简历
    resumeDetail, err := s.getResumeContent(ctx, userID, req.ResumeID)
    if err != nil {
        return nil, fmt.Errorf("获取源简历失败: %w", err)
    }

    // 3. 构建翻译 prompt
    sourceLocale := resumeDetail.Locale
    if sourceLocale == "" {
        sourceLocale = "zh-CN"
    }
    prompt := buildTranslatePrompt(resumeDetail, sourceLocale, req.TargetLocale, req.Options.KeepChineseFields)

    // 4. 调用 AI
    result, err := s.aiProvider.Complete(ctx, CompleteRequest{
        APIKey:    apiKey,
        BaseURL:   cfg.BaseURL,
        Model:     cfg.DefaultModel,
        Prompt:    prompt,
        TimeoutMs: cfg.TimeoutMs,
    })
    if err != nil {
        log.Printf("[ai] Translate failed: %v", err)
        return nil, ErrAIRequestFailed
    }

    // 5. 解析响应
    translatedModules, translatedTitle, warnings, err := parseTranslateResponse(result.Text, resumeDetail.Modules)
    if err != nil {
        log.Printf("[ai] Failed to parse translate response: %v", err)
        return nil, fmt.Errorf("翻译结果解析失败")
    }

    // 6. 建议样式调整
    var suggestedSettings *model.ResumeStyleSettings
    if req.Options.FontFallback {
        if fallback, ok := localeFontFallback[req.TargetLocale]; ok {
            s := resumeDetail.StyleSettings // 复制
            s.FontFamily = fallback.BodyFont
            s.ModuleTitleFontFamily = fallback.TitleFont
            suggestedSettings = &s
        }
    }

    // 7. 保存 AI 对话
    convID := uuid.New().String()
    contextData := map[string]any{
        "sourceResumeId": req.ResumeID,
        "sourceLocale":   sourceLocale,
        "targetLocale":   req.TargetLocale,
        "translatedTitle": translatedTitle,
        "warnings":       warnings,
        "model":          cfg.DefaultModel,
    }
    contextJSON, _ := json.Marshal(contextData)
    conversation := &aiStorage.ConversationRecord{
        ID:       convID,
        UserID:   userID,
        ResumeID: &req.ResumeID,
        Type:     string(model.ConversationTypeTranslate),
        Title:    stringPtr(fmt.Sprintf("简历翻译 %s → %s", sourceLocale, req.TargetLocale)),
        Context:  contextJSON,
    }
    if err := s.repo.Create(ctx, conversation); err != nil {
        log.Printf("[ai] Failed to create translate conversation: %v", err)
    }
    s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
        ID:             uuid.New().String(),
        ConversationID: convID,
        Role:           "user",
        Content:        prompt,
        Model:          &cfg.DefaultModel,
    })
    s.repo.AddMessage(ctx, &aiStorage.MessageRecord{
        ID:             uuid.New().String(),
        ConversationID: convID,
        Role:           "assistant",
        Content:        result.Text,
        Model:          &cfg.DefaultModel,
    })

    return &model.TranslateResponse{
        TranslatedModules:     translatedModules,
        TranslatedTitle:       translatedTitle,
        TargetLocale:          req.TargetLocale,
        SuggestedStyleSettings: suggestedSettings,
        ConversationID:        convID,
        Model:                 cfg.DefaultModel,
        Warnings:              warnings,
    }, nil
}
```

### 5.5 翻译 Prompt 设计

这是整个功能的**核心**。Prompt 需要约束 AI 输出结构化 JSON，并且保持模块结构完全对齐。

```go
func buildTranslatePrompt(detail *resumeDetailForTranslate, sourceLocale, targetLocale string, keepChineseFields bool) string {
    var sb strings.Builder

    sb.WriteString("你是资深简历翻译专家，将简历从一种语言翻译为另一种语言，严格遵循以下规则。\n\n")

    // ====== 强制规则 ======
    sb.WriteString("【强制规则】\n")
    sb.WriteString("1. 只返回一个 JSON 对象，禁止输出 Markdown、代码块、注释或额外说明。\n")
    sb.WriteString("2. 翻译必须覆盖所有模块的所有文本字段，禁止遗漏。\n")
    sb.WriteString("3. 翻译后的模块结构（type、id、visible）必须与源简历完全一致，禁止增删模块或改变顺序。\n")
    sb.WriteString("4. items 数组的顺序和 id 必须与源简历一致，禁止重排或合并。\n")
    sb.WriteString("5. 翻译应自然、专业、适合目标语言国家的求职文化，而非逐字直译。\n")
    sb.WriteString("6. 日期格式保持不变（YYYY-MM 或 YYYY-MM-DD），URL、邮箱、电话号码等纯数据字段不翻译。\n")
    sb.WriteString("7. techStack 数组中的技术名词不翻译（如 React、Go、Kubernetes 保持原样）。\n\n")

    // ====== 枚举映射规则 ======
    sb.WriteString("【枚举字段映射规则】\n")
    if targetLocale == "en-US" {
        sb.WriteString("degree 字段映射：初中→Middle School, 中专→Vocational, 高中→High School, 大专→Associate, 本科→Bachelor, 硕士→Master, 博士→PhD\n")
        sb.WriteString("skillLevel 保持数值不变（1=Beginner, 2=Familiar, 3=Proficient, 4=Expert），但 level 字段中的中文标签不出现\n")
    } else {
        sb.WriteString("degree 字段映射：Middle School→初中, Vocational→中专, High School→高中, Associate→大专, Bachelor→本科, Master→硕士, PhD→博士\n")
    }

    // ====== 中国特有字段处理 ======
    if !keepChineseFields && targetLocale == "en-US" {
        sb.WriteString("\n【中国特有字段处理】\n")
        sb.WriteString("英文简历中通常不包含以下字段，请将对应模块/字段设为空字符串或 visible=false：\n")
        sb.WriteString("- politics（政治面貌）：设为空字符串\n")
        sb.WriteString("- hometown（籍贯）：设为空字符串\n")
        sb.WriteString("- gender（性别）：设为空字符串（除非 JD 明确要求）\n")
        sb.WriteString("- age（年龄/出生年月）：设为空字符串\n")
        sb.WriteString("请在 warnings 数组中列出被隐藏的字段名。\n")
    }

    // ====== 返回格式 ======
    sb.WriteString("\n【返回格式强制要求】\n")
    sb.WriteString("{\n")
    sb.WriteString("  \"translatedTitle\": \"翻译后的简历标题\",\n")
    sb.WriteString("  \"modules\": [与源简历模块结构完全一致的数组，仅文本内容被翻译],\n")
    sb.WriteString("  \"warnings\": [\"被隐藏或调整的字段说明\"]\n")
    sb.WriteString("}\n\n")

    // ====== 源简历数据 ======
    localeName := map[string]string{"zh-CN": "中文", "en-US": "英文"}
    sb.WriteString(fmt.Sprintf("【翻译方向】%s → %s\n\n", localeName[sourceLocale], localeName[targetLocale]))
    sb.WriteString("【源简历 JSON】\n")
    data, _ := json.Marshal(sanitizeAIResumeContentForTranslate(detail))
    sb.WriteString(string(data))

    return sb.String()
}
```

### 5.6 响应解析

```go
func parseTranslateResponse(text string, originalModules []map[string]interface{}) (
    []map[string]interface{}, string, []string, error,
) {
    // 提取 JSON
    firstBrace := strings.Index(text, "{")
    lastBrace := strings.LastIndex(text, "}")
    if firstBrace == -1 || lastBrace == -1 || lastBrace <= firstBrace {
        return nil, "", nil, fmt.Errorf("invalid JSON response")
    }
    jsonStr := text[firstBrace : lastBrace+1]

    var resp struct {
        TranslatedTitle string                   `json:"translatedTitle"`
        Modules         []map[string]interface{} `json:"modules"`
        Warnings        []string                 `json:"warnings"`
    }
    if err := json.Unmarshal([]byte(jsonStr), &resp); err != nil {
        return nil, "", nil, fmt.Errorf("failed to parse: %w", err)
    }

    if len(resp.Modules) == 0 {
        return nil, "", nil, fmt.Errorf("translated modules is empty")
    }

    // 合并：保留原模块的 id 和 visible，用翻译内容覆盖
    merged := mergeTranslatedModules(originalModules, resp.Modules)

    warnings := resp.Warnings
    if warnings == nil {
        warnings = []string{}
    }

    return merged, resp.TranslatedTitle, warnings, nil
}

// mergeTranslatedModules 将翻译结果合并回原模块结构
// 策略：按 index 一一对应，保留原 id/visible/type，替换 data 和 title
func mergeTranslatedModules(original, translated []map[string]interface{}) []map[string]interface{} {
    result := make([]map[string]interface{}, len(original))
    for i, orig := range original {
        merged := make(map[string]interface{})
        // 保留结构性字段
        for _, key := range []string{"id", "type", "visible"} {
            if v, ok := orig[key]; ok {
                merged[key] = v
            }
        }
        // 从翻译结果中取 title 和 data
        if i < len(translated) {
            if title, ok := translated[i]["title"]; ok {
                merged["title"] = title
            }
            if data, ok := translated[i]["data"]; ok {
                // 合并 data：保留原 id，用翻译的文本
                merged["data"] = mergeData(orig["data"], data)
            } else {
                merged["data"] = orig["data"]
            }
        } else {
            // 翻译模块不足，保留原模块
            merged["title"] = orig["title"]
            merged["data"] = orig["data"]
        }
        result[i] = merged
    }
    return result
}

// mergeData 合并模块数据：保留 id 字段，替换文本字段
func mergeData(originalData, translatedData interface{}) interface{} {
    origMap, ok1 := originalData.(map[string]interface{})
    transMap, ok2 := translatedData.(map[string]interface{})
    if !ok1 || !ok2 {
        return translatedData // 无法合并时直接使用翻译结果
    }

    result := make(map[string]interface{})
    // 先写入翻译结果
    for k, v := range transMap {
        result[k] = v
    }
    // 对 items 数组，逐项保留原 id
    if origItems, ok1 := origMap["items"].([]interface{}); ok1 {
        if transItems, ok2 := transMap["items"].([]interface{}); ok2 {
            mergedItems := make([]interface{}, len(origItems))
            for i := range origItems {
                if i < len(transItems) {
                    // 保留原 id
                    if origItem, ok1 := origItems[i].(map[string]interface{}); ok1 {
                        if transItem, ok2 := transItems[i].(map[string]interface{}); ok2 {
                            mergedItem := make(map[string]interface{})
                            for k, v := range transItem {
                                mergedItem[k] = v
                            }
                            if origID, hasID := origItem["id"]; hasID {
                                mergedItem["id"] = origID
                            }
                            mergedItems[i] = mergedItem
                            continue
                        }
                    }
                }
                if i < len(transItems) {
                    mergedItems[i] = transItems[i]
                } else {
                    mergedItems[i] = origItems[i]
                }
            }
            result["items"] = mergedItems
        }
    }
    return result
}
```

### 5.7 获取简历内容

Service 需要访问简历数据。当前 `ai.Service` 不依赖 `resume.Repository`，需要在 service 构造时注入或通过 handler 传入。

**推荐方案**：handler 层获取源简历，将完整内容传入 service。这样不需要修改 service 的依赖关系。

```go
// handler/ai.go - TranslateResume
func (h *Handler) TranslateResume(c *gin.Context) {
    userID, _ := c.Get(middleware.ContextUserIDKey)
    
    var req model.TranslateRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
        return
    }

    // handler 层获取源简历
    resumeDetail, err := h.resumeService.GetByID(c.Request.Context(), userID.(string), req.ResumeID)
    if err != nil {
        response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "源简历不存在")
        return
    }

    // 构建翻译请求的简历内容
    content := map[string]interface{}{
        "title":    resumeDetail.Title,
        "locale":   resumeDetail.Locale,
        "modules":  resumeDetail.Modules,
    }

    result, err := h.aiService.Translate(c.Request.Context(), userID.(string), req, content)
    if err != nil {
        // ... 错误处理
        return
    }
    response.JSONSuccess(c, result)
}
```

相应地，service 接口改为：

```go
Translate(ctx context.Context, userID string, req model.TranslateRequest, content map[string]interface{}) (*model.TranslateResponse, error)
```

---

## 6. 前端实现

### 6.1 新增文件

| 文件 | 说明 |
|------|------|
| `src/api/ai.ts` | 新增 `translate()` 方法 |
| `src/hooks/useTranslate.ts` | 🆕 翻译 Hook |
| `src/components/resume/TranslateDialog.tsx` | 🆕 翻译确认弹窗 |
| `src/components/resume/TranslateDiffView.tsx` | 🆕 翻译对比预览（可选，MVP 可跳过） |

### 6.2 API 层

**`src/api/ai.ts` 新增**：

```typescript
export interface TranslateRequest {
    resumeId: string
    targetLocale: 'zh-CN' | 'en-US'
    options?: {
        keepChineseFields?: boolean
        fontFallback?: boolean
    }
}

export interface TranslateResponse {
    translatedModules: unknown[]
    translatedTitle: string
    targetLocale: string
    suggestedStyleSettings?: ResumeStyleSettings
    conversationId: string
    model: string
    warnings: string[]
}

// aiApi 对象内新增
translate: (data: TranslateRequest) =>
    apiClient.post<TranslateResponse>('/ai/translate', data),
```

### 6.3 Hook：useTranslate

```typescript
// src/hooks/useTranslate.ts
import { useState, useCallback } from 'react'
import { aiApi, type TranslateRequest, type TranslateResponse } from '../api/ai'

export function useTranslate() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<TranslateResponse | null>(null)

    const translate = useCallback(async (req: TranslateRequest) => {
        setLoading(true)
        setError(null)
        setResult(null)
        try {
            const resp = await aiApi.translate(req)
            setResult(resp)
            return resp
        } catch (err) {
            const msg = err instanceof Error ? err.message : '翻译失败'
            setError(msg)
            return null
        } finally {
            setLoading(false)
        }
    }, [])

    const reset = useCallback(() => {
        setLoading(false)
        setError(null)
        setResult(null)
    }, [])

    return { translate, reset, loading, error, result }
}
```

### 6.4 TranslateDialog 组件

```
┌─────────────────────────────────────────────┐
│  🌐 翻译简历                          [×]   │
├─────────────────────────────────────────────┤
│                                              │
│  源语言：中文 (zh-CN)          ← 自动检测    │
│  目标语言：● 英文 (en-US)                    │
│              ○ 中文 (zh-CN)                  │
│                                              │
│  ⚙️ 选项                                    │
│  □ 保留中国特有字段（政治面貌、籍贯等）       │
│  ☑ 自动调整字体                              │
│                                              │
│  ⚠️ 翻译说明                                │
│  · 将生成一份新的简历副本                     │
│  · 排版、模板、主题色完全保留                 │
│  · 技术名词（React、Go 等）不翻译             │
│  · 可在创建后自由编辑                         │
│                                              │
├─────────────────────────────────────────────┤
│           [取消]     [开始翻译 →]             │
└─────────────────────────────────────────────┘
```

**翻译完成后**：

```
┌─────────────────────────────────────────────┐
│  ✅ 翻译完成                          [×]   │
├─────────────────────────────────────────────┤
│                                              │
│  翻译标题：Zhang San - Frontend Engineer     │
│  使用模型：deepseek-chat                     │
│                                              │
│  ⚠️ 注意事项                                 │
│  · politics 字段已隐藏（英文简历通常不需要） │
│  · 建议字体已调整为 Georgia                  │
│                                              │
│  [查看对比] [直接创建]                        │
│                                              │
└─────────────────────────────────────────────┘
```

### 6.5 入口按钮位置

在简历编辑器的工具栏中添加"翻译"按钮，位于模板/主题色按钮旁：

```
[模板 ▾] [主题色 🎨] [🌐 翻译] [...更多]
```

按钮文案根据当前 locale 动态显示：
- `locale === 'zh-CN'` → "🌐 翻译为英文"
- `locale === 'en-US'` → "🌐 翻译为中文"

### 6.6 创建翻译简历副本

用户确认后，调用现有的 `resumeApi.create()`：

```typescript
const handleCreateTranslated = async () => {
    const newResume = await resumeApi.create({
        title: result.translatedTitle,
        locale: result.targetLocale,
        template: currentResume.template,       // 继承
        themeColor: currentResume.themeColor,    // 继承
        styleSettings: result.suggestedStyleSettings || currentResume.styleSettings,
        modules: result.translatedModules,
    })
    // 跳转到新简历编辑页
    navigate(`/resume/${newResume.id}`)
}
```

---

## 7. 枚举值翻译对照表

### 7.1 学历 (Degree)

| 中文 | 英文 | 备注 |
|------|------|------|
| 初中 | Middle School | — |
| 中专 | Vocational School | — |
| 高中 | High School | — |
| 大专 | Associate Degree | — |
| 本科 | Bachelor's Degree | — |
| 硕士 | Master's Degree | — |
| 博士 | PhD / Doctorate | — |

### 7.2 技能等级 (SkillLevel)

| 数值 | 中文标签 | 英文标签 |
|------|---------|----------|
| 1 | 入门 | Beginner |
| 2 | 熟悉 | Familiar |
| 3 | 熟练 | Proficient |
| 4 | 精通 | Expert |

### 7.3 工作年限 (WorkYears)

| 中文 | 英文 |
|------|------|
| 应届毕业生 | Fresh Graduate |
| 1年以下 | Less than 1 year |
| 1-3年 | 1-3 years |
| 3-5年 | 3-5 years |
| 5-10年 | 5-10 years |
| 10年以上 | 10+ years |

### 7.4 模块标题 (Module Title)

| 模块 type | 中文标题 | 英文标题 |
|-----------|---------|----------|
| personal | 个人信息 | Personal Information |
| education | 教育经历 | Education |
| work | 工作经历 | Work Experience |
| project | 项目经历 | Projects |
| skills | 专业技能 | Skills |
| summary | 自我评价 | Summary |
| languages | 语言能力 | Languages |
| awards | 荣誉奖项 | Awards & Honors |
| certificates | 证书资质 | Certifications |
| portfolio | 作品链接 | Portfolio |
| custom | 自定义模块 | *(翻译 title 字段)* |

> **注意**：模块标题的翻译在 AI prompt 中通过枚举映射规则约束，同时在后端 `mergeTranslatedModules` 中对 `title` 字段进行替换。前端 `MODULE_META_LIST` 中的 `label` 仅用于 UI 显示，不参与数据存储。

---

## 8. 测试计划

### 8.1 后端单元测试

| 用例 | 输入 | 预期 |
|------|------|------|
| 中文→英文基础翻译 | 一份完整的中文简历 | 所有文本字段翻译为英文，枚举正确映射 |
| 英文→中文翻译 | 一份英文简历 | 所有文本字段翻译为中文 |
| 中国特有字段隐藏 | 含 politics/hometown 的中文简历 | 英文版中这些字段为空，warnings 包含提示 |
| keepChineseFields=true | 含 politics 的中文简历 | 英文版中保留 politics 字段值（翻译为英文） |
| 空模块处理 | skills 模块 visible=false | 翻译后仍 visible=false，不翻译内容 |
| AI 返回格式异常 | AI 返回非 JSON | 返回错误，前端展示"翻译失败" |
| 模块数量不匹配 | AI 返回 10 个模块，源简历 11 个 | 缺失模块保留原文，warnings 提示 |

### 8.2 前端测试

| 用例 | 操作 | 预期 |
|------|------|------|
| 点击翻译按钮 | 点击工具栏"翻译为英文" | 弹出 TranslateDialog |
| 选择目标语言 | 切换到 zh-CN | 目标语言切换为中文 |
| 翻译中状态 | 点击"开始翻译" | 按钮变为 loading，不可重复点击 |
| 翻译成功 | 翻译完成 | 显示翻译结果摘要和"创建"按钮 |
| 创建副本 | 点击"创建" | 调用 POST /resumes，跳转新简历编辑页 |
| 排版一致性 | 创建后查看 | 模板/主题色/字体/模块顺序与源简历一致 |
| 重复翻译 | 对已翻译的简历再次翻译 | 目标语言自动设为相反方向 |

### 8.3 集成测试

| 用例 | 预期 |
|------|------|
| 中文简历 → 英文 → 导出 PDF | 英文 PDF 正常渲染，无乱码 |
| 翻译后的简历可正常编辑 | 所有表单字段可正常编辑保存 |
| 翻译后的简历可正常 AI 评估 | 评估结果基于英文内容 |

---

## 9. 实现优先级与里程碑

### Phase 1：MVP（核心翻译链路）

| 步骤 | 内容 | 涉及文件 |
|------|------|----------|
| 1 | 后端 model + service + handler | `model/ai.go`, `service/ai/translate.go`, `handler/ai.go`, `router/router.go` |
| 2 | 翻译 Prompt 调优 | `service/ai/translate.go` |
| 3 | 前端 API + Hook | `api/ai.ts`, `hooks/useTranslate.ts` |
| 4 | TranslateDialog 组件 | `components/resume/TranslateDialog.tsx` |
| 5 | 工具栏入口按钮 | `components/layout/CenterPanel.tsx` 或 `RightPanel.tsx` |
| 6 | 端到端测试 | 手动测试 |

### Phase 2：增强体验

| 步骤 | 内容 |
|------|------|
| 7 | 翻译对比预览（TranslateDiffView） |
| 8 | 翻译后自动跳转 + Toast 提示 |
| 9 | 批量翻译（列表页选中多个简历） |
| 10 | 翻译历史记录（AI 对话列表中 type=translate 筛选） |

### Phase 3：高级功能

| 步骤 | 内容 |
|------|------|
| 11 | 双语简历模板（左右对照 / 上下排列） |
| 12 | 翻译缓存（同一简历+同一模型，24h 内复用） |
| 13 | 术语表（用户自定义术语翻译映射） |
| 14 | 翻译质量评分（AI 评估翻译质量） |

---

## 10. 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| AI 翻译丢失模块结构 | 翻译结果无法对齐源简历 | 中 | Prompt 强约束 + `mergeTranslatedModules` 兜底合并 |
| AI 翻译质量不佳（直译、语序奇怪） | 用户体验差 | 中 | Prompt 中强调"自然翻译，符合目标语言求职文化"；用户可在创建后手动编辑 |
| 枚举值翻译不一致 | 学历/等级字段中英混乱 | 低 | Prompt 中给出精确映射表 + 后端可在 merge 时做枚举值二次校验 |
| 超长简历 AI Token 超限 | 翻译失败 | 低 | 使用 `sanitizeAIResumeContent` 已有的截断逻辑；长简历可分批翻译（Phase 3） |
| 翻译耗时过长 | 用户等待焦虑 | 中 | 非流式调用通常 10-30s；可考虑改用 SSE 流式返回模块级别翻译（Phase 3） |

---

## 11. 关键代码清单

| 操作 | 文件 | 变更类型 |
|------|------|----------|
| 新增 | `backend/internal/model/ai.go` | `TranslateRequest`, `TranslateResponse`, `TranslateOptions`, `ConversationTypeTranslate` |
| 新增 | `backend/internal/service/ai/translate.go` | `Translate()`, `buildTranslatePrompt()`, `parseTranslateResponse()`, `mergeTranslatedModules()`, `mergeData()` |
| 修改 | `backend/internal/service/ai/service.go` | Service interface 新增 `Translate` 方法 |
| 修改 | `backend/internal/handler/ai.go` | 新增 `TranslateResume` handler |
| 修改 | `backend/internal/router/router.go` | 新增 `POST /ai/translate` 路由 |
| 新增 | `src/hooks/useTranslate.ts` | 翻译 Hook |
| 新增 | `src/components/resume/TranslateDialog.tsx` | 翻译确认弹窗 |
| 修改 | `src/api/ai.ts` | 新增 `TranslateRequest`, `TranslateResponse`, `translate()` |
| 修改 | `src/components/layout/CenterPanel.tsx` | 工具栏新增翻译按钮 |

---

*文档结束。本技术文档提供了完整的实现指南，可直接据此开始编码。*
