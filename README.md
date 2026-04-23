# ResumeCraft（简历大师）

一个 React + TypeScript 在线简历编辑器，提供三栏编辑体验、实时 A4 预览、模块化内容管理与 AI 辅助优化能力。

## 功能亮点

1. **三栏工作台**：左栏模块管理，中栏实时预览，右栏表单编辑。
2. **模块化编辑**：固定模块（个人信息、教育经历、工作经历、项目经历） + 可选模块（荣誉奖项、证书资质、技能清单、自我评价） + 自定义模块。
3. **拖拽排序与显隐**：模块顺序可调整，支持一键隐藏/显示。
4. **三套模板**：经典单栏、现代双栏、简约极简。
5. **样式调节**：主题色、字体、字号、边距、行距、段落间距。
6. **富文本能力**：加粗/斜体/下划线/链接/列表，链接使用应用内弹窗。
7. **技术栈输入优化**：支持 `,` `，` `、` `+` 和回车分隔。
8. **自动保存**：localStorage 防抖持久化，刷新后可恢复。
9. **A4 分页预览**：按页切片展示，减少内容截断。
10. **AI 辅助**：简历评估、内容润色建议。
11. **PDF 导出**：前端生成 HTML + 后端渲染 PDF。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript 5 + Vite 5 |
| 状态管理 | Zustand（localStorage 持久化） |
| 样式 | Tailwind CSS |
| 拖拽 | dnd-kit |
| 富文本 | Tiptap |
| 后端框架 | Go (Gin) |
| PDF 渲染 | chromedp (Chromium) |
| 安全性 | DOMPurify（HTML 净化） |
| AI | OpenAI Compatible API（流式 SSE） |

## 项目结构

```
introduce/
├── src/                          # 前端源码
│   ├── api/                      # API 客户端
│   │   ├── auth.ts               # 认证接口
│   │   ├── resume.ts             # 简历 CRUD
│   │   ├── export.ts             # 导出任务
│   │   ├── ai.ts                 # AI 配置/对话/评估
│   │   ├── client.ts             # 通用请求客户端
│   │   └── types.ts              # 共享类型定义
│   ├── components/
│   │   ├── layout/               # 布局组件
│   │   │   ├── AppShell.tsx      # 根布局（三栏容器）
│   │   │   ├── LeftPanel.tsx     # 左栏：模块管理
│   │   │   ├── CenterPanel.tsx   # 中栏：预览区
│   │   │   ├── RightPanel.tsx    # 右栏：表单编辑
│   │   │   ├── PreviewPage.tsx   # A4 预览页
│   │   │   ├── ResumeListPage.tsx# 简历列表页
│   │   │   ├── LoginPage.tsx     # 登录页
│   │   │   └── ai/               # AI 相关面板
│   │   │       ├── AISuggestionPanel.tsx  # 润色建议面板
│   │   │       └── ResumeScoreDrawer.tsx  # 简历评分抽屉
│   │   ├── resume/
│   │   │   ├── blocks/           # 各模块表单
│   │   │   │   ├── PersonalForm.tsx       # 个人信息
│   │   │   │   ├── EducationForm.tsx      # 教育经历
│   │   │   │   ├── WorkForm.tsx           # 工作经历
│   │   │   │   ├── ProjectForm.tsx       # 项目经历
│   │   │   │   ├── AwardsForm.tsx        # 荣誉奖项
│   │   │   │   ├── CertificatesForm.tsx  # 证书资质
│   │   │   │   ├── SkillsForm.tsx        # 技能清单
│   │   │   │   ├── SummaryForm.tsx       # 自我评价
│   │   │   │   └── CustomForm.tsx        # 自定义模块
│   │   │   ├── preview/          # 简历模板渲染
│   │   │   │   ├── ResumePreview.tsx      # 模板分发器
│   │   │   │   ├── PagedResumePaper.tsx  # A4 分页器
│   │   │   │   ├── ClassicTemplate.tsx    # 经典单栏
│   │   │   │   ├── ModernTemplate.tsx    # 现代双栏
│   │   │   │   └── MinimalTemplate.tsx   # 简约极简
│   │   │   └── DragHandle.tsx     # 拖拽手柄
│   │   └── common/               # 通用组件
│   │       ├── RichTextEditor.tsx # 富文本编辑器（Tiptap）
│   │       ├── TagInput.tsx      # 标签输入（技能/关键词）
│   │       ├── TemplateSwitcher.tsx    # 模板切换器
│   │       ├── ThemeColorPicker.tsx    # 主题色选择器
│   │       ├── IndustryPresetPicker.tsx# 行业预设选择
│   │       ├── YearMonthPicker.tsx     # 年月选择器
│   │       └── YearMonthRangePicker.tsx# 年月范围选择器
│   ├── hooks/
│   │   ├── useExportPDF.ts        # PDF 导出流程
│   │   ├── useResumeEvaluation.ts # 简历评估流式交互
│   │   ├── useAISuggest.ts        # 内容润色建议
│   │   ├── useCloudSync.ts        # 云端同步
│   │   └── useDeleteConfirm.tsx   # 删除确认弹窗
│   ├── store/
│   │   └── resumeStore.ts         # 简历状态管理
│   ├── types/
│   │   └── resume.ts              # 简历数据模型定义
│   ├── ai/
│   │   ├── config.ts              # AI 模型配置
│   │   ├── provider.ts            # AI Provider 封装
│   │   └── userConfig.ts         # 用户 AI 配置
│   ├── App.tsx
│   └── main.tsx
│
├── backend/                       # 后端 API 服务
│   ├── cmd/server/main.go         # 入口
│   └── internal/
│       ├── app/server.go          # Gin 引擎与依赖注入
│       ├── router/router.go       # 路由注册
│       ├── config/config.go       # 配置管理
│       ├── middleware/
│       │   ├── auth.go            # JWT 认证中间件
│       │   ├── cors.go            # CORS 中间件
│       │   └── logger.go          # 日志中间件
│       ├── handler/
│       │   ├── handler.go         # Handler 依赖注入容器
│       │   ├── auth.go           # 认证接口
│       │   ├── resume.go          # 简历 CRUD
│       │   ├── export.go         # 导出任务管理
│       │   ├── pdf.go            # PDF 渲染接口
│       │   └── ai.go             # AI 配置/对话/评估/润色
│       ├── service/
│       │   ├── auth/              # 认证服务
│       │   ├── resume/           # 简历服务
│       │   ├── export/           # 导出任务服务
│       │   ├── pdf/              # PDF 渲染服务
│       │   └── ai/               # AI 服务（评估/润色/对话）
│       ├── storage/
│       │   ├── db/postgres.go    # PostgreSQL 连接池
│       │   ├── resume/           # 简历存储
│       │   ├── export/           # 导出存储
│       │   └── ai/               # AI 会话/配置存储
│       ├── model/                # 数据模型
│       ├── renderer/             # PDF 渲染器（chromedp）
│       └── ssr/                  # 简历 HTML SSR
│
├── Dockerfile                    # 前端 + Go 后端一体镜像
├── docker-compose.yml            # 开发环境编排
├── vite.config.ts               # Vite 配置（含 API 代理）
└── package.json
```

