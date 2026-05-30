# 简历保存架构重构 — 可行性分析

> 日期: 2026-05-30 | 基于用户提议：localStorage 热缓存 + 事件驱动落库 + 脏标记去重

---

## 一、方案概述

```
当前架构 (问题多):
  编辑 → debouncedSave(500ms) → localStorage
                                  ↓ (独立)
  CloudSync 定时器(30s) → PUT /api/resumes/:id → createVersion(auto)
  beforeunload         → PUT /api/resumes/:id → createVersion(auto)
  结果: 一次编辑会话产生 N 个 auto 版本 (N = 分钟数 × 2)

重构架构:
  编辑 → debouncedSave(2s) → localStorage + isDirty = true
                                  ↓
  ┌──── 事件驱动落库（三个触发点）────┐
  │                                     │
  │ ① beforeunload (退出/刷新)          │
  │ ② visibilitychange (切后台)         │
  │ ③ 切换快照节点（如有修改先落库）    │
  │                                     │
  │   每触发: if (isDirty) → PUT →      │
  │   createVersion(auto) → isDirty=0   │
  │         isDirty=0 → 跳过 PUT        │
  └─────────────────────────────────────┘
  结果: 一次编辑会话 ≤ 3 个 auto 版本 ✅
```

**核心思路**：数据库写操作从"定时推进"改为"事件驱动 + 脏标记去重"——只在必要时落盘。

---

## 二、脏标记（isDirty）机制

### 2.1 设计

```typescript
// resumeStore.ts 新增
interface ResumeStoreState {
  isDirty: boolean  // 自上次落库以来是否有修改
}

interface ResumeStoreActions {
  markDirty: () => void
  markClean: () => void
}
```

### 2.2 生命周期

```
编辑 (打字/换样式/加模块) → markDirty()           isDirty = true
       ↓
CloudSync 触发落库        → if isDirty → PUT
                            → markClean()          isDirty = false
                            → 跳过                  isDirty = false
       ↓
切换快照节点               → if isDirty → 先 PUT → markClean() → 再加载快照
                            → 直接加载快照          isDirty = false
```

### 2.3 防止重复请求的价值

| 场景 | 无脏标记 | 有脏标记 |
|------|---------|---------|
| 用户点 5 个快照节点浏览（未编辑） | 5 次 PUT (相同内容) | 0 次 PUT |
| 编辑 → 切后台 → 回来 → 再切后台 | 2 次 PUT | 1 次 PUT (第一次后 isDirty=false) |
| 编辑 → 切快照 → 再切快照 | 2 次 PUT | 1 次 PUT (第一次后 isDirty=false) |
| 编辑 → 退出 | 1 次 PUT | 1 次 PUT ✅ |

**核心收益**：幂等——同一次修改不会触发多次重复的数据库写。

---

## 三、三个触发点详解

### 3.1 beforeunload（退出/刷新）

**触发时机**：关闭标签页、刷新页面、浏览器返回

```
window.addEventListener('beforeunload', () => {
  if (isDirty) {
    // 优先用 fetch (keepalive: true)
    // 兜底用 sendBeacon
    saveToCloud()
  }
})
```

### 3.2 visibilitychange（切后台）

**触发时机**：切换标签页、最小化窗口、锁屏

```
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isDirty) {
    saveToCloud()
  }
})
```

**原因**：移动端切后台可能被系统 kill，`beforeunload` 不会触发。`visibilitychange` 是更可靠的切后台检测。

### 3.3 切换快照节点（新触发点）

**触发时机**：用户点击时间轴节点，切换到另一个版本

```
handleSelectSnapshot(snapshot) {
  // 1. 如果当前有未保存的修改，先落库
  if (isDirty) {
    await saveToCloud()  // 保存当前编辑中的内容
  }
  // 2. 加载目标快照
  await loadSnapshotPreview(snapshot.id)
}
```

**重要性**：这是最容易丢数据的场景。用户修改了简历但还没退出，点击查看历史版本——如果不先保存，当前修改就丢了。

---

## 四、可行性逐项分析

### 4.1 localStorage 热缓存 ✅ 完全可行

**现状**：已有完整实现。

`resumeStore.ts` 的 `debouncedSave` + `saveToStorage` 已经将简历写入 `resumecraft_draft` key。只需：
- 防抖从 500ms → 2000ms
- 每次 `debouncedSave` 时 `markDirty()`

```typescript
const debouncedSave = debounce((resume: Resume) => {
  saveToStorage(resume)
  markDirty()
}, 2000)
```

### 4.2 Redis 替代 localStorage ⚠️ 暂不推荐

