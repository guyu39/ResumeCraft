## Why

当前 `/jobs` 招聘聚合页使用文档级滚动，表格没有占满可用视口，数据较多时底部分页会离开视野，降低连续浏览与翻页效率。页面导航也只提供含义偏返回动作的“返回简历”，无法直接进入投递管理。

## What Changes

- 将招聘表格调整为占满顶部工具栏和分页栏之间的剩余视口。
- 将筛选控件并入紧凑顶部工具栏，移除独立筛选横条和重复说明信息，为列表释放更多高度。
- 将表格设为独立滚动区域，保留鼠标滚轮、触控板和触屏滚动能力，但隐藏原生滚动条。
- 让分页栏始终位于当前视口底部且不覆盖表格内容。
- 将“返回简历”改为“我的简历”，并增加前往现有 `/applications` 投递管理页的入口。
- 让行业与招聘类型下拉互斥展开，点击另一个筛选时一次完成关闭旧面板并打开新面板。
- 优化表格标题栏与底部分页的颜色层级，降低高饱和蓝色和全大写标题带来的视觉噪声。
- 删除页面“手动同步”入口，后端默认每小时自动同步一次招聘源数据；已打开的页面每小时静默刷新列表与筛选枚举。

## Capabilities

### New Capabilities

- `job-list-viewport`: 规定招聘聚合页的满视口表格布局、常驻分页、隐藏滚动条和页面导航行为。

### Modified Capabilities

无。

## Impact

- 前端页面：`src/pages/JobPostingsPage.tsx`、`src/components/job/JobFilterBar.tsx`
- 复用组件：`StyledSelect` 增加 Listbox 模态行为配置，`JobPagination` 调整视觉样式
- 后端调度：`backend/internal/app/server.go`、`backend/internal/cron/sync_jobs.go`
- 部署配置：`docker-compose.yml`、`backend/.env.example`
- 路由：复用现有 `/`、`/applications` 与 `/jobs`，不新增路由或后端接口
- 兼容性：保留现有手动同步 API，但 `/jobs` 页面不再暴露调用入口
- 依赖：继续使用现有 Tailwind CSS 与 Lucide React，不新增依赖
