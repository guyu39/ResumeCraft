# ResumeCraft（简历大师）

一个基于 React + TypeScript 的在线简历编辑器，提供三栏编辑体验、实时 A4 预览、模块化内容管理与 PDF 导出能力。

## 功能亮点

1. 三栏工作台：左栏模块管理，中栏实时预览，右栏表单编辑。
2. 模块化编辑：固定模块 + 可选模块 + 自定义模块。
3. 拖拽排序与显隐：模块顺序可调整，支持一键隐藏显示。
4. 三套模板：经典单栏、现代双栏、简约极简。
5. 样式调节：主题色、字体、字号、边距、行距、段落间距。
6. 富文本能力：加粗/斜体/下划线/链接/列表，链接使用应用内弹窗。
7. 技术栈输入优化：支持 `,` `，` `、` `+` 和回车分隔。
8. 自动保存：localStorage 防抖持久化，刷新后可恢复。
9. A4 分页预览：按页切片展示，减少内容截断。
10. PDF 导出：仅保留后端服务导出链路。

## 技术栈

1. React 18
2. TypeScript 5
3. Vite 5
4. Zustand
5. Tailwind CSS
6. dnd-kit
7. Tiptap
8. Go(Gin) + Chromium(chromedp) PDF 服务
9. DOMPurify

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 启动开发环境

```bash
npm run dev
```

### 3) 生产构建

```bash
npm run build
```

### 4) 构建产物预览

```bash
npm run preview
```

## Docker 部署（前后端一体）

### 1) 构建镜像

```bash
docker build -t resumecraft:latest .
```

### 2) 启动容器

```bash
docker run --rm -p 8787:8787 resumecraft:latest
```

### 3) 访问与验证

1. 前端页面：`http://localhost:8787`
2. 后端健康检查：`http://localhost:8787/api/pdf/health`

## 项目结构

```text
src/
├─ App.tsx
├─ main.tsx
├─ index.css
├─ types/
│  └─ resume.ts
├─ store/
│  └─ resumeStore.ts
├─ hooks/
│  ├─ useExportPDF.ts
│  └─ useDeleteConfirm.tsx
├─ components/
│  ├─ layout/
│  │  ├─ AppShell.tsx
│  │  ├─ LeftPanel.tsx
│  │  ├─ CenterPanel.tsx
│  │  ├─ RightPanel.tsx
│  │  └─ PreviewPage.tsx
│  ├─ common/
│  └─ resume/
│     ├─ blocks/
│     └─ preview/
```

## 关键实现说明

1. 数据模型：统一定义于 `src/types/resume.ts`。
2. 状态管理：`src/store/resumeStore.ts`，含模块 CRUD、排序、显隐、样式设置、持久化。
3. 预览渲染：`src/components/resume/ResumePreview.tsx` 按模板分发。
4. 分页算法：`src/components/resume/PagedResumePaper.tsx`。
5. 导出链路：`src/hooks/useExportPDF.ts`。

## 文档

1. 需求文档：见项目根目录 `需求文档.md`
2. 技术文档：见项目根目录 `技术文档.md`

## 已知现状

1. PDF 导出依赖后端服务，请确保后端已启动。

## License

当前仓库未声明开源许可证，默认保留所有权利。
