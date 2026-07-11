package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"resumecraft-pdf-backend/internal/requestmeta"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

func TestRequestLoggerPropagatesOneRequestID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.Use(RequestLogger())
	engine.GET("/health", func(c *gin.Context) {
		metadata, ok := requestmeta.From(c.Request.Context())
		if !ok || metadata.RequestID == "" {
			t.Fatal("request metadata missing")
		}
		if metadata.Method != http.MethodGet || metadata.Path != "/health" {
			t.Fatalf("unexpected request metadata: %#v", metadata)
		}
		response.JSONSuccess(c, map[string]string{"requestID": metadata.RequestID})
	})

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d", recorder.Code)
	}
	if recorder.Header().Get("X-Request-ID") == "" {
		t.Fatal("X-Request-ID header missing")
	}
	if got := recorder.Header().Get("X-Request-ID"); !strings.Contains(recorder.Body.String(), got) {
		t.Fatalf("response request ID does not match header: %s", recorder.Body.String())
	}
}
