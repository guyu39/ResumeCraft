package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// CompleteRequest AI 完成请求
type CompleteRequest struct {
	APIKey     string
	BaseURL    string
	Model      string
	Prompt     string
	TimeoutMs  int
	Stream     bool
	OnProgress func(text string)
}

// CompleteResponse AI 完成响应
type CompleteResponse struct {
	Text            string
	ReasoningText   string
	InputTokens     int
	OutputTokens    int
}

// AIProvider AI 服务调用接口
type AIProvider interface {
	Complete(ctx context.Context, req CompleteRequest) (*CompleteResponse, error)
	StreamComplete(ctx context.Context, req CompleteRequest) (*CompleteResponse, error)
}

// openAIProvider OpenAI 兼容 provider
type openAIProvider struct{}

func newAIProvider(cfg interface{}) AIProvider {
	return &openAIProvider{}
}

// Complete 调用 OpenAI 兼容 API
func (p *openAIProvider) Complete(ctx context.Context, req CompleteRequest) (*CompleteResponse, error) {
	timeout := time.Duration(req.TimeoutMs) * time.Millisecond
	if timeout == 0 {
		timeout = 60 * time.Second
	}

	baseURL := req.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}

	var url string
	var body map[string]interface{}

	// 判断使用哪个端点
	if contains(baseURL, "deepseek") {
		// DeepSeek 使用 chat/completions
		url = baseURL + "/v1/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
		}
	} else if contains(baseURL, "zhipu") || contains(baseURL, "智谱") {
		// 智谱使用 chat/completions
		url = baseURL + "/v1/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
		}
	} else if contains(baseURL, "qwen") || contains(baseURL, "dashscope") {
		// 通义千问使用 chat/completions
		url = baseURL + "/v1/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
		}
	} else if contains(baseURL, "siliconflow") {
		// 硅基流动使用 chat/completions
		url = baseURL + "/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
		}
	} else {
		// 默认使用 responses API (OpenAI)
		if contains(baseURL, "/v1") || contains(baseURL, "/v3") {
			url = baseURL + "/responses"
		} else {
			url = baseURL + "/v1/responses"
		}
		body = map[string]interface{}{
			"model": req.Model,
			"input": map[string]string{"role": "user", "content": req.Prompt},
		}
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// 解析响应
	var result CompleteResponse

	// 尝试解析 chat completions 格式
	var chatResp struct {
		Choices []struct {
			Message struct {
				Content         string `json:"content"`
				ReasoningContent string `json:"reasoning_content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &chatResp); err == nil && len(chatResp.Choices) > 0 {
		result.Text = chatResp.Choices[0].Message.Content
		result.ReasoningText = chatResp.Choices[0].Message.ReasoningContent
		result.InputTokens = chatResp.Usage.PromptTokens
		result.OutputTokens = chatResp.Usage.CompletionTokens
		return &result, nil
	}

	// 尝试解析 responses 格式
	var responsesResp struct {
		OutputText string `json:"output_text"`
		Usage      struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}

	if err := json.Unmarshal(respBody, &responsesResp); err == nil && responsesResp.OutputText != "" {
		result.Text = responsesResp.OutputText
		result.InputTokens = responsesResp.Usage.InputTokens
		result.OutputTokens = responsesResp.Usage.OutputTokens
		return &result, nil
	}

	return nil, fmt.Errorf("failed to parse AI response")
}

// StreamComplete 流式调用 OpenAI 兼容 API
func (p *openAIProvider) StreamComplete(ctx context.Context, req CompleteRequest) (*CompleteResponse, error) {
	timeout := time.Duration(req.TimeoutMs) * time.Millisecond
	if timeout == 0 {
		timeout = 60 * time.Second
	}

	baseURL := req.BaseURL
	if baseURL == "" {
		baseURL = "https://api.openai.com"
	}

	var url string
	var body map[string]interface{}

	// 判断使用哪个端点
	if contains(baseURL, "deepseek") {
		url = baseURL + "/v1/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
			"stream":   true,
		}
	} else if contains(baseURL, "zhipu") || contains(baseURL, "智谱") {
		url = baseURL + "/v1/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
			"stream":   true,
		}
	} else if contains(baseURL, "qwen") || contains(baseURL, "dashscope") {
		url = baseURL + "/v1/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
			"stream":   true,
		}
	} else if contains(baseURL, "siliconflow") {
		url = baseURL + "/chat/completions"
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
			"stream":   true,
		}
	} else {
		// 默认使用 chat/completions
		if contains(baseURL, "/v1") || contains(baseURL, "/v3") {
			url = baseURL + "/chat/completions"
		} else {
			url = baseURL + "/v1/chat/completions"
		}
		body = map[string]interface{}{
			"model":    req.Model,
			"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
			"stream":   true,
		}
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	// 流式读取响应
	var fullText strings.Builder
	var reasoningText strings.Builder

	// 使用 bufio.Scanner 逐行读取 SSE
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		line := scanner.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// SSE 格式: data: {"choices":[{"delta":{"content":"..."}}]}
		if strings.HasPrefix(line, "data: ") {
			text := strings.TrimPrefix(line, "data: ")
			if text == "[DONE]" {
				break
			}
			// 解析 SSE JSON
			var chunk struct {
				Choices []struct {
					Delta struct {
						Content          string `json:"content"`
						ReasoningContent string `json:"reasoning_content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(text), &chunk); err == nil && len(chunk.Choices) > 0 {
				if chunk.Choices[0].Delta.Content != "" {
					fullText.WriteString(chunk.Choices[0].Delta.Content)
					if req.OnProgress != nil {
						req.OnProgress(chunk.Choices[0].Delta.Content)
					}
				}
				if chunk.Choices[0].Delta.ReasoningContent != "" {
					reasoningText.WriteString(chunk.Choices[0].Delta.ReasoningContent)
				}
			}
			continue
		}

		// NDJSON 格式: {"type":"finish","timestamp":...} - AI API 结束标记
		if strings.HasPrefix(line, "{") {
			var obj map[string]interface{}
			if err := json.Unmarshal([]byte(line), &obj); err == nil {
				if obj["type"] == "finish" {
					break // 检测到 finish，结束流式读取
				}
			}
		}
	}

	return &CompleteResponse{
		Text:          fullText.String(),
		ReasoningText: reasoningText.String(),
	}, nil
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsIgnoreCase(s, substr))
}

func containsIgnoreCase(s, substr string) bool {
	s = toLower(s)
	substr = toLower(substr)
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func toLower(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}