## 快速开始

### 前端

```bash
# 安装依赖
npm install

# 启动开发服务器（API 代理到 localhost:8787）
npm run dev

# 生产构建
npm run build

# 预览构建产物
npm run preview
```

### 后端

```bash
cd backend

# 安装依赖
go mod tidy

# 启动服务（默认 :8787）
go run ./cmd/server

# 或使用 Docker
docker compose up --build
```

## 环境变量

### 前端（Vite）

```env
VITE_API_BASE_URL=http://localhost:8787/api
```

### 后端

```env
# 数据库
DATABASE_URL=postgres://user:password@localhost:5432/resumecraft?sslmode=disable

# JWT
JWT_SECRET=your-secret-key

# AI（可选）
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/register | 用户注册 |
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/refresh | 刷新 Token |
| POST | /api/auth/logout | 登出 |
| GET | /api/auth/me | 当前用户信息 |
| GET | /api/resumes | 简历列表 |
| POST | /api/resumes | 创建简历 |
| GET | /api/resumes/:id | 获取简历详情 |
| PUT | /api/resumes/:id | 更新简历 |
| DELETE | /api/resumes/:id | 删除简历 |
| POST | /api/resumes/:id/exports | 创建导出任务 |
| GET | /api/exports/:taskId | 查询导出任务状态 |
| GET | /api/ai/config | 获取 AI 配置 |
| POST | /api/ai/config | 保存 AI 配置 |
| GET | /api/ai/conversations | AI 对话列表 |
| GET | /api/ai/conversations/:id | 获取对话详情 |
| DELETE | /api/ai/conversations/:id | 删除对话 |
| POST | /api/ai/evaluate/stream | 简历评估 |
| POST | /api/ai/suggest | 内容润色建议 |
| GET | /api/ai/suggest-records | 润色记录列表 |
| POST | /api/ai/suggest-records | 保存润色记录 |
| POST | /api/pdf/export | 渲染 HTML 为 PDF |

## 部署

### Docker（前后端一体）

```bash
docker build -t resumecraft:latest .
docker run --rm -p 8787:8787 \
  -e DATABASE_URL=postgres://... \
  -e JWT_SECRET=... \
  resumecraft:latest
```

### 分离部署

- 前端：构建产物部署至 Nginx/Caddy，代理 API 请求至后端
- 后端：Go 二进制或容器部署，监听 `:8787`

## 文档

- 需求文档：`需求文档.md`
- 技术文档：`技术文档.md`

## 已知限制

1. PDF 导出依赖后端 `chromedp` 服务，请确保后端正常启动。
2. 头像图片以 Base64 存入 localStorage，建议单张不超过 1mb。
3. AI 功能需要用户自行配置 OpenAI API Key。

## License

当前仓库未声明开源许可证，默认保留所有权利。
