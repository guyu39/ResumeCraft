package middleware

import (
	"log"
	"time"

	"resumecraft-pdf-backend/internal/requestmeta"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := "req_" + uuid.New().String()[:12]
		c.Set("requestID", requestID)
		c.Header("X-Request-ID", requestID)
		c.Request = c.Request.WithContext(requestmeta.With(c.Request.Context(), requestmeta.Metadata{
			RequestID: requestID,
			Method:    c.Request.Method,
			Path:      c.FullPath(),
			IP:        c.ClientIP(),
			UserAgent: c.GetHeader("User-Agent"),
		}))

		start := time.Now()
		path := c.Request.URL.Path
		method := c.Request.Method

		log.Printf("[%s] --> %s %s", requestID, method, path)

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()

		log.Printf("[%s] <-- %s %s %d %v", requestID, method, path, status, latency)
	}
}
