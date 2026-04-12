# ResumeCraft AI 后端移植与双版本规划

文档版本：v1.0  
更新日期：2026-04-11  
适用范围：当前仓库（前端已存在 AI 功能）+ 二期 Go 后端

## 1. 目标与范围

### 1.1 目标

1. 将当前前端 AI 能力（评估、建议、流式输出、容错解析）迁移到后端统一实现。
2. 在同一技术主干上交付两版产品：
3. 开源版：可单机部署、无登录、最小依赖、可快速体验。
4. 商业版：登录鉴权 + 数据持久化 + 审计与配额控制。

### 1.2 非目标

1. 本阶段不做企业组织权限、计费订阅、多人协同。
2. 本阶段不引入复杂工作流编排引擎（先以轻量队列/同步接口为主）。

## 2. 版本定义与能力矩阵

| 能力 | 开源版 | 商业版 |
|---|---|---|
| AI 评估与建议 | 支持 | 支持 |
| 流式返回（SSE） | 支持 | 支持 |
| Provider 适配层 | 支持 | 支持 |
| 登录/鉴权 | 不支持 | 支持 |
| 云端持久化（简历/AI 记录） | 不支持（仅前端本地） | 支持 |
| AI 调用审计日志 | 基础日志（文件/控制台） | 完整审计（DB） |
| 配额/限流（按用户） | 全局限流 | 用户级限流与额度 |
| 管理后台能力 | 不支持 | 后续扩展 |

说明：建议“同一代码库 + 特性开关”实现两版，避免双分支长期漂移。

## 3. 目标架构（后端 AI 中台）

## 3.1 分层

1. API 层：Gin 路由、鉴权中间件、参数校验、SSE 推送。
2. 应用层：AI 用例编排（评估、建议、重写、摘要等）。
3. 领域层：Prompt 模板、输出 JSON Schema、评分维度与规则。
4. 基础设施层：Provider 适配器、重试、熔断、缓存、日志、数据库。

## 3.2 核心模块

1. ai/provider：对接 OpenAI 兼容协议（可扩展 DeepSeek、通义等）。
2. ai/prompt：系统提示词、模板变量拼装、版本管理。
3. ai/parser：结构化解析与兜底清洗（避免前端重复做容错）。
4. ai/policy：内容安全、长度限制、模型参数白名单。
5. ai/stream：SSE 统一封包（event、delta、done、error）。
6. ai/telemetry：耗时、token、错误率、provider 维度统计。

## 4. 前后端契约规划（建议）

## 4.1 公共接口（开源/商业共用）

1. POST /api/ai/evaluate
2. POST /api/ai/suggest
3. POST /api/ai/stream/suggest（SSE）
4. GET /api/ai/models（可用模型清单）
5. GET /api/ai/health

## 4.2 商业版新增接口

1. GET /api/ai/history
2. GET /api/ai/history/:id
3. POST /api/ai/history/:id/replay
4. GET /api/usage/me（当月调用量、余额、限额）

## 4.3 请求体统一原则

1. 前端仅传业务数据（resume、目标岗位、语气偏好等），不传 prompt 细节。
2. 后端返回结构化 JSON，禁止前端依赖自然语言硬解析。
3. 流式接口与非流式接口返回字段命名一致，减少前端分支。

## 5. 数据模型规划（商业版）

1. user：用户主表。
2. resume：简历主表。
3. resume_version：简历快照。
4. ai_request_log：AI 请求日志（输入摘要、模型、耗时、状态码、token）。
5. ai_result：结构化结果存档（evaluate/suggest）。
6. ai_usage_daily：日维度用量聚合（便于限流与报表）。

建议：MySQL（业务数据）+ Redis（会话、限流、短缓存）。

## 6. 迁移策略（从前端 AI 到后端 AI）

### 阶段 P0：契约冻结（1-2 天）

1. 盘点当前前端 AI 入口与数据结构（evaluate/suggest/stream）。
2. 固化响应 Schema（字段、类型、可空规则）。
3. 前端增加兼容层：优先调用后端，保留前端 mock 开关。

交付物：接口契约补充文档 + 前端适配清单。

### 阶段 P1：后端 MVP（4-6 天）

1. 实现 /api/ai/evaluate、/api/ai/suggest、/api/ai/stream/suggest。
2. 接入单一 provider（OpenAI 兼容）+ 超时/重试。
3. 上线结构化解析和错误码体系。

交付物：可用后端 AI 服务（无登录）。

### 阶段 P2：开源版发布（2-3 天）

1. 补齐 .env.example、README、Dockerfile、最小部署脚本。
2. 默认关闭数据库依赖，开箱即用。
3. 提供演示数据与健康检查脚本。

交付物：开源版 tag（例如 v2.0-oss）。

### 阶段 P3：商业版能力（6-10 天）

1. 登录鉴权（JWT + Refresh Token）。
2. 简历与 AI 结果持久化。
3. 用户级限流/配额与审计查询接口。

交付物：商业版 tag（例如 v2.0-pro）。

### 阶段 P4：稳定性与灰度（3-5 天）

1. 指标与告警：错误率、耗时、SSE 中断率。
2. 灰度策略：按用户比例切流。
3. 回滚预案：故障时切回前端 AI（临时开关）。

交付物：上线手册与回滚手册。

## 7. 分支与发布策略

1. 主干仅保留一套代码，通过环境变量控制版本能力。
2. 建议特性开关：
3. FEATURE_AUTH_ENABLED
4. FEATURE_PERSISTENCE_ENABLED
5. FEATURE_AI_HISTORY_ENABLED
6. 开源发布：默认全部关闭；商业部署：按配置开启。

## 8. 环境变量规划（新增）

1. AI_PROVIDER=openai_compatible
2. AI_BASE_URL=
3. AI_API_KEY=
4. AI_MODEL_EVALUATE=
5. AI_MODEL_SUGGEST=
6. AI_TIMEOUT_SEC=60
7. AI_RETRY_MAX=2
8. FEATURE_AUTH_ENABLED=false
9. FEATURE_PERSISTENCE_ENABLED=false
10. DB_DSN=
11. REDIS_ADDR=

## 9. 验收标准

### 9.1 开源版验收

1. 无数据库配置时也能正常启动。
2. 前端可完成 AI 评估与建议（含流式）。
3. 接口错误码清晰，日志可定位。

### 9.2 商业版验收

1. 未登录不可访问私有 AI 历史接口。
2. 登录用户可查询自己的 AI 记录与用量。
3. 限流策略生效，不影响其他用户。

## 10. 风险与应对

1. 风险：模型输出不稳定导致结构化解析失败。  
应对：JSON Schema 校验 + 回退解析 + 失败重试一次。

2. 风险：SSE 在网络抖动时中断。  
应对：前端断线重连 + 后端幂等 requestId。

3. 风险：双版本代码分叉。  
应对：单代码库 + 特性开关 + 统一 CI。

4. 风险：成本不可控。  
应对：模型分级、温度控制、用户级配额与缓存。

## 11. 第一阶段实施清单（建议下一个迭代直接执行）

1. 定稿 AI 接口 Schema（evaluate/suggest/stream）。
2. 在 backend/internal 新增 ai 模块骨架（handler/service/provider/parser）。
3. 前端 AI 调用统一改为后端代理路径（保留 mock 开关）。
4. 完成最小端到端联调（含一条流式链路）。
5. 输出开源版部署说明与商业版扩展说明。