| 维度 | localStorage | Redis |
|------|-------------|-------|
| 延迟 | 0ms (本地同步) | ~1-5ms (网络) |
| 可靠性 | 浏览器崩溃=丢失 | 持久化，更可靠 |
| 基础设施 | 零成本 | 需要 Redis 服务 |
| 多设备同步 | 不支持 | 天然支持 |

**建议**：Phase 1 用 localStorage，Phase 2（多设备编辑场景）再引入 Redis。

### 4.3 beforeunload / visibilitychange 写入数据库 ⚠️ 基本可行

**可行性**：
- `fetch` 在 `beforeunload` 中可以使用 (keepalive: true)
- `navigator.sendBeacon` 作为兜底保证送达
- `visibilitychange` 在移动端比 `beforeunload` 更可靠

**边界问题**：

| 场景 | 触发点 | 数据是否丢失 |
|------|--------|------------|
| 关闭标签页 | beforeunload | ❌ |
| 刷新页面 | beforeunload | ❌ |
| 切换标签页 | visibilitychange | ❌ |
| 浏览器崩溃 | 无 | ✅ (localStorage 保留，下次恢复) |
| 移动端被 kill | visibilitychange | ✅ (localStorage 保留，下次恢复) |
| 断网时退出 | beforeunload (请求失败) | ✅ (localStorage 保留，下次重试) |

### 4.4 实时更新 latest_version_id ❌ 不可行

**问题**：`latest_version_id` 是 FK → `resume_versions`。如果只在触发点创建版本行，编辑过程中没有新版本 ID 可引用。

**正确做法**：
- `latest_version_id` 只在成功写入数据库后更新
- 触发点保存时：`createVersion → 写入新版本行 → 设置 latest_version_id = 新版本ID`
- 编辑过程中 `latest_version_id` 保持上次落库的值（语义正确：指向"最后一次安全落盘的版本"）

---

## 五、需要改什么

### 5.1 前端改动

| 文件 | 改动 | 工作量 |
|------|------|--------|
| `resumeStore.ts` | + `isDirty` 状态 + `markDirty`/`markClean` 方法 | ~15 行 |
| `resumeStore.ts` | 防抖 500ms → 2000ms + `markDirty` 调用 | 2 行 |
| `useCloudSync.ts` | 删除 30s `setInterval` | ~20 行删除 |
| `useCloudSync.ts` | 新增 `visibilitychange` 监听 | ~10 行 |
| `useCloudSync.ts` | 新增 `sendBeacon` 兜底 | ~5 行 |
| `useCloudSync.ts` | 保存前检查 `isDirty`，保存后 `markClean` | ~5 行 |
| `CenterPanel.tsx` | `handleSelectSnapshot` 先保存再加载 | ~5 行 |

**总计**：~60 行新增，~20 行删除。

### 5.2 后端改动

| 文件 | 改动 | 工作量 |
|------|------|--------|
| 无 | 无需改动 | 0 |

后端 `Update` 逻辑完全不变。只是触发频率从 30s/次 → 每个触发点最多 1 次。

### 5.3 删除的代码

- `useCloudSync.ts` 中的 30 秒 `setInterval`（~20 行）
- `saveStatus` 轮询展示逻辑（可简化但不必须删除）

---

## 六、风险 & 缓解

| 风险 | 概率 | 缓解 |
|------|------|------|
| 用户编辑 2 小时不退出 → 浏览器崩溃 | 低 | localStorage + isDirty 保存最后状态 |
| beforeunload 请求未完成 | 中 | `fetch` keepalive + `sendBeacon` 兜底 |
| 多标签编辑冲突 | 低 | localStorage 隔离；后端 `updated_at` 乐观锁 |
| 用户期望"实时同步" | 中 | UI 显示 "本地已保存" / "已同步" |

---

## 七、与现有版本的兼容性

- `resumes` 表：完全兼容
- `resume_versions` 表：完全兼容，auto 版本减少 90%+
- `snapshot_type`：不受影响
- 快照时间轴：不受影响

---

## 八、实施步骤

### Phase 1（1 小时）
1. `resumeStore.ts`：+ `isDirty`/`markDirty`/`markClean`
2. `resumeStore.ts`：防抖 500ms → 2000ms
3. `useCloudSync.ts`：删除 `setInterval`，保留 `beforeunload` + 加 `visibilitychange`
4. `useCloudSync.ts`：加 `isDirty` 检查 + `sendBeacon` 兜底
5. `CenterPanel.tsx`：切换快照前先保存
6. 端到端测试

### Phase 2（后续）
7. `visibilitychange` → 切后台保存后，切回前台时从服务器拉取最新内容（多设备同步）
8. 断网重试队列
9. 乐观锁冲突检测 + 合并

---

## 九、一句话总结

> **三个触发点 + 一个脏标记 = 既保证数据安全又避免请求风暴。核心改动 ~60 行前端代码，后端零改动。auto 版本数降低 90%+。**
