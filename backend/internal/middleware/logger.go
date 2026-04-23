package middleware

import (
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := uuid.New().String()[:8]
		c.Set("requestID", requestID)

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