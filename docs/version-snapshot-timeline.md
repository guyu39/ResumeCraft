# ResumeCraft 版本快照 & 时间轴 — 技术设计文档

> 版本: v1.0 | 日期: 2026-05-30 | 状态: 设计阶段

---

## 1. 现状与问题

### 1.1 现有版本机制

```
用户编辑简历 → 点击保存 → 后端 Update() 自动调用 createVersion()
                                    ↓
                          resume_versions 表新增一条记录
                          (content_snapshot + version_no + created_at)
```

| 现状 | 问题 |
|------|------|
| 每次保存自动创建版本 | 用户无法区分"随手保存"和"里程碑" |
| 版本仅存储 content JSON | **没有标签、没有描述**，无法知道这个版本有什么变化 |
| 前端无版本 UI | 用户不知道有版本历史存在，恢复操作无法触发 |
| `RestoreFromVersion` 已实现 | 但前端没有入口调用 |
| CenterPanel 底部有静态提示 | 始终显示，但**和版本管理完全无关** |

### 1.2 用户痛点

- "我刚改了一大段，但不知道改了哪些"
- "想回到 10 分钟前的版本，找不到路"
- "简历越改越差，想回到'上午那个状态'但已经保存过很多次了"
- "导出 PDF 发现格式乱了，不确定是哪个修改导致的"

---

## 2. 功能设计

### 2.1 核心交互

```
┌─────────────────────────────────────────────────────────────┐
│   版本快照时间轴                                           │
│                                                              │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │  ○ ── ○ ── ● ── ○ ── ○ ── ── ── ○ (当前)  🏷️ 保存快照 │  │
│  │  14:00  14:15 14:22 14:30 14:45        15:10           │  │
│  │  (自动)  (自动) [手动] (自动) (自动)                    │  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│                                                              │
│  如遇内容被切割，可通过增加换行、或前往「设置」调整间距解决     │
└─────────────────────────────────────────────────────────────┘

交互:
  - 鼠标悬停节点 → tooltip 显示标签、时间、修改统计
  - 点击节点 → 预览该版本内容（右侧预览区切换）
  - 拖拽节点 → 快速跳转到某个版本
  - 点击「保存快照」→ 弹出命名对话框 → 创建手动里程碑
```

### 2.2 两种版本类型

| 类型 | 触发方式 | 节点样式 | 生命周期 |
|------|---------|---------|---------|
| **自动版本** | 每次 Ctrl+S 保存时自动创建 | 空心圆 ○，灰色 | 保留最近 50 个，超出自动清理 |
| **手动快照** | 用户显式点击「保存快照」 | 实心圆 ●，蓝色 | **永久保留**，除非用户手动删除 |

**关键区别**：
- 自动版本 = "我保存了"（undo history）
- 手动快照 = "这个状态很重要，我要记住"（checkpoint/bookmark）

### 2.3 手动快照的额外能力

| 能力 | 说明 |
|------|------|
| 命名标签 | 如"投腾讯版"、"投字节版"、"定稿v1" |
| 关联 JD 上下文 | 标记这个快照是为哪个岗位准备的 |
| 版本对比 | 选中两个节点，Diff 对比差异 |
| 导出快照 | 单独导出某个快照版本的 PDF |
| 从快照恢复 | 一键回退到某个快照状态 |

---

## 3. 数据模型

### 3.1 方案选择

| 方案 | 改动 | 优缺点 |
|------|------|--------|
| A: 扩展 `resume_versions` | 加 3 个字段 | ✅ 改动小；❌ 自动/手动混在一起，查询需过滤 |
| B: 新建 `resume_snapshots` | 新建表 + API | ✅ 职责分离清晰；❌ 维护两套版本概念 |

**选择方案 A** — 扩展 `resume_versions`，理由：
- 手动快照底层也是"某个时刻的简历内容"，复用 `content_snapshot` 天然合适
- 用 `snapshot_type` 字段区分自动/手动
- 时间轴统一渲染两种节点，视觉区分即可

### 3.2 表变更

```sql
-- 扩展 resume_versions 表
ALTER TABLE resume_versions
    ADD COLUMN snapshot_type VARCHAR(20) DEFAULT 'auto' NOT NULL,
    ADD COLUMN label VARCHAR(100),
    ADD COLUMN jd_context_id UUID REFERENCES jd_contexts(id) ON DELETE SET NULL;

-- snapshot_type 约束
ALTER TABLE resume_versions
    ADD CONSTRAINT chk_snapshot_type CHECK (snapshot_type IN ('auto', 'manual'));

-- 为手动快照创建索引（方便列表查询）
CREATE INDEX idx_resume_versions_manual
    ON resume_versions(resume_id, snapshot_type)
    WHERE snapshot_type = 'manual';
```

### 3.3 Go Model 扩展

```go
// model/resume.go

type SnapshotType string

const (
    SnapshotTypeAuto   SnapshotType = "auto"
    SnapshotTypeManual SnapshotType = "manual"
)

// VersionSnapshot 版本快照（列表视图）
type VersionSnapshot struct {
    ID              string       `json:"id"`
    ResumeID        string       `json:"resumeId"`
    VersionNo       int          `json:"versionNo"`
    SnapshotType    SnapshotType `json:"snapshotType"`
    Label           *string      `json:"label,omitempty"`
    JDContextID     *string      `json:"jdContextId,omitempty"`
    CreatedAt       int64        `json:"createdAt"`

    // 计算字段（从 content_snapshot 分析得出，非存储）
    ChangeSummary  *ChangeSummary `json:"changeSummary,omitempty"`
    ContentSummary *ContentSummary `json:"contentSummary,omitempty"`
}

// ChangeSummary 版本变更摘要（用于 tooltip 展示）
type ChangeSummary struct {
    AddedSections   int `json:"addedSections"`
    RemovedSections int `json:"removedSections"`
    ModifiedFields  int `json:"modifiedFields"`
    CharDiff        int `json:"charDiff"` // 正=增加，负=减少
}

// ContentSummary 内容概要（用于快速识别版本）
type ContentSummary struct {
    TargetPosition string `json:"targetPosition"` // 求职意向
    LatestCompany  string `json:"latestCompany"`  // 最近公司
    TotalWorkYears int    `json:"totalWorkYears"`
}

// CreateSnapshotRequest 创建手动快照
type CreateSnapshotRequest struct {
    ResumeID    string  `json:"resumeId" binding:"required"`
    Label       string  `json:"label" binding:"required,max=100"`
    JDContextID *string `json:"jdContextId,omitempty"`
}

// SnapshotListItem 快照列表项（简化版，用于时间轴）
type SnapshotListItem struct {
    ID           string       `json:"id"`
    VersionNo    int          `json:"versionNo"`
    SnapshotType SnapshotType `json:"snapshotType"`
    Label        *string      `json:"label,omitempty"`
    CreatedAt    int64        `json:"createdAt"`
    IsCurrent    bool         `json:"isCurrent"` // 是否为当前内容
}
```

### 3.4 自动版本清理策略

```go
// 保留策略：每个简历最多保留 50 个自动版本 + 无上限的手动快照
func (r *repository) cleanupAutoVersions(ctx context.Context, resumeID string) error {
    _, err := r.pool.Exec(ctx, `
        DELETE FROM resume_versions
        WHERE resume_id = $1
          AND snapshot_type = 'auto'
          AND id NOT IN (
              SELECT id FROM resume_versions
              WHERE resume_id = $1 AND snapshot_type = 'auto'
              ORDER BY created_at DESC
              LIMIT 50
          )
    `, resumeID)
    return err
}
```

---

## 4. API 设计

### 4.1 新增端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/resumes/:id/snapshots` | 获取版本时间轴列表 |
| POST | `/api/resumes/:id/snapshots` | 创建手动快照 |
| GET | `/api/resumes/:id/snapshots/:snapshotId` | 获取快照详情（content） |
| PUT | `/api/resumes/:id/snapshots/:snapshotId` | 更新快照标签 |
| DELETE | `/api/resumes/:id/snapshots/:snapshotId` | 删除快照 |
| POST | `/api/resumes/:id/snapshots/:snapshotId/restore` | 从快照恢复 |
| POST | `/api/resumes/:id/snapshots/diff` | 对比两个快照的差异 |

### 4.2 端点详细设计

#### GET `/api/resumes/:id/snapshots` — 获取时间轴

```json
// Query params: ?limit=20&includeAuto=true
// Response:
{
  "items": [
    {
      "id": "uuid",
      "versionNo": 12,
      "snapshotType": "manual",
      "label": "投腾讯云版",
      "jdContextId": "uuid",
      "createdAt": 1717000000,
      "isCurrent": false,
      "contentSummary": {
        "targetPosition": "后端开发工程师",
        "latestCompany": "字节跳动",
        "totalWorkYears": 5
      }
    },
    {
      "id": "uuid",
      "versionNo": 11,
      "snapshotType": "auto",
      "label": null,
      "createdAt": 1716999000,
      "isCurrent": false,
      "changeSummary": {
        "addedSections": 0,
        "removedSections": 0,
        "modifiedFields": 3,
        "charDiff": 156
      }
    },
    // ... 更多
    {
      "id": "uuid",
      "versionNo": 13,
      "snapshotType": "auto",
      "label": null,
      "createdAt": 1717001000,
      "isCurrent": true,
      "changeSummary": null  // 当前版本无比较对象
    }
  ],
  "total": 48,
  "hasMore": true
}
```

#### POST `/api/resumes/:id/snapshots` — 保存快照

```json
// Request:
{
  "label": "投腾讯云版",
  "jdContextId": "uuid"  // 可选
}

// Response:
{
  "id": "uuid",
  "versionNo": 14,
  "snapshotType": "manual",
  "label": "投腾讯云版",
  "createdAt": 1717000000
}
```

#### POST `/api/resumes/:id/snapshots/diff` — 版本对比

```json
// Request:
{
  "snapshotIdA": "uuid",
  "snapshotIdB": "uuid"
}

// Response:
{
  "snapshotA": { "versionNo": 10, "label": "投腾讯版", "createdAt": ... },
  "snapshotB": { "versionNo": 14, "label": "投字节版", "createdAt": ... },
  "diffs": [
    {
      "moduleType": "personal",
      "moduleInstanceId": "personal-1",
      "field": "email",
      "before": "old@example.com",
      "after": "new@example.com"
    },
    {
      "moduleType": "work",
      "moduleInstanceId": "work-2",
      "field": "description",
      "before": "Built backend system",
      "after": "Designed and implemented a scalable backend system..."
    }
  ],
  "stats": {
    "modulesAdded": 0,
    "modulesRemoved": 0,
    "modulesModified": 2,
    "fieldsChanged": 5
  }
}
```

#### POST `/api/resumes/:id/snapshots/:snapshotId/restore` — 恢复

```json
// 无请求体，直接触发恢复
// 恢复前自动保存当前状态为新版本（可逆）

// Response: 更新后的简历详情（同 GET /api/resumes/:id 响应）
```

---

## 5. 前端组件设计

### 5.1 组件树

```
CenterPanel
  ├── SnapshotTimeline         ← 新增：时间轴横条
  │   ├── TimelineTrack        ← 轨道背景
  │   ├── TimelineNode[]       ← 版本节点列表
  │   │   ├── AutoNode         ← 自动版本（空心圆）
  │   │   └── ManualNode       ← 手动快照（实心圆+标签）
  │   └── SaveSnapshotButton   ← 「保存快照」按钮
  │
  └── PagedResumePaper         ← 已有：简历预览
      └── 分页静态提示          ← 已有：「如遇内容被切割...」
```

### 5.2 组件 Props & State

```typescript
// SnapshotTimeline.tsx

interface SnapshotTimelineProps {
  resumeId: string
  currentContent: Resume     // 当前简历内容（用于标记 isCurrent）
  onSelectSnapshot: (snapshotId: string) => void
  onRestoreSnapshot: (snapshotId: string) => void
}

interface SnapshotTimelineState {
  snapshots: SnapshotListItem[]     // 从 API 加载
  loading: boolean
  selectedId: string | null         // 当前选中的节点
  hoveredId: string | null          // 鼠标悬停的节点
  showSaveDialog: boolean           // 保存快照对话框
  scrollPosition: number            // 横向滚动位置
}
```

### 5.3 视觉规范

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                    ┌──────────────────────┐              │
│  ○ ── ○ ── ● ── ○ ── ○ ── ○ ── ○ │  🏷️ 保存快照        │              │
│  14:00  14:15 14:22 14:30 14:45   └──────────────────────┘              │
│  (自动)  (自动) 投腾讯  (自动) (自动)                                    │
│                 云版                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  如遇内容被切割，可通过增加换行、或前往「设置」调整间距解决                 │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

节点样式:
  ○ 自动版本: 直径 12px, 空心, 边框 2px #CBD5E1, 悬停时变为 #94A3B8
  ● 手动快照: 直径 16px, 实心, 背景 #1A56DB (主题色), 下方显示标签文字
  (当前):  外圈 pulsing 蓝色光环, 2px #3B82F6

轨道:
  高度 3px, 颜色 #E2E8F0
  手动快照处加粗为 4px

标签文字:
  fontSize: 10px, color: #64748B
  手动快照标签: fontWeight: 600, color: #1A56DB

hover tooltip:
  ┌─────────────────────────────┐
  │  投腾讯云版 (v12)          │
  │ 2026-05-30 14:22            │
  │ ─────────────────────────── │
  │ 求职意向: 后端开发工程师      │
  │ 最近经历: 字节跳动            │
  │ 工作年限: 5年               │
  │ 内容变化: +3行, -1行        │
  │ ─────────────────────────── │
  │ [预览此版本] [从此刻恢复]    │
  └─────────────────────────────┘

滚动:
  横向 scrollable, overflow-x: auto
  默认滚动到最右侧（最新版本）
  鼠标滚轮支持横向滚动（使用 CSS scroll-snap）
```

### 5.4 保存快照对话框

```
┌─────────────────────────────────────────────┐
│   保存简历快照                             │
│                                              │
│  快照标签:                                   │
│  ┌─────────────────────────────────────┐    │
│  │ 投腾讯云版                           │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  关联岗位:                                   │
│  ┌─────────────────────────────────────┐    │
│  │ 后端开发工程师 @ 腾讯云 (可选)        │    │
│  └─────────────────────────────────────┘    │
│                                              │
│  💡 建议: 为不同岗位投递的简历版本添加标签， │
│  方便后续快速切换和对比                      │
│                                              │
│  ┌──────────┐  ┌──────────┐                │
│  │  取消    │  │  保存快照 │                │
│  └──────────┘  └──────────┘                │
└─────────────────────────────────────────────┘
```

### 5.5 状态管理

```typescript
// src/store/resumeStore.ts 新增

interface SnapshotStore {
  // 时间轴数据
  snapshots: SnapshotListItem[]
  snapshotsLoading: boolean
  selectedSnapshotId: string | null

  // 操作
  loadSnapshots: (resumeId: string) => Promise<void>
  createSnapshot: (resumeId: string, label: string, jdContextId?: string) => Promise<void>
  deleteSnapshot: (resumeId: string, snapshotId: string) => Promise<void>
  restoreFromSnapshot: (resumeId: string, snapshotId: string) => Promise<void>
  diffSnapshots: (resumeId: string, a: string, b: string) => Promise<DiffResult>
}
```

### 5.6 与现有 save 流程的融合

```
用户 Ctrl+S 保存
      │
      ▼
  resumeStore.saveResume()  ← 已有逻辑
      │
      ├── 调用 PUT /api/resumes/:id
      │       │
      │       └── 后端自动 createVersion(auto)
      │
      └── 成功后 → loadSnapshots(refresh) ← 新增：刷新时间轴

用户点击「保存快照」
      │
      ▼
  弹出命名对话框
      │
      ▼
  resumeStore.createSnapshot()
      │
      ├── 调用 POST /api/resumes/:id/snapshots
      │       │
      │       └── 后端创建 manual snapshot（标签 + 可选JD关联）
      │
      └── 成功后 → 时间轴新增实心节点
```

---

## 6. 后端实现

### 6.1 Repository 扩展

```go
// storage/resume/repository.go — 新增方法

type Repository interface {
    // ... 已有方法 ...

    // 快照管理
    ListSnapshots(ctx context.Context, resumeID string, limit int, includeAuto bool) ([]model.VersionSnapshot, int, error)
    CreateManualSnapshot(ctx context.Context, userID, resumeID string, label string, jdContextID *string) (*model.VersionSnapshot, error)
    UpdateSnapshotLabel(ctx context.Context, snapshotID, userID, label string) error
    DeleteSnapshot(ctx context.Context, snapshotID, userID string) error
    GetSnapshotDetail(ctx context.Context, snapshotID string) (*model.VersionSnapshot, []byte, error)
    DiffSnapshots(ctx context.Context, snapshotAID, snapshotBID string) (*model.DiffResult, error)
}
```

### 6.2 快照创建流程（含 diff 计算）

```go
func (r *repository) CreateManualSnapshot(ctx context.Context, userID, resumeID string, label string, jdContextID *string) (*model.VersionSnapshot, error) {
    // 1. 获取当前内容
    var currentContentJSON []byte
    err := r.pool.QueryRow(ctx,
        `SELECT content FROM resumes WHERE id = $1 AND user_id = $2`,
        resumeID, userID,
    ).Scan(&currentContentJSON)
    if err != nil { return nil, ErrResumeNotFound }

    // 2. 获取下一个版本号
    var versionNo int
    err = r.pool.QueryRow(ctx,
        `SELECT COALESCE(MAX(version_no), 0) + 1 FROM resume_versions WHERE resume_id = $1`,
        resumeID,
    ).Scan(&versionNo)

    // 3. 插入手动快照
    var snapshot model.VersionSnapshot
    err = r.pool.QueryRow(ctx, `
        INSERT INTO resume_versions (resume_id, user_id, version_no, content_snapshot, snapshot_type, label, jd_context_id)
        VALUES ($1, $2, $3, $4, 'manual', $5, $6)
        RETURNING id, version_no, snapshot_type, label, created_at
    `, resumeID, userID, versionNo, currentContentJSON, label, jdContextID).
        Scan(&snapshot.ID, &snapshot.VersionNo, &snapshot.SnapshotType, &snapshot.Label, &snapshot.CreatedAt)

    return &snapshot, nil
}
```

### 6.3 Diff 算法（Go 实现）

```go
// 对比两个快照的 JSON 内容，找出所有变化
func (r *repository) DiffSnapshots(ctx context.Context, snapshotAID, snapshotBID string) (*model.DiffResult, error) {
    // 1. 加载两个快照的 content JSON
    contentA, _ := r.GetVersionContent(ctx, snapshotAID)
    contentB, _ := r.GetVersionContent(ctx, snapshotBID)

    // 2. 解析为 map[string]interface{}
    var jsonA, jsonB map[string]interface{}
    json.Unmarshal(contentA, &jsonA)
    json.Unmarshal(contentB, &jsonB)

    // 3. 逐模块对比
    diffs := []model.FieldDiff{}
    modulesA := jsonA["modules"].([]interface{})
    modulesB := jsonB["modules"].([]interface{})

    // 对每个模块类型，逐个 field 对比
    // 使用宽松对比：只记录实际变化，忽略 JSON 顺序差异

    return &model.DiffResult{
        SnapshotA: snapshotAInfo,
        SnapshotB: snapshotBInfo,
        Diffs:     diffs,
        Stats:     stats,
    }, nil
}
```

---

## 7. 差异化特性（超越基础版本管理）

### 7.1 智能对比提示

当用户选择两个快照对比时：
```
┌──────────────────────┬──────────────────────┐
│ v10 · 投腾讯云版      │ v14 · 当前            │
├──────────────────────┼──────────────────────┤
│ 出生年月：2026.01    │ 出生年月：2026.01    │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ │ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ 籍贯：北京市          │ 籍贯：北京市          │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ │ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ 工作描述:            │ 工作描述:            │
│ Built backend system │ Designed and         │  ← 高亮变化
│                      │ implemented...       │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ │ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ 技能:                │ 技能:                │
│ Python, Java         │ Go, Kubernetes,     │  ← 新增
│                      │ 微服务, Python       │
└──────────────────────┴──────────────────────┘
```

### 7.2 关联 PDF 导出

```
用户在时间轴上点击某个快照节点
  → 右侧预览区加载该快照的简历内容
  → 用户可以对该快照直接导出 PDF
  → 解决了"导出 PDF 发现格式乱了，不确定是哪个修改导致的"的痛点
```

---

## 8. 实施路线

### Phase 1: 后端 + 基础 UI（2 天）

```
Day 1:
  - [DB] 扩展 resume_versions 表（snapshot_type, label, jd_context_id）
  - [后端] Repository 新增 ListSnapshots / CreateManualSnapshot / DeleteSnapshot
  - [后端] Handler 新增快照 CRUD 路由
  - [前端] API 层新增 snapshot 相关方法

Day 2:
  - [前端] SnapshotTimeline 组件开发（横向滚动轨道 + 节点渲染）
  - [前端] 自动版本节点渲染
  - [前端] 「保存快照」按钮 + 命名对话框
  - 联调
```

### Phase 2: 交互增强（1.5 天）

```
Day 3:
  - [前端] 点击节点 → 预览快照内容
  - [前端] hover tooltip（时间、标签、内容概要）
  - [前端] 从快照恢复功能
  - [后端] RestoreFromSnapshot API

Day 4 (半天):
  - [前端] 删除快照（手动快照可删，自动版本不可单独删）
  - [前端] 自动版本清理提示
  - 测试
```

### Phase 3: 版本对比（1.5 天）

```
Day 5:
  - [后端] DiffSnapshots 算法实现
  - [前端] Diff 对比面板 UI
  - [前端] 选中两个节点 → 对比按钮

Day 6 (半天):
  - [前端] 快照关联 JD 上下文（复用已有的 JD 上下文选择器）
  - 完善测试
```

---

## 9. 与设计文档的呼应

| AI 能力扩展文档 | 版本快照集成 |
|----------------|------------|
| JD 匹配系统 | 快照可关联 `jd_context_id`，标记"这是为某岗位优化的版本" |
| Bullet Point 重写 | 重写结果应用后，自动创建快照（标签："AI 优化 @ 15:30"） |
| 一键优化 | 优化前后自动创建快照对（"优化前" / "优化后"），方便对比效果 |
| 一键优化进度 | 进度条上方展示快照时间轴，增强操作安全感和可逆性 |
