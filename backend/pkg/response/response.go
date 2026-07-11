package response

import (
	"time"

	"resumecraft-pdf-backend/internal/requestmeta"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ErrorBody struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"requestId"`
}

type SuccessBody struct {
	Code      string      `json:"code"`
	Message   string      `json:"message"`
	RequestID string      `json:"requestId"`
	Data      interface{} `json:"data,omitempty"`
}

func newRequestID() string {
	return "req_" + uuid.New().String()[:12]
}

func requestID(c *gin.Context) string {
	if metadata, ok := requestmeta.From(c.Request.Context()); ok && metadata.RequestID != "" {
		return metadata.RequestID
	}
	return newRequestID()
}

func JSONSuccess(c *gin.Context, data interface{}) {
	c.JSON(200, SuccessBody{
		Code:      "OK",
		Message:   "success",
		RequestID: requestID(c),
		Data:      data,
	})
}

func JSONError(c *gin.Context, status int, code, message string) {
	c.JSON(status, ErrorBody{
		Code:      code,
		Message:   message,
		RequestID: requestID(c),
	})
}

// JSONSuccessWithCode 自定义成功码
func JSONSuccessWithCode(c *gin.Context, code string, message string, data interface{}) {
	c.JSON(200, SuccessBody{
		Code:      code,
		Message:   message,
		RequestID: requestID(c),
		Data:      data,
	})
}

// JSONCreated 201 创建成功
func JSONCreated(c *gin.Context, data interface{}) {
	c.JSON(201, SuccessBody{
		Code:      "OK",
		Message:   "created",
		RequestID: requestID(c),
		Data:      data,
	})
}

// TimestampToMilliseconds converts time.Time to Unix milliseconds
func TimestampToMilliseconds(t time.Time) int64 {
	return t.UnixMilli()
}
