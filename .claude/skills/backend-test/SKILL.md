---
name: backend-test
description: Go 测试用例编写规范。当需要为 Handler/Service/Repository 编写单元测试、集成测试、基准测试时使用此 skill。基于项目已有的 testing 模式。
agent_created: true
---

# Backend Test — Go 测试编写规范

## 测试文件命名

- `xxx_test.go`，与源文件同目录
- Package 名：单元测试用 `package <pkg>`（白盒），也可用 `package <pkg>_test`（黑盒）

## 已有测试示例（sanitizer_test.go）

```go
func TestMaskChineseName(t *testing.T) {
    san := New(DefaultConfig())
    input := "姓名：张三，性别：男"
    masked := san.Mask(input)

    if strings.Contains(masked, "张三") {
        t.Errorf("Expected name to be masked, got: %s", masked)
    }
    if !strings.Contains(masked, "[NAME_") {
        t.Errorf("Expected NAME placeholder, got: %s", masked)
    }
}
```

## 核心模式

### 1. 基本单元测试

每个函数对应 `func Test<FuncName>(t *testing.T)`，遵循 AAA 模式：

```go
func TestCreateResume(t *testing.T) {
    // Arrange: 准备输入和 mock
    ctx := context.Background()
    repo := &mockResumeRepo{}
    svc := resume.NewService(repo)

    // Act: 执行被测函数
    result, err := svc.Create(ctx, "user-1", model.CreateResumeRequest{Title: "测试简历"})

    // Assert: 验证结果
    if err != nil {
        t.Fatalf("unexpected error: %v", err)
    }
    if result.Title != "测试简历" {
        t.Errorf("title = %q, want %q", result.Title, "测试简历")
    }
}
```

### 2. 表驱动测试（多个 case）

```go
func TestValidateTitle(t *testing.T) {
    tests := []struct {
        name    string
        title   string
        wantErr bool
    }{
        {"正常标题", "我的简历", false},
        {"空标题", "", true},
        {"超长标题", strings.Repeat("a", 200), true},
        {"特殊字符", "<script>", true},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := validateTitle(tt.title)
            if (err != nil) != tt.wantErr {
                t.Errorf("validateTitle(%q) error = %v, wantErr = %v", tt.title, err, tt.wantErr)
            }
        })
    }
}
```

### 3. 并发安全测试

```go
func TestSanitizerConcurrency(t *testing.T) {
    done := make(chan bool)
    for i := 0; i < 10; i++ {
        go func() {
            san := New(DefaultConfig())
            masked := san.Mask("张三 13812345678")
            restored := san.Unmask(masked)
            if restored != "张三 13812345678" {
                t.Errorf("round-trip failed: %s", restored)
            }
            done <- true
        }()
    }
    for i := 0; i < 10; i++ {
        <-done
    }
}
```

### 4. 基准测试

```go
func BenchmarkMask(b *testing.B) {
    input := "姓名：张三\n手机：13812345678\n..."
    b.ResetTimer()
    for i := 0; i < b.N; i++ {
        s := New(DefaultConfig())
        s.Mask(input)
    }
}
```

## Handler 层测试

使用 `httptest.NewRecorder()` + `gin.CreateTestContext()`：

```go
func TestGetAIConfig(t *testing.T) {
    gin.SetMode(gin.TestMode)
    w := httptest.NewRecorder()
    c, _ := gin.CreateTestContext(w)

    // 模拟请求
    c.Request = httptest.NewRequest("GET", "/api/ai/config", nil)
    c.Set(middleware.ContextUserIDKey, "test-user")

    h := handler.New(...)  // 注入 mock service
    h.GetAIConfig(c)

    if w.Code != http.StatusOK {
        t.Errorf("status = %d, want 200", w.Code)
    }
}
```

## Service 层测试

**不需要真实的 Postgres/Redis**——使用接口 mock：

```go
type mockRepo struct {
    cfg *model.AIConfig
    err error
}

func (m *mockRepo) GetByUserID(ctx context.Context, userID string) (*model.AIConfig, error) {
    return m.cfg, m.err
}

func TestService_GetConfig(t *testing.T) {
    repo := &mockRepo{cfg: &model.AIConfig{Provider: "deepseek"}}
    svc := ai.NewService(repo, nil, nil)
    cfg, err := svc.GetConfig(context.Background(), "user-1")
    // ...
}
```

## 运行测试

```bash
cd backend
go test ./...                              # 全部
go test -v ./internal/service/ai/sanitizer/  # 单个包
go test -v -run TestMask ./...              # 按名称过滤
go test -bench=. ./...                      # 基准测试
```
