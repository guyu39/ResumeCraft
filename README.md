# ResumeCraft（简历大师）

一个 React + TypeScript 在线简历编辑器，提供三栏编辑体验、实时 A4 预览、模块化内容管理与 AI 辅助优化能力。

## 功能亮点

1. **三栏工作台**：左栏模块管理，中栏实时预览，右栏表单编辑。
2. **模块化编辑**：固定模块（个人信息、教育经历、工作经历、项目经历） + 可选模块（荣誉奖项、证书资质、技能清单、自我评价） + 自定义模块。
3. **拖拽排序与显隐**：模块顺序可调整，支持一键隐藏/显示。
4. **三套模板**：经典单栏、现代双栏、简约极简。
5. **样式调节**：主题色、字体、字号、边距、行距、段落间距、模块标题样式。
6. **富文本能力**：加粗/斜体/下划线/链接/列表，链接使用应用内弹窗。
7. **字体编码检测：** 粘贴时提示异常字符，并支持自动修复。
8. **自动保存**：localStorage 防抖持久化，刷新后可恢复。
9. **云端同步**：登录后自动同步到云端，支持跨端恢复。
10. **A4 分页预览**：按页切片展示，减少内容截断。
11. **AI 辅助**：简历评估、内容润色建议、JD 匹配分析、求职信生成。
12. **PDF 导出**：后端异步任务模式（创建任务 → 轮询状态 → 下载）。
13. **国际化**：支持设置英文简历，并且使用 ai 将简历翻译成英文。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript 5 + Vite 5 |
| 状态管理 | Zustand（localStorage 持久化） |
| 样式 | Tailwind CSS |
| 拖拽 | @dnd-kit |
| 富文本 | Tiptap |
| 后端框架 | Go (Gin) |
| PDF 渲染 | chromedp (Chromium) |
| 数据安全 | DOMPurify（HTML 净化） |
| AI | OpenAI Compatible API（流式 SSE） |

## 项目结构

```
introduce/
├── src/                          # 前端源码
│   ├── api/                      # API 客户端
│   │   ├── client.ts             # 通用请求客户端
│   │   ├── types.ts              # API 类型定义
│   │   ├── auth.ts               # 认证接口
│   │   ├── resume.ts             # 简历 CRUD
│   │   ├── export.ts            # 导出任务
│   │   ├── ai.ts                 # AI 接口
│   │   └── index.ts
│   ├── components/
│   │   ├── layout/               # 布局组件
│   │   ├── resume/               # 简历模块
│   │   └── common/               # 通用组件
│   ├── hooks/
│   │   ├── useExportPDF.ts       # PDF 导出（异步任务）
│   │   ├── useCloudSync.ts       # 云端同步
│   │   └── ...
│   ├── store/
│   │   ├── authStore.ts          # 认证状态
│   │   └── resumeStore.ts        # 简历状态
│   └── App.tsx
├── backend/                      # 后端 API 服务
│   ├── cmd/server/main.go
│   └── internal/
│       ├── app/
│       ├── router/
│       ├── handler/              # HTTP Handler
│       ├── service/              # 业务逻辑
│       ├── storage/              # 数据访问
│       ├── model/                # 数据模型
│       └── renderer/             # PDF 渲染
├── python-parser/                # 简历解析服务（FastAPI）
├── docker/                       # 本地开发依赖（nginx/minio/redis 等）
├── 需求文档.md
├── 技术文档.md
└── AI后端移植与双版本规划.md
```

## 快速开始

### Docker Compose（一键启动）

```bash
docker compose up --build
```

默认包含：后端 API、PostgreSQL、MinIO、Redis、简历解析服务与 Nginx。

### 前端

```bash
# 安装依赖
npm install

# 启动开发服务器（API 代理到 localhost:8787）
npm run dev

# 生产构建（Vite 打包）
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

### 后端（Go）

```env
# 数据库
PG_DSN=postgres://user:password@localhost:5432/resumecraft?sslmode=disable

# JWT
AUTH_JWT_SECRET=your-secret-key

# AI 配置加密密钥（用于保存用户 AI 配置）
AI_ENCRYPTION_KEY=change-this-32-char-key!!

# 对象存储（S3 兼容，未配置则使用内存降级）
S3_ENDPOINT=localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
S3_BUCKET=resumecraft
S3_USE_SSL=false

# 简历解析服务（python-parser）
PARSER_SERVICE_URL=http://localhost:9002

# Redis（用于认证与限流，可选）
REDIS_ENABLED=true
REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

# 限流
RATE_LIMIT_ENABLED=true
RATE_LIMIT_FAIL_OPEN=true
RATE_LIMIT_AUTH_CAPACITY=8
RATE_LIMIT_AUTH_REFILL_PER_SEC=0.2
RATE_LIMIT_AI_CAPACITY=20
RATE_LIMIT_AI_REFILL_PER_SEC=0.05
RATE_LIMIT_GLOBAL_CAPACITY=120
RATE_LIMIT_GLOBAL_REFILL_PER_SEC=2

# 静态资源（可选，Go 后端直出前端构建产物时启用）
FRONTEND_DIST_DIR=../dist
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
| POST | /api/resumes/parse | 简历导入解析 |
| GET | /api/resumes/:id | 获取简历详情 |
| PUT | /api/resumes/:id | 更新简历 |
| DELETE | /api/resumes/:id | 删除简历 |
| POST | /api/resumes/:id/exports | 创建导出任务 |
| GET | /api/exports/:taskId | 查询导出任务状态 |
| GET | /api/exports/:taskId/download | 下载导出文件 |
| GET | /api/ai/config | 获取 AI 配置 |
| POST | /api/ai/config | 保存 AI 配置 |
| GET | /api/ai/parser-config | 获取简历解析配置 |
| POST | /api/ai/parser-config | 保存简历解析配置 |
| GET | /api/ai/conversations | AI 对话列表 |
| GET | /api/ai/conversations/:id | 获取对话详情 |
| DELETE | /api/ai/conversations/:id | 删除对话 |
| POST | /api/ai/evaluate/stream | 简历评估（SSE 流式） |
| POST | /api/ai/jd-match/stream | JD 匹配分析（SSE 流式） |
| POST | /api/ai/score | JD 评分 |
| POST | /api/ai/rewrite/bullet | 要点改写 |
| POST | /api/ai/cover-letter | 求职信生成 |
| POST | /api/ai/suggest | 内容润色建议 |
| POST | /api/ai/translate | 简历翻译 |
| GET | /api/ai/suggest-records | 润色记录列表 |
| POST | /api/ai/suggest-records | 保存润色记录 |
| POST | /api/pdf/export | PDF 导出（内部接口） |

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
- AI 功能技术方案：`AI功能-JD匹配与求职信生成技术方案.md`

## 已知限制

1. PDF 导出依赖后端 `chromedp` 服务，请确保后端正常启动。
2. AI 功能需要用户自行配置 OpenAI API Key。
3. 版本管理 UI（列表/恢复）待开发，后端已支持 `RestoreVersion`。


## License

当前仓库未声明开源许可证，默认保留所有权利。