---
name: backend-api
description: Go/Gin 后端接口编写规范。当需要新增 API 端点、修改现有接口、或涉及 handler/service/model/router 任一层时使用此 skill。适用于 ResumeCraft 后台。
agent_created: true
---

# Backend API — Go/Gin 接口编写规范

## 分层架构

```
router.go → handler/ai.go → service/ai/ → storage/ai/ → PostgreSQL
                ↓                    ↓
            model/ai.go          provider.go (AI服务商调用)
```

## 新增一个 API 端点需要修改的文件（4 层）

### 1. Model 层 (`internal/model/`)

在对应业务的 model 文件中定义 Request / Response 结构体：

```go
// EnhanceOperation 操作类型
type EnhanceOperation string

const (
    EnhanceMetrics EnhanceOperation = "metrics"
    EnhanceRisk    EnhanceOperation = "risk"
)

// EnhanceRequest 请求
type EnhanceRequest struct {
    Scenario  string           `json:"scenario" binding:"required"`
    Operation EnhanceOperation `json:"operation" binding:"required,oneof=metrics risk star"`
}

// EnhanceResponse 响应
type EnhanceResponse struct {
    Result string `json:"result"`
}
```

**规则**：
- JSON tag 使用 camelCase，binding tag 声明校验规则
- 枚举类型用 `string` typedef + const 块
- 响应字段始终有 `json` tag

### 2. Service 层 (`internal/service/<domain>/`)

在 Interface 中声明方法 → 在 struct 上实现：

```go
type Service interface {
    // ... 已有方法
    Enhance(ctx context.Context, userID string, req model.EnhanceRequest) (*model.EnhanceResponse, error)
}

func (s *service) Enhance(ctx context.Context, userID string, req model.EnhanceRequest) (*model.EnhanceResponse, error) {
    cfg, err := s.cfgRepo.GetByUserID(ctx, userID)
    if err != nil {
        return nil, ErrAIConfigNotFound
    }
    // ... 业务逻辑
    return &model.EnhanceResponse{Result: "ok"}, nil
}
```

**规则**：
- 方法签名第一个参数始终 `ctx context.Context`，第二个 `userID string`
- 错误返回区分业务错误（如 `ErrAIConfigNotFound`）和系统错误
- 需要用户配置/权限的，先查 repo 取配置

### 3. Handler 层 (`internal/handler/`)

```go
// EnhanceContent AI 增强
// POST /api/ai/enhance
func (h *Handler) EnhanceContent(c *gin.Context) {
    userID, ok := c.Get(middleware.ContextUserIDKey)
    if !ok {
        response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
        return
    }

    var req model.EnhanceRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "参数错误")
        return
    }

    result, err := h.aiService.Enhance(c.Request.Context(), userID.(string), req)
    if err != nil {
        if err == ai.ErrAIConfigNotFound {
            response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "请先配置 AI 服务")
            return
        }
        log.Printf("[ai] EnhanceContent error: %v", err)
        response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "AI 增强失败")
        return
    }

    response.JSONSuccess(c, result)
}
```

**规则**：
- 开头注释写明方法名和路由（`// POST /api/xxx`）
- 首行获取 `userID`，缺失返回 401
- 请求解析用 `c.ShouldBindJSON(&req)`，失败返回 400
- 调用 service 后检查业务错误 → 映射 HTTP 状态码
- 系统错误统一 `log.Printf` + 500
- 成功用 `response.JSONSuccess(c, data)`

### 4. Router 层 (`internal/router/router.go`)

```go
// 高成本接口（需要限流）
if aiLimiter != nil {
    aiGroup.POST("/enhance", aiLimiter, h.EnhanceContent)
} else {
    aiGroup.POST("/enhance", h.EnhanceContent)
}
```

**规则**：
- 每个业务模块独立 `gin.RouterGroup`（auth/resumes/ai/exports）
- 通过 `h.ServiceName() != nil` 做服务可用性检查
- 认证中间件：`middleware.AuthRequired(h.AuthService())`
- 高成本接口挂载 aiLimiter，同时写两路（有限流/无限流）

## 统一响应格式

```go
response.JSONSuccess(c, data)           // 200
response.JSONCreated(c, data)           // 201
response.JSONError(c, code, key, msg)   // 自定义错误
```

## 接口 URL 命名

- RESTful：`GET /resumes/:id/snapshots`、`POST /resumes/:id/exports`
- 名词复数 + 资源嵌套
- 动作名用驼峰写在注释中，不在 URL 里

## go.mod 模块名

`resumecraft-pdf-backend`
