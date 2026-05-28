# ResumeCraft AI 能力扩展 — 技术设计文档

> 版本: v1.0 | 日期: 2026-05-28 | 状态: 设计阶段

---

## 目录

1. [现状分析](#1-现状分析)
2. [系统架构总览](#2-系统架构总览)
3. [模块一：JD 匹配系统（核心升级）](#3-模块一jd-匹配系统核心升级)
4. [模块二：Resume Scoring Engine](#4-模块二resume-scoring-engine)
5. [模块三：自动 Bullet Point 重写](#5-模块三自动-bullet-point-重写)
6. [数据库变更](#6-数据库变更)
7. [API 设计](#7-api-设计)
8. [前端交互设计](#8-前端交互设计)
9. [性能与成本估算](#9-性能与成本估算)
10. [实施路线图](#10-实施路线图)

---

## 1. 现状分析

### 1.1 当前 AI 能力矩阵

| 能力 | 实现方式 | 问题 |
|------|---------|------|
| 简历评估 | 单次 LLM 调用 + NDJSON 流式输出 | 评估维度固定，无 ATS 视角 |
| JD 匹配 | 单次 LLM 调用 + NDJSON 流式输出 | **仅做文本分析**，无结构化关键词抽取、无 embedding 相似度、无量化评分 |
| 内容润色 | 单次 LLM 调用 + JSON 输出 | 粒度到字段级别，但**缺乏 JD 上下文**，润色方向不明确 |
| 求职信 | 单次 LLM 调用 + JSON 输出 | 功能完整，暂不升级 |

### 1.2 核心短板

```
当前 JD 匹配流程：
  JD 原文 + 简历 JSON → LLM → 总结 + 关键词匹配 + 建议

缺失的能力：
  ❌ 无法结构化抽取 JD 的技能要求、经验要求、软技能要求
  ❌ 无法量化计算 ATS 兼容性分数
  ❌ 无法基于 JD 上下文重写 Bullet Point
  ❌ 无法自动调整简历模块权重/排序
  ❌ 无法提供"一键优化"能力
```

### 1.3 竞品参考

| 产品 | JD 匹配 | ATS 评分 | Bullet Point 重写 | 定价 |
|------|---------|---------|-------------------|------|
| Jobscan | TF-IDF + 关键词密度 | ✅ 完整 ATS 模拟 | ❌ | $49.95/月 |
| Resume.io | 基础匹配 | ⚠️ 简单检查 | ❌ | €24.95/3个月 |
| Teal | LLM 匹配 | ✅ | ✅ 基础重写 | $9/周 |
| Resume Worded | 规则 + LLM | ✅ | ✅ | $19/月 |

**ResumeCraft 的差异化定位**：LLM 驱动的深度语义理解 + 完整的 JD→Resume 闭环优化，而非简单的关键词匹配。

---

## 2. 系统架构总览

### 2.1 新增模块在现有架构中的位置

```
┌──────────────────────────────────────────────────────────────┐
│                        前端 (React)                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │JDMatch   │ │Score     │ │BulletPt  │ │ 一键优化       │  │
│  │Panel     │ │Dashboard │ │Rewriter  │ │ (组合操作)     │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬─────────┘  │
└───────┼────────────┼────────────┼───────────────┼────────────┘
        │            │            │               │
┌───────┴────────────┴────────────┴───────────────┴────────────┐
│                     Go 后端 (Gin)                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              AI Service (扩展)                        │     │
│  │                                                       │     │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │     │
│  │  │ JD Analyzer │  │ Scoring      │  │ Bullet      │ │     │
│  │  │ (结构化抽取) │  │ Engine       │  │ Rewriter    │ │     │
│  │  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘ │     │
│  │         │                │                  │        │     │
│  │  ┌──────┴────────────────┴──────────────────┴──────┐ │     │
│  │  │           LLM Provider (已有)                     │ │     │
│  │  │  OpenAI / DeepSeek / Qwen / SiliconFlow / ...   │ │     │
│  │  └─────────────────────────────────────────────────┘ │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐     │
│  │           新增：Scoring Worker (Go 内置)             │     │
│  │  TF-IDF / BM25 / Embedding Similarity               │     │
│  │  (不依赖 LLM，纯算法计算)                             │     │
│  └─────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 数据流总览

```
用户输入 JD 原文
        │
        ▼
  ┌─────────────┐
  │ Step 1:     │  LLM 调用
  │ JD 分析     │──────────→ 结构化 JD 抽取结果
  │             │            (skills, experience, soft_skills, keywords)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Step 2:     │  算法计算（无 LLM）
  │ 评分引擎    │──────────→ ATS Score / Keyword Match / Seniority Fit
  │             │            (TF-IDF, BM25, Embedding)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Step 3:     │  LLM 调用
  │ Bullet Pt   │──────────→ 重写后的 Bullet Points
  │ 重写        │            (JD 上下文感知)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Step 4:     │  前端操作
  │ 简历重组    │──────────→ 模块重排序 / 权重调整 / 一键应用
  │             │
  └─────────────┘
```

---

## 3. 模块一：JD 匹配系统（核心升级）

### 3.1 当前实现 vs 升级目标

| 维度 | 当前 | 升级后 |
|------|------|--------|
| JD 处理 | 原文直接拼入 Prompt | **结构化抽取**：技能/经验/软技能/关键词分类 |
| 匹配方式 | LLM 一把梭 | **混合匹配**：LLM 语义理解 + TF-IDF/BM25 关键词匹配 + Embedding 相似度 |
| 输出粒度 | 总结 + 建议 | **量化评分** + 关键词覆盖率 + 模块级建议 + 重写建议 |
| 可操作性 | 看完就完了 | **一键优化**：自动重写 + 模块重排序 |

### 3.2 JD 结构化抽取（Step 1）

**目标**：将 JD 原文解析为结构化的需求图谱，供后续评分和重写使用。

#### 3.2.1 抽取 Schema

```go
// JDParsedResult JD 结构化抽取结果
type JDParsedResult struct {
    // 基础信息
    JobTitle       string   `json:"jobTitle"`
    Company        string   `json:"company"`
    SeniorityLevel string   `json:"seniorityLevel"` // junior/mid/senior/lead/principal
    EmploymentType string   `json:"employmentType"` // full-time/part-time/contract/intern

    // 硬技能要求
    HardSkills []SkillRequirement `json:"hardSkills"`
    // 软技能要求
    SoftSkills []SkillRequirement `json:"softSkills"`
    // 工具/平台要求
    Tools []SkillRequirement `json:"tools"`
    // 领域知识要求
    Domains []SkillRequirement `json:"domains"`

    // 经验要求
    ExperienceRequirements []ExperienceRequirement `json:"experienceRequirements"`
    // 学历要求
    EducationRequirement *EducationRequirement `json:"educationRequirement"`

    // 证书要求
    Certifications []string `json:"certifications"`
    // 语言要求
    Languages []string `json:"languages"`

    // 关键短语（用于 ATS 匹配）
    KeyPhrases []string `json:"keyPhrases"`

    // JD 原始分类标签
    Categories []string `json:"categories"` // e.g. ["backend", "distributed-systems", "cloud"]
}

type SkillRequirement struct {
    Name      string `json:"name"`      // "Go", "Kubernetes", "分布式系统"
    Required  bool   `json:"required"`  // 必须 vs 加分
    Proficiency string `json:"proficiency"` // familiar/proficient/expert
    Context   string `json:"context"`   // "微服务架构下使用 Go 开发高并发后端"
}

type ExperienceRequirement struct {
    Field      string `json:"field"`      // "后端开发", "分布式系统"
    MinYears   int    `json:"minYears"`   // 0 表示不要求
    Required   bool   `json:"required"`
    Context    string `json:"context"`
}

type EducationRequirement struct {
    Level      string   `json:"level"`      // bachelor/master/phd/any
    Majors     []string `json:"majors"`     // ["计算机科学", "软件工程"]
    Required   bool     `json:"required"`
}
```

#### 3.2.2 Prompt 设计

```
你是资深招聘需求分析专家，请将以下岗位 JD 解析为结构化 JSON。

【强制规则】
1. 严格返回 JSON，禁止 Markdown、注释、额外说明
2. 技能区分硬技能/软技能/工具/领域知识四类
3. required 区分"必须/加分"，不能模糊处理
4. keyPhrases 提取 ATS 系统会识别的关键短语（通常 15-30 个）
5. 如果 JD 信息不完整，合理推断但标注 confidence

【返回格式】
{上述 JDParsedResult 的 JSON Schema}

【JD 原文】
{jdText}
```

#### 3.2.3 缓存策略

JD 解析结果按 `SHA256(jdText)` 缓存到 `jd_parsed_cache` 表，同一份 JD 不重复调用 LLM。

```sql
CREATE TABLE jd_parsed_cache (
    id UUID PRIMARY KEY,
    jd_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA256(jdText)
    jd_text TEXT NOT NULL,
    parsed_result JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    hit_count INT DEFAULT 1,
    UNIQUE(jd_hash)
);
```

### 3.3 混合匹配引擎（Step 2）

#### 3.3.1 三路匹配架构

```
                  ┌─────────────────┐
                  │  JD Parsed      │
                  │  (结构化抽取)    │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐ ┌──────▼──────┐ ┌──▼─────────┐
     │ LLM 语义   │ │ TF-IDF /   │ │ Embedding  │
     │ 匹配       │ │ BM25 关键词 │ │ 相似度     │
     │ (深度理解)  │ │ (精确匹配)  │ │ (语义泛化) │
     └────────┬───┘ └──────┬──────┘ └──┬─────────┘
              │            │            │
              └────────────┼────────────┘
                           │
                  ┌────────▼────────┐
                  │  评分融合       │
                  │  加权综合评分    │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐ ┌──────▼──────┐ ┌──▼──────────┐
     │ ATS Score  │ │ Keyword     │ │ Seniority   │
     │ 82/100     │ │ Match 74%   │ │ Fit 88%     │
     └────────────┘ └─────────────┘ └─────────────┘
```

#### 3.3.2 TF-IDF / BM25 关键词匹配（Go 内置）

**为什么需要算法匹配**：LLM 语义理解很强，但**ATS 系统是精确匹配**。如果 JD 要求 "Kubernetes" 而简历写的是 "K8s"，LLM 能理解等价，但 ATS 不能。TF-IDF/BM25 提供精确的关键词覆盖率，这是 ATS 评分的核心。

```go
// scoring/engine.go — 评分引擎核心

package scoring

// KeywordMatcher 关键词匹配器（TF-IDF + BM25）
type KeywordMatcher struct {
    // JD 的 IDF 权重（从行业语料库预计算）
    idfWeights map[string]float64
}

// MatchResult 匹配结果
type MatchResult struct {
    Keywords []KeywordMatchDetail `json:"keywords"`
    Coverage float64              `json:"coverage"` // 关键词覆盖率 0-1
    Score    float64              `json:"score"`    // TF-IDF 加权匹配分 0-100
}

type KeywordMatchDetail struct {
    Keyword    string  `json:"keyword"`
    Required   bool    `json:"required"`
    Matched    bool    `json:"matched"`
    TFIDFScore float64 `json:"tfidfScore"` // 该关键词的 TF-IDF 权重
    Variants   []string `json:"variants,omitempty"` // 同义词变体匹配
}

// Match 执行关键词匹配
// jdKeywords: JD 抽取的关键词列表
// resumeText: 简历全文本（从 content JSON 展平）
func (m *KeywordMatcher) Match(jdKeywords []string, resumeText string) *MatchResult {
    // 1. 对 resumeText 分词 + TF 计算
    // 2. 对 jdKeywords 逐个在 resumeText 中查找精确匹配 + 同义词匹配
    // 3. 计算 TF-IDF 加权覆盖率
    // 4. 区分 required/optional 的匹配率
    // ...
}

// BM25Similarity 计算 BM25 相似度
func BM25Similarity(jdText, resumeText string, avgDL float64) float64 {
    // k1=1.2, b=0.75 (标准参数)
    // ...
}
```

**同义词映射表**（内置，不依赖 LLM）：

```go
var techSynonyms = map[string][]string{
    "Kubernetes": {"K8s", "k8s", "kube"},
    "Go":         {"Golang", "golang"},
    "PostgreSQL": {"Postgres", "pg"},
    "Redis":      {"redis-cli"},
    "AWS":        {"Amazon Web Services"},
    "CI/CD":      {"持续集成", "持续部署", "Continuous Integration"},
    "React":      {"ReactJS", "React.js"},
    "TypeScript": {"TS"},
    // ... 持续扩充
}
```

#### 3.3.3 Embedding 相似度（可选，Phase 2）

```go
// EmbeddingMatcher 嵌入向量相似度匹配
type EmbeddingMatcher struct {
    provider AIProvider // 复用已有的 AI Provider
    model    string     // e.g. "BAAI/bge-small-zh-v1.5" 或 "text-embedding-3-small"
}

// ComputeSimilarity 计算 JD 与简历的语义相似度
func (e *EmbeddingMatcher) ComputeSimilarity(ctx context.Context, jdText, resumeText string) (float64, error) {
    // 1. 分别调用 Embedding API 获取向量
    // 2. 计算余弦相似度
    // 3. 返回 0-1 的相似度分数
}
```

**模型选择**：

| 模型 | 维度 | 价格 | 适用场景 |
|------|------|------|---------|
| `text-embedding-3-small` (OpenAI) | 1536 | $0.02/1M tokens | 国际用户 |
| `BAAI/bge-small-zh-v1.5` (SiliconFlow) | 512 | ¥0.001/1K tokens | 国内用户，性价比最优 |
| `bge-m3` (SiliconFlow) | 1024 | ¥0.002/1K tokens | 多语言场景 |

#### 3.3.4 评分融合公式

```
综合评分 = w1 × ATS_Score + w2 × Semantic_Score + w3 × Seniority_Fit

其中:
  ATS_Score      = (required_keywords_matched / total_required) × 60
                   + (optional_keywords_matched / total_optional) × 20
                   + bm25_normalized_score × 20

  Semantic_Score  = embedding_cosine_similarity × 100
                   (Phase 1 用 LLM 评估的 matchScore 替代)

  Seniority_Fit   = LLM 评估的经验级别匹配度 × 100

默认权重: w1=0.5, w2=0.3, w3=0.2
```

### 3.4 简历重组（Step 4）

基于 JD 匹配结果，自动调整简历内容的**优先级和权重**：

```go
// ResumeReweightRequest 简历重组请求
type ResumeReweightRequest struct {
    ResumeID string              `json:"resumeId"`
    Content  map[string]interface{} `json:"content"`
    JDResult *JDParsedResult     `json:"jdResult"`     // JD 抽取结果
    MatchResult *CompositeMatchResult `json:"matchResult"` // 匹配结果
}

// ResumeReweightResponse 简历重组建议
type ResumeReweightResponse struct {
    ModuleReorder []ModuleReorderItem  `json:"moduleReorder"`  // 模块重排建议
    BulletRewrites []BulletRewriteItem `json:"bulletRewrites"` // 需要重写的条目
    SkillsAdjust  *SkillsAdjustResult  `json:"skillsAdjust"`   // 技能模块调整
    SummaryRewrite *string             `json:"summaryRewrite"` // 个人简介重写
}

type ModuleReorderItem struct {
    ModuleType     string `json:"moduleType"`
    ModuleInstanceID string `json:"moduleInstanceId"`
    CurrentIndex   int    `json:"currentIndex"`
    SuggestedIndex int    `json:"suggestedIndex"`
    Reason         string `json:"reason"` // "JD 高度相关的工作经历应提前"
}

type BulletRewriteItem struct {
    ModuleType     string `json:"moduleType"`
    ModuleInstanceID string `json:"moduleInstanceId"`
    FieldKey       string `json:"fieldKey"` // "description"
    OriginalText   string `json:"originalText"`
    RewrittenText  string `json:"rewrittenText"`
    Reason         string `json:"reason"`
}

type SkillsAdjustResult struct {
    SkillsToEmphasize []string `json:"skillsToEmphasize"` // ["Go", "Kubernetes", "分布式系统"]
    SkillsToDeprioritize []string `json:"skillsToDeprioritize"` // ["Python"]
    SuggestedAdditions []string `json:"suggestedAdditions"` // JD 要求但简历缺失的
}
```

---

## 4. 模块二：Resume Scoring Engine

### 4.1 评分维度设计

```
                    ┌─────────────────────┐
                    │   Resume Score      │
                    │     82 / 100        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                 │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌────────▼────────┐
     │ ATS Score      │ │ Keyword    │ │ Seniority       │
     │ 85/100        │ │ Match      │ │ Fit             │
     │               │ │ 74%        │ │ 88%             │
     └────────┬───────┘ └─────┬──────┘ └────────┬────────┘
              │               │                 │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌────────▼────────┐
     │ 格式兼容性 30% │ │ 必选词覆盖 │ │ 经验年限匹配   │
     │ 结构完整性 30% │ │ 60%        │ │ 职级匹配       │
     │ 关键词密度 40% │ │ 可选词覆盖 │ │ 领域相关性     │
     │               │ │ 88%        │ │                 │
     └───────────────┘ └────────────┘ └─────────────────┘
```

### 4.2 ATS Score 计算规则

ATS（Applicant Tracking System）是简历通过率的**第一道关卡**。ATS Score 衡量简历对 ATS 系统的友好程度。

#### 4.2.1 格式兼容性检查（规则引擎，不依赖 LLM）

```go
// ATSFormatChecker ATS 格式检查器
type ATSFormatChecker struct{}

type FormatCheckResult struct {
    Score   float64          `json:"score"`   // 0-100
    Checks  []FormatCheckItem `json:"checks"`
}

type FormatCheckItem struct {
    Key         string `json:"key"`
    Passed      bool   `json:"passed"`
    Description string `json:"description"`
    Suggestion  string `json:"suggestion,omitempty"`
}

func (c *ATSFormatChecker) Check(content map[string]interface{}) *FormatCheckResult {
    checks := []FormatCheckItem{
        // 1. 联系信息完整性
        {Key: "has_email", Passed: hasField(content, "personal.email"), Description: "邮箱地址"},
        {Key: "has_phone", Passed: hasField(content, "personal.phone"), Description: "电话号码"},

        // 2. 日期格式一致性（ATS 解析关键）
        {Key: "date_format_consistent", Passed: checkDateFormatConsistency(content), Description: "日期格式一致性"},

        // 3. 核心模块非空
        {Key: "has_education", Passed: hasModuleWithItems(content, "education"), Description: "教育经历"},
        {Key: "has_work_or_project", Passed: hasModuleWithItems(content, "work") || hasModuleWithItems(content, "project"), Description: "工作/项目经历"},

        // 4. 技能关键词可提取性
        {Key: "has_skills", Passed: hasModuleWithItems(content, "skills"), Description: "专业技能"},

        // 5. 目标职位明确
        {Key: "has_target_position", Passed: hasField(content, "personal.targetPosition"), Description: "求职意向"},
    }

    passed := 0
    for _, c := range checks { if c.Passed { passed++ } }

    return &FormatCheckResult{
        Score:  float64(passed) / float64(len(checks)) * 100,
        Checks: checks,
    }
}
```

#### 4.2.2 关键词密度计算

```go
// KeywordDensityCalculator 关键词密度计算器
type KeywordDensityCalculator struct{}

// Calculate 计算简历中 JD 关键词的密度和分布
func (c *KeywordDensityCalculator) Calculate(jdKeywords []string, resumeContent map[string]interface{}) *KeywordDensityResult {
    // 1. 将简历各模块文本展平为模块→文本映射
    moduleTexts := flattenResumeText(resumeContent)

    // 2. 对每个 JD 关键词，计算在各模块中的出现频率
    // 3. 识别关键词"堆叠"（仅在技能栏出现 vs 在工作经历中也有体现）
    // 4. ATS 系统通常要求关键词出现在上下文中，而非仅罗列

    return &KeywordDensityResult{
        OverallDensity:    0.023,  // 整体密度 2.3%
        ContextualDensity: 0.015,  // 上下文密度 1.5%（工作/项目经历中）
        ListDensity:       0.008,  // 列表密度 0.8%（仅技能栏）
        Distribution:      map[string]int{},  // keyword → 出现次数
    }
}
```

### 4.3 Seniority Fit 计算

```go
// SeniorityFitCalculator 资历匹配计算器
type SeniorityFitCalculator struct{}

type SeniorityFitResult struct {
    Score       float64 `json:"score"`       // 0-100
    JDSeniority string  `json:"jdSeniority"`  // "senior"
    ResumeYears int     `json:"resumeYears"`  // 5
    LevelMatch  string  `json:"levelMatch"`   // "overqualified" / "match" / "underqualified"
    DomainFit   float64 `json:"domainFit"`    // 0-1，领域相关性
}

func (c *SeniorityFitCalculator) Calculate(
    jdResult *JDParsedResult,
    resumeContent map[string]interface{},
) *SeniorityFitResult {
    // 1. 从简历中计算总工作年限
    totalYears := calculateTotalWorkYears(resumeContent)

    // 2. 从 JD 抽取的 SeniorityLevel 推断期望年限
    expectedYears := seniorityToYears(jdResult.SeniorityLevel)

    // 3. 计算年限匹配度
    yearsFit := computeYearsFit(totalYears, expectedYears)

    // 4. 计算领域相关性（JD.domains vs 简历 work/project 中的行业/领域关键词）
    domainFit := computeDomainFit(jdResult.Domains, resumeContent)

    score := yearsFit * 0.6 + domainFit * 40  // 加权

    return &SeniorityFitResult{
        Score:       score,
        JDSeniority: jdResult.SeniorityLevel,
        ResumeYears: totalYears,
        DomainFit:   domainFit,
    }
}

func seniorityToYears(level string) int {
    switch level {
    case "intern":     return 0
    case "junior":     return 1
    case "mid":        return 3
    case "senior":     return 5
    case "lead":       return 7
    case "principal":  return 10
    default:           return 3
    }
}
```

### 4.4 评分融合与输出

```go
// CompositeScore 综合评分
type CompositeScore struct {
    OverallScore  int               `json:"overallScore"`   // 82
    Level         string            `json:"level"`          // "B+"
    Breakdown     ScoreBreakdown    `json:"breakdown"`
    Improvements  []ScoreImprovement `json:"improvements"`  // 提分建议
}

type ScoreBreakdown struct {
    ATS            ATSScoreDetail    `json:"ats"`
    KeywordMatch   KeywordMatchDetail `json:"keywordMatch"`
    SeniorityFit   SeniorityFitDetail `json:"seniorityFit"`
}

type ATSScoreDetail struct {
    Score           float64           `json:"score"`    // 85
    FormatChecks    []FormatCheckItem `json:"checks"`
    KeywordDensity  float64           `json:"keywordDensity"`
}

type ScoreImprovement struct {
    Category       string `json:"category"`  // "ats" / "keyword" / "seniority"
    PotentialGain  int    `json:"potentialGain"` // 预计可提升分数
    Action         string `json:"action"`    // "添加 Kubernetes 关键词到项目经历"
    Priority       string `json:"priority"`  // "high" / "medium" / "low"
}
```

---

## 5. 模块三：自动 Bullet Point 重写

### 5.1 核心价值

这是 ResumeCraft **最赚钱的功能**。原因：

1. **痛点最明确**：大多数人写简历时 Bullet Point 写得像流水账（"Built backend system"），而好简历需要量化成果和强动词开头
2. **效果最直观**：用户能立即看到重写前后的对比
3. **依赖 JD 上下文**：重写不是泛泛优化，而是**针对目标岗位**精准强化相关经历
4. **竞品壁垒**：Teal / Resume Worded 的重写功能很基础，做不到 JD 上下文感知

### 5.2 重写策略

```
输入: "Built backend system"
JD 上下文: Backend Engineer (Go + Kubernetes)

                    ┌─────────────────────┐
                    │  重写策略引擎        │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼─────────────────┐
              │                │                 │
     ┌────────▼───────┐ ┌─────▼──────┐ ┌────────▼────────┐
     │ STAR 法则重构   │ │ 量化注入   │ │ JD 关键词嵌入   │
     │ Situation      │ │ 1M+ daily  │ │ Go, Kubernetes  │
     │ Task           │ │ 99.9%      │ │ distributed     │
     │ Action         │ │ uptime     │ │ system          │
     │ Result         │ │            │ │                 │
     └────────┬───────┘ └─────┬──────┘ └────────┬────────┘
              │               │                 │
              └───────────────┼─────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  LLM 生成最终版本  │
                    │  (3 个候选版本)    │
                    └───────────────────┘

输出:
  v1: Designed and implemented a scalable backend system in Go serving 1M+ daily
      requests with 99.9% uptime, deployed on Kubernetes
  v2: Architected a high-availability distributed backend using Go and Kubernetes,
      processing 1M+ requests/day at 99.9% uptime
  v3: Built a cloud-native backend system (Go/Kubernetes) that scaled to handle
      1M+ daily requests while maintaining 99.9% service availability
```

### 5.3 Prompt 设计

```
你是资深简历 Bullet Point 重写专家。请基于目标岗位 JD 的关键要求，重写以下简历条目。

【目标岗位 JD 关键要求】
- 核心技能: {jdHardSkills}
- 经验要求: {jdExperience}
- 重点关键词: {jdKeyPhrases}

【重写规则】
1. STAR 法则: 每个 bullet point 必须包含 Situation/Task/Action/Result 的元素
2. 强动词开头: 使用 Designed/Architected/Implemented/Optimized/Led/Spearheaded 等强动词
3. 量化成果: 如果原文没有数字，根据上下文合理推断数量级并标注 [estimated]
4. JD 关键词嵌入: 自然地将 JD 中的核心技能和关键词融入描述
5. 长度控制: 每个 bullet point 1-2 行，不超过 200 字符
6. 生成 3 个版本:
   - v1: 成果导向型 (强调数字和影响)
   - v2: 技术深度型 (强调技术栈和架构)
   - v3: 业务价值型 (强调业务结果和决策)

【禁止规则】
1. 禁止编造完全不存在的经历
2. 禁止使用弱动词: "Helped", "Assisted", "Was responsible for"
3. 禁止空泛描述: "various", "multiple", "several" — 必须量化
4. 推断的数据必须标注 [estimated]

【返回格式】
{
  "original": "原文",
  "versions": [
    {
      "type": "impact",
      "text": "重写后的文本",
      "highlights": ["嵌入的JD关键词", "量化数据"],
      "confidence": 0.85
    },
    {
      "type": "technical",
      "text": "...",
      "highlights": [...],
      "confidence": 0.9
    },
    {
      "type": "business",
      "text": "...",
      "highlights": [...],
      "confidence": 0.8
    }
  ],
  "missingData": ["缺少用户量数据", "缺少性能指标"]  // 建议用户补充的数据
}
```

### 5.4 批量重写模式

```go
// BatchRewriteRequest 批量重写请求
type BatchRewriteRequest struct {
    ResumeID  string                 `json:"resumeId"`
    Content   map[string]interface{} `json:"content"`
    JDParsed  *JDParsedResult        `json:"jdParsed"`
    // 指定需要重写的模块和条目，空则自动选择所有可重写条目
    Targets   []RewriteTarget        `json:"targets,omitempty"`
}

type RewriteTarget struct {
    ModuleType       string `json:"moduleType"`       // "work", "project"
    ModuleInstanceID string `json:"moduleInstanceId"`
    FieldKey         string `json:"fieldKey"`         // "description"
}

// BatchRewriteResponse 批量重写响应
type BatchRewriteResponse struct {
    Items []BatchRewriteItem `json:"items"`
    Total int                `json:"total"`
    TokenUsage TokenUsage    `json:"tokenUsage"`
}

type BatchRewriteItem struct {
    ModuleType       string           `json:"moduleType"`
    ModuleInstanceID string           `json:"moduleInstanceId"`
    FieldKey         string           `json:"fieldKey"`
    Original         string           `json:"original"`
    Versions         []RewriteVersion `json:"versions"`
    MissingData      []string         `json:"missingData"`
}

type RewriteVersion struct {
    Type        string   `json:"type"`        // impact/technical/business
    Text        string   `json:"text"`
    Highlights  []string `json:"highlights"`
    Confidence  float64  `json:"confidence"`
}

type TokenUsage struct {
    InputTokens  int `json:"inputTokens"`
    OutputTokens int `json:"outputTokens"`
}
```

### 5.5 重写上下文管理

**关键问题**：Bullet Point 重写需要 JD 上下文，但同一个简历可能对应多个 JD。如何管理上下文？

```
用户流程:
1. 粘贴 JD → JD 分析 → 缓存 JDParsedResult
2. 选择目标 JD → 进入 JD 感知模式
3. 在此模式下:
   - 简历评估使用 JD 上下文
   - 内容润色使用 JD 上下文
   - Bullet Point 重写使用 JD 上下文
4. 切换 JD → 所有 AI 功能自动切换上下文
```

```go
// JDContext JD 上下文管理
type JDContext struct {
    ID         string          `json:"id"`
    UserID     string          `json:"userId"`
    ResumeID   string          `json:"resumeId"`
    JDText     string          `json:"jdText"`
    JDParsed   *JDParsedResult `json:"jdParsed"`
    IsActive   bool            `json:"isActive"`   // 当前激活的 JD
    CreatedAt  int64           `json:"createdAt"`
}
```

---

## 6. 数据库变更

### 6.1 新增表

```sql
-- JD 解析缓存
CREATE TABLE jd_parsed_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jd_hash VARCHAR(64) NOT NULL,
    jd_text TEXT NOT NULL,
    parsed_result JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    hit_count INT DEFAULT 1,
    UNIQUE(jd_hash)
);

-- 用户 JD 上下文（一个简历可关联多个 JD）
CREATE TABLE jd_contexts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    jd_text TEXT NOT NULL,
    jd_parsed JSONB,
    target_title VARCHAR(200),
    company_name VARCHAR(200),
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 简历评分记录
CREATE TABLE resume_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    jd_context_id UUID REFERENCES jd_contexts(id) ON DELETE SET NULL,
    ats_score JSONB NOT NULL,         -- ATSScoreDetail
    keyword_match JSONB NOT NULL,     -- KeywordMatchDetail
    seniority_fit JSONB NOT NULL,     -- SeniorityFitDetail
    overall_score INT NOT NULL,
    level VARCHAR(10) NOT NULL,
    improvements JSONB,               -- []ScoreImprovement
    model VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bullet Point 重写记录
CREATE TABLE bullet_rewrites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    jd_context_id UUID REFERENCES jd_contexts(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
    module_type VARCHAR(50) NOT NULL,
    module_instance_id VARCHAR(100),
    field_key VARCHAR(100) NOT NULL,
    original_text TEXT NOT NULL,
    selected_version VARCHAR(20),     -- "impact" / "technical" / "business"
    rewritten_text TEXT,
    all_versions JSONB,               -- []RewriteVersion
    applied BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_jd_contexts_user_resume ON jd_contexts(user_id, resume_id);
CREATE INDEX idx_resume_scores_user_resume ON resume_scores(user_id, resume_id);
CREATE INDEX idx_bullet_rewrites_user_resume ON bullet_rewrites(user_id, resume_id);
CREATE INDEX idx_jd_parsed_cache_hash ON jd_parsed_cache(jd_hash);
```

### 6.2 修改现有表

```sql
-- ai_conversations 增加 JD 上下文关联
ALTER TABLE ai_conversations ADD COLUMN jd_context_id UUID REFERENCES jd_contexts(id);
```

---

## 7. API 设计

### 7.1 JD 管理接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/jd/analyze` | 分析 JD，返回结构化抽取结果 |
| GET | `/api/ai/jd/contexts?resumeId=xxx` | 获取简历关联的 JD 列表 |
| POST | `/api/ai/jd/contexts` | 创建 JD 上下文（关联到简历） |
| PUT | `/api/ai/jd/contexts/:id/activate` | 激活某个 JD 上下文 |
| DELETE | `/api/ai/jd/contexts/:id` | 删除 JD 上下文 |

### 7.2 评分接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/score` | 计算简历评分（可带 JD 上下文） |
| GET | `/api/ai/scores?resumeId=xxx` | 获取历史评分记录 |
| GET | `/api/ai/scores/:id` | 获取评分详情 |

**Score Request**:
```json
{
  "resumeId": "xxx",
  "jdContextId": "yyy",  // 可选，不传则做通用 ATS 评分
  "includeImprovements": true
}
```

**Score Response**:
```json
{
  "overallScore": 82,
  "level": "B+",
  "breakdown": {
    "ats": {
      "score": 85,
      "checks": [
        {"key": "has_email", "passed": true, "description": "邮箱地址"},
        {"key": "date_format_consistent", "passed": false, "description": "日期格式一致性", "suggestion": "统一使用 YYYY.MM 格式"}
      ],
      "keywordDensity": 0.023
    },
    "keywordMatch": {
      "score": 74,
      "requiredMatched": 5,
      "requiredTotal": 8,
      "optionalMatched": 4,
      "optionalTotal": 6,
      "missing": ["Kubernetes", "gRPC", "微服务"]
    },
    "seniorityFit": {
      "score": 88,
      "jdSeniority": "senior",
      "resumeYears": 5,
      "levelMatch": "match",
      "domainFit": 0.85
    }
  },
  "improvements": [
    {
      "category": "keyword",
      "potentialGain": 12,
      "action": "在项目经历中添加 Kubernetes 和 gRPC 关键词",
      "priority": "high"
    }
  ]
}
```

### 7.3 Bullet Point 重写接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/rewrite` | 单条重写 |
| POST | `/api/ai/rewrite/batch` | 批量重写 |
| POST | `/api/ai/rewrite/:id/apply` | 应用重写结果 |
| GET | `/api/ai/rewrites?resumeId=xxx` | 获取重写历史 |

**Single Rewrite Request**:
```json
{
  "resumeId": "xxx",
  "jdContextId": "yyy",
  "moduleType": "work",
  "moduleInstanceId": "work-1",
  "fieldKey": "description",
  "content": "Built backend system"
}
```

**Single Rewrite Response**:
```json
{
  "id": "rewrite-uuid",
  "original": "Built backend system",
  "versions": [
    {
      "type": "impact",
      "text": "Designed and implemented a scalable backend system in Go serving 1M+ daily requests with 99.9% uptime, deployed on Kubernetes",
      "highlights": ["Go", "Kubernetes", "1M+ daily", "99.9% uptime"],
      "confidence": 0.85
    },
    {
      "type": "technical",
      "text": "Architected a high-availability distributed backend using Go and Kubernetes, processing 1M+ requests/day at 99.9% uptime",
      "highlights": ["Go", "Kubernetes", "distributed", "high-availability"],
      "confidence": 0.9
    },
    {
      "type": "business",
      "text": "Built a cloud-native backend system (Go/Kubernetes) that scaled to handle 1M+ daily requests while maintaining 99.9% service availability",
      "highlights": ["cloud-native", "scaled", "1M+ daily", "99.9% availability"],
      "confidence": 0.8
    }
  ],
  "missingData": ["用户量数据为推测", "缺少具体性能指标"]
}
```

### 7.4 一键优化接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/optimize` | 一键优化（组合操作） |
| GET | `/api/ai/optimize/:taskId` | 获取优化任务状态 |

**Optimize Request**:
```json
{
  "resumeId": "xxx",
  "jdContextId": "yyy",
  "options": {
    "reorderModules": true,
    "rewriteBullets": true,
    "adjustSkills": true,
    "rewriteSummary": true
  }
}
```

**Optimize Response**（流式 SSE）:
```
data: {"type":"jd_analyzed","jdParsed":{...}}
data: {"type":"scored","score":{"overallScore":74,...}}
data: {"type":"module_reordered","items":[...]}
data: {"type":"bullet_rewritten","item":{...}}
data: {"type":"skills_adjusted","result":{...}}
data: {"type":"summary_rewritten","text":"..."}
data: {"type":"final_score","score":{"overallScore":89,...}}
data: {"type":"finish"}
```

---

## 8. 前端交互设计

### 8.1 JD 上下文面板（新增）

```
┌─────────────────────────────────────────────────────────────┐
│  🎯 目标岗位                                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Backend Engineer @ TechCorp                          │  │
│  │  Go + Kubernetes + 分布式系统                          │  │
│  │  [切换] [编辑] [删除]                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│  + 添加新的目标岗位                                          │
│                                                              │
│  📊 JD 匹配度                                                │
│  ┌────────┐ ┌────────┐ ┌────────┐                          │
│  │ ATS    │ │ 关键词 │ │ 资历   │                          │
│  │ 85/100 │ │ 74%    │ │ 88%    │                          │
│  └────────┘ └────────┘ └────────┘                          │
│                                                              │
│  🔑 关键词覆盖                                               │
│  ✅ Go          ✅ 微服务      ❌ Kubernetes                  │
│  ✅ 分布式系统   ❌ gRPC       ⚠️ Redis (技能栏有，经历无)   │
│                                                              │
│  💡 优化建议                                                  │
│  [一键优化] [逐项优化]                                       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔴 high  添加 Kubernetes 到项目经历 (+8分)          │    │
│  │ 🔴 high  用量化数据重写工作经历描述 (+6分)          │    │
│  │ 🟡 medium 技能栏强化 Go，弱化 Python (+3分)         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Bullet Point 重写交互

```
┌─────────────────────────────────────────────────────────────┐
│  工作经历 > 字节跳动 > 工作描述                               │
│                                                              │
│  原文:                                                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Built backend system                                   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  AI 重写版本 (基于: Backend Engineer @ TechCorp):            │
│                                                              │
│  ┌─ 🏆 成果导向 ─────────────────────────── [应用] ──────┐  │
│  │ Designed and implemented a scalable backend system     │  │
│  │ in Go serving 1M+ daily requests with 99.9% uptime,   │  │
│  │ deployed on Kubernetes                                │  │
│  │ Go · Kubernetes · 1M+ daily · 99.9% uptime            │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 🔧 技术深度 ─────────────────────────── [应用] ──────┐  │
│  │ Architected a high-availability distributed backend    │  │
│  │ using Go and Kubernetes, processing 1M+ requests/day  │  │
│  │ Go · Kubernetes · distributed · high-availability      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ 💼 业务价值 ─────────────────────────── [应用] ──────┐  │
│  │ Built a cloud-native backend system (Go/Kubernetes)    │  │
│  │ that scaled to handle 1M+ daily requests while        │  │
│  │ maintaining 99.9% service availability                │  │
│  │ cloud-native · scaled · 1M+ daily · 99.9%             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ⚠️ AI 标注: 用户量数据为推测，建议补充具体数字              │
└─────────────────────────────────────────────────────────────┘
```

### 8.3 一键优化流程

```
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ 点击     │    │ 进度     │    │ 预览     │    │ 确认     │
  │ 一键优化 │ →  │ 动画     │ →  │ Diff     │ →  │ 应用     │
  │          │    │          │    │ 对比     │    │ 变更     │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘

  进度动画:
  ┌─────────────────────────────────────────────────────┐
  │  🔄 正在优化简历...                                  │
  │                                                      │
  │  ✅ JD 分析完成                                      │
  │  ✅ 评分计算完成: 74 → 预计 89 (+15)                │
  │  🔄 正在重写工作经历 (2/3)...                        │
  │  ⏳ 技能调整                                         │
  │  ⏳ 个人简介重写                                     │
  │                                                      │
  │  ████████████░░░░░░░░ 60%                           │
  └─────────────────────────────────────────────────────┘

  Diff 对比:
  ┌──────────────────┬──────────────────────────────────┐
  │ 原文             │ 优化后                           │
  ├──────────────────┼──────────────────────────────────┤
  │ Built backend    │ Designed and implemented a       │
  │ system           │ scalable backend system in Go    │
  │                  │ serving 1M+ daily requests...    │
  ├──────────────────┼──────────────────────────────────┤
  │ Python, Java, Go │ Go, Kubernetes, 分布式系统,      │
  │                  │ 微服务, Python                   │
  └──────────────────┴──────────────────────────────────┘
      [全部应用]  [逐项确认]  [取消]
```

---

## 9. 性能与成本估算

### 9.1 LLM Token 消耗估算

| 操作 | 输入 Tokens | 输出 Tokens | 模型 | 单次成本 (SiliconFlow) |
|------|------------|------------|------|----------------------|
| JD 结构化抽取 | ~1,500 | ~800 | deepseek-v3 | ¥0.003 |
| 简历评估 (已有) | ~2,000 | ~1,200 | deepseek-v3 | ¥0.005 |
| JD 匹配 (升级后) | ~2,500 | ~1,500 | deepseek-v3 | ¥0.006 |
| 单条 Bullet 重写 | ~800 | ~600 | deepseek-v3 | ¥0.002 |
| 批量重写 (10条) | ~3,000 | ~3,000 | deepseek-v3 | ¥0.009 |
| 一键优化 (全流程) | ~8,000 | ~6,000 | deepseek-v3 | ¥0.021 |

### 9.2 算法模块性能（无 LLM 开销）

| 操作 | 耗时 | 说明 |
|------|------|------|
| TF-IDF 关键词匹配 | <10ms | Go 内置，纯内存计算 |
| BM25 相似度 | <10ms | Go 内置 |
| ATS 格式检查 | <5ms | 规则引擎 |
| Seniority Fit | <5ms | 简单计算 |
| Embedding 相似度 (Phase 2) | ~200ms | 需调用 Embedding API |

### 9.3 总体成本

**一次完整的 JD 匹配 + 一键优化流程**:
- LLM 调用: ~¥0.03（SiliconFlow DeepSeek-V3）
- 算法计算: 0（Go 内置）
- **总计: ~¥0.03/次**

如果用户每月优化 50 次，月成本约 ¥1.5，完全在可接受范围内。

---

## 10. 实施路线图

### Phase 1: JD 结构化抽取 + 评分引擎（2 周）

```
Week 1:
  - [后端] 实现 JD 结构化抽取 Prompt + API
  - [后端] 实现 jd_parsed_cache 缓存
  - [后端] 实现 ATS 格式检查引擎（Go 规则引擎）
  - [后端] 实现 TF-IDF / BM25 关键词匹配引擎
  - [数据库] 新增 jd_parsed_cache, jd_contexts, resume_scores 表

Week 2:
  - [后端] 实现 Seniority Fit 计算
  - [后端] 实现评分融合逻辑
  - [后端] 实现 /api/ai/score 接口
  - [前端] JD 上下文面板 UI
  - [前端] 评分 Dashboard UI
  - 联调 + 测试
```

### Phase 2: Bullet Point 重写（1.5 周）

```
Week 3:
  - [后端] 实现单条重写 Prompt + API
  - [后端] 实现批量重写逻辑
  - [数据库] 新增 bullet_rewrites 表
  - [前端] Bullet Point 重写交互 UI（三版本选择器）

Week 4 (前半):
  - [后端] 实现"应用重写"逻辑（更新简历 content）
  - [前端] 重写 Diff 对比 UI
  - 联调 + 测试
```

### Phase 3: 一键优化 + Embedding（1.5 周）

```
Week 4 (后半):
  - [后端] 实现一键优化编排逻辑（JD分析 → 评分 → 重写 → 调整）
  - [后端] 实现模块重排序建议
  - [后端] 实现技能调整建议

Week 5:
  - [后端] 集成 Embedding 相似度计算
  - [前端] 一键优化进度动画 + Diff 对比 UI
  - [前端] "逐项确认"交互
  - 全链路测试 + 性能优化
```

### Phase 4: 打磨 + 上线（1 周）

```
Week 6:
  - Prompt 调优（基于真实 JD 和简历的 A/B 测试）
  - 同义词映射表扩充
  - 错误处理和边界情况
  - 前端动画和交互打磨
  - 上线
```

---

## 附录 A: 现有代码复用清单

| 现有模块 | 复用方式 |
|---------|---------|
| `ai/provider.go` | 直接复用，新增 JD 分析和 Bullet 重写的 Prompt 调用 |
| `ai/encryption.go` | 直接复用 API Key 加解密 |
| `ai/service.go` 的 `StreamJDMatch` | **重构**：内部调用 JD 抽取 → 评分 → 返回增强结果 |
| `model/ai.go` 的 `JDMatchRequest/Response` | **扩展**：增加 `jdContextId` 字段 |
| `model/ai.go` 的 `SuggestRequest` | **扩展**：增加 `jdContextId` 字段，润色时感知 JD 上下文 |
| `handler/ai.go` | **扩展**：新增 score/rewrite/optimize Handler |
| 前端 `useJDMatch.ts` | **重构**：接入增强后的 JD 匹配 API |
| 前端 `useAISuggest.ts` | **扩展**：润色时传入 JD 上下文 |

## 附录 B: 与现有 JD 匹配的兼容策略

当前 `StreamJDMatch` 已有完整的流式输出逻辑（NDJSON 解析 + SSE 推送）。升级方案：

1. **保留现有 `StreamJDMatch` 不动**，作为"快速匹配"模式
2. **新增 `DeepJDMatch`**，内部调用 JD 抽取 → 评分引擎 → 增强匹配
3. 前端根据用户选择切换"快速/深度"模式
4. 后续版本合并，统一为深度模式
