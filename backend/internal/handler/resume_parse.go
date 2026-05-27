package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"path/filepath"
	"strings"

	"resumecraft-pdf-backend/internal/middleware"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

const maxResumeFileSize = 10 << 20 // 10MB

var allowedResumeTypes = map[string]bool{
	"application/pdf":                                                      true,
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
}

// ParseResume 解析简历文件
// POST /api/resumes/parse
func (h *Handler) ParseResume(c *gin.Context) {
	userID, ok := c.Get(middleware.ContextUserIDKey)
	if !ok {
		response.JSONError(c, http.StatusUnauthorized, "UNAUTHORIZED", "未登录")
		return
	}

	if h.parserServiceURL == "" {
		response.JSONError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "简历解析服务未配置")
		return
	}

	// 接收文件
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "请选择文件")
		return
	}
	defer file.Close()

	// 校验文件大小
	if header.Size > maxResumeFileSize {
		response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "文件大小不能超过 10MB")
		return
	}

	// 校验文件类型
	contentType := header.Header.Get("Content-Type")
	if !allowedResumeTypes[contentType] {
		// 也通过扩展名判断
		ext := strings.ToLower(filepath.Ext(header.Filename))
		if ext == ".pdf" {
			contentType = "application/pdf"
		} else if ext == ".docx" {
			contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		} else {
			response.JSONError(c, http.StatusBadRequest, "BAD_REQUEST", "仅支持 PDF 和 DOCX 文件")
			return
		}
	}

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "读取文件失败")
		return
	}

	// 获取并解密解析专用 AI 配置
	parserCfg, err := h.aiService.ResolveParserConfig(c.Request.Context(), userID.(string))
	if err != nil {
		response.JSONError(c, http.StatusBadRequest, "CONFIG_NOT_FOUND", "请先在设置中配置简历解析模型")
		return
	}

	// 转发到 Python 解析微服务
	parsed, err := callParserService(h.parserServiceURL, fileBytes, header.Filename, contentType, parserCfg.BaseURL, parserCfg.Model, parserCfg.APIKeyEncrypted)
	if err != nil {
		log.Printf("[parse] Python parser error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "简历解析失败: "+err.Error())
		return
	}

	response.JSONSuccess(c, parsed)
}

func callParserService(serviceURL string, fileBytes []byte, filename, contentType, apiBaseURL, model, apiKey string) (map[string]interface{}, error) {
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// 文件（显式设置 Content-Type，否则 Python 收到 application/octet-stream 会拒绝）
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename="%s"`, filename))
	h.Set("Content-Type", contentType)
	part, err := writer.CreatePart(h)
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	part.Write(fileBytes)

	// 模型参数
	writer.WriteField("api_base_url", apiBaseURL)
	writer.WriteField("model", model)
	writer.WriteField("api_key", apiKey)
	writer.Close()

	req, err := http.NewRequest("POST", serviceURL+"/parse", &buf)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call parser: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB max response
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("parser returned %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse response: %w", err)
	}

	return result, nil
}
