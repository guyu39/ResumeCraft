# 简历自动保存 & 版本管理 — 冲突分析与优化建议

> 日期: 2026-05-30 | 基于当前代码的深度分析

---

## 一、当前流程全貌

```
┌─ 前端 ─────────────────────────────────────────────────────┐
│                                                              │
│  编辑操作 (打字/切换样式/...)                                 │
│       │                                                      │
│       ▼                                                      │
│  debouncedSave(500ms) ──────→ localStorage (即时)            │
│       │                                                      │
│       │  (独立定时器，每30秒检查数据变化)                      │
│       ▼                                                      │
│  useCloudSync.saveToCloud() ──→ HTTP PUT /api/resumes/:id    │
│                                                              │
│  点击快照节点 → initResume() ──→ resume = 快照内容           │
│       │                                    │                 │
│       │                                    ▼                 │
│       │                          debouncedSave → CloudSync   │
│       │                          (会把快照内容作为"编辑"推上去)│
│                                                              │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─ 后端 ─────────────────────────────────────────────────────┐
│                                                              │
│  Handler.UpdateResume                                        │
│       │                                                      │
│       ▼                                                      │
│  Repository.Update                                           │
│    ├─ 1. SELECT 当前 content (旧)                            │
│    ├─ 2. 合并新数据                                          │
│    ├─ 3. createVersion(旧) → INSERT resume_versions          │
│    │       snapshot_type = 'auto' (默认值)                   │
│    ├─ 4. UPDATE resumes SET content = 新, latest_version_id  │
│                                                              │
│  用户点「保存快照」                                           │
│    → CreateManualSnapshot                                    │
│      ├─ check duplicate label                                │
│      ├─ INSERT resume_versions (snapshot_type = 'manual')    │
│      └─ 清理 auto 版本 (保留最近 50)                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 二、核心冲突点

### 冲突 1：auto 版本泛滥，清理时机滞后

**现象**：
- 每次云端 Update 创建一个 auto 版本（snapshot_type='auto'）
- CloudSync 每 30 秒检查一次，主动编辑时每分钟可能产生 2+ 个 auto 版本
- 自动版本清理只在 `CreateManualSnapshot` 时触发
- 如果用户从不点「保存快照」→ auto 版本**永不清理**，持续膨胀

**数据估算**：用户编辑 10 分钟，每分钟 2 次 Update = 20 个 auto 版本。一天可能有上百个。

### 冲突 2：点击快照节点触发"伪编辑"

**链路**：
```
点击节点A → initResume(resume=A内容) → resume 被替换
                                          ↓
                              debouncedSave 触发 → localStorage
                                          ↓            (500ms后)
                              CloudSync 30秒后检测到变化
                                          ↓
                              PUT /api/resumes/:id → createVersion(auto) ❗
```

**问题**：快照内容被当作"用户编辑"推送到服务器：
1. 产生一个**和快照内容完全相同的 auto 版本**（冗余数据）
2. `latest_version_id` 更新，但实际内容没变
3. `resumes.updated_at` 被刷新，但简历内容可能和之前一模一样

### 冲突 3：initResume 可能丢失 title/locale/template

**代码**：`resumeStore.ts` — `initResume` 使用 `{ ...base, ...partial }` 合并。但快照 content 是：
```json
{ "themeColor": "...", "styleSettings": {...}, "modules": [...] }
```

不包含 `title`、`locale`、`template`。如果 `partial` 中没有这些字段，`createDefaultResume()` 的默认值会覆盖用户设置好的标题和语言。

**当前 CenterPanel 的处理**（勉强规避了这个问题）：
```typescript
initResume({
  ...resume,           // ← 先展开当前 resume，保留 title/locale
  modules: ...,        // ← 再覆盖 modules
  themeColor: ...,     // ← 再覆盖 themeColor
})
```

但如果 `...resume` 中的字段被 `...base` 覆盖（取决于 `initResume` 实现），仍可能丢失。

### 冲突 4：时间轴与编辑状态脱节

**现象**：
- 时间轴只显示手动快照（`includeAuto: false`）
- 用户修改内容后，时间轴上的节点标签不变
- 用户无法直观感知"当前内容相比上次快照改动了什么"

**场景**：
```
14:00 保存快照「投腾讯版」
14:05 继续编辑，修改了技能和工作经历
14:10 进入时间轴 → 仍显示「投腾讯版」→ 但内容已经不同了
```

### 冲突 5：auto 版本与手动快照混用同一版本号序列

**代码**：`createVersion` 使用 `MAX(version_no) + 1`

auto 和 manual 版本共享同一个递增序列。如果产生大量 auto 版本，手动快照的 `version_no` 会跳得很高，但实际上"有效版本"只有几个手动快照。

---

## 三、优化建议

### 优先级 P0（立即修）

#### 1. 点击快照节点不触发后端 Update

**方案**：在 CloudSync 中增加 `contentHash` 比较，如果快照恢复后的内容与上次同步的内容完全相同，跳过保存。

```typescript
// useCloudSync.ts
const contentHash = (resume: Resume) => {
  const data = serializeResume(resume)
  return simpleHash(JSON.stringify(data))
}

// 保存前比较
const currentHash = contentHash(resume)
if (currentHash === lastSyncedHashRef.current) {
  return true // 内容未变，跳过
}
```

**效果**：快照恢复后，CloudSync 检测到内容哈希与上次相同 → 不触发 PUT → 不产生冗余 auto 版本。

#### 2. Update 时也触发 auto 版本清理

```go
// repository.go: Update 方法末尾
func (r *repository) Update(...) {
    // ... 现有逻辑 ...

    // 新增：每次 Update 后清理 auto 版本
    go r.cleanupAutoVersions(ctx, resumeID) // 异步，不阻塞请求

    return &model.ResumeUpdateResponse{...}, nil
}
```

**效果**：auto 版本永远不会超过 50 个，无需等待用户手动保存快照。

### 优先级 P1（本周）

#### 3. initResume 不丢失元数据

确保加载快照时保留 `title`、`locale`、`template`：

```typescript
// CenterPanel.tsx handleSelectSnapshot
initResume({
  id: resume.id,           // 保留 ID
  title: resume.title,     // 保留标题
  locale: resume.locale,   // 保留语言
  template: resume.template, // 保留模板
  modules: c.modules as Resume['modules'],
  themeColor: c.themeColor ?? resume.themeColor,
  styleSettings: c.styleSettings ?? resume.styleSettings,
})
```

#### 4. 时间轴标记"当前是否已偏离快照"

在时间轴节点上增加视觉标记：
```
● 投腾讯版 (已修改)    ← 蓝色实心 + 空心外圈表示当前内容已偏离
● 投字节版              ← 普通蓝色实心
● v5 (当前)             ← 蓝色高亮 = 当前内容与快照一致
```

方案：用 `contentHash` 比较当前内容和每个快照内容。如果当前内容与所有快照都不匹配 → 提示"已修改，可保存新快照"。

### 优先级 P2（后续迭代）

#### 5. auto 版本用途透明化

在某个设置页面或展开视图中，让用户可以浏览 auto 版本（用于细粒度回退）。

#### 6. 保存快照时自动计算 diff

用户保存快照时自动显示"相比上次快照的改动"，帮助写有意义的标签。

---

## 四、改动清单

| 优先级 | 改动 | 文件 |
|-------|------|------|
| P0 | 内容哈希去重（CloudSync 跳过相同内容） | `useCloudSync.ts` |
| P0 | Update 后异步清理 auto 版本 | `repository.go` |
| P1 | initResume 保留 title/locale/template | `CenterPanel.tsx` |
| P1 | 时间轴标记"已偏离快照"状态 | `SnapshotTimeline.tsx` |
| P2 | auto 版本浏览 UI | 新组件 |
| P2 | 保存快照时自动 diff | `SnapshotTimeline.tsx` |
