package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	MaxTokens  int
	OnProgress func(text string)
}

// CompleteResponse AI 完成响应
type CompleteResponse struct {
	Text          string
	ReasoningText string
	InputTokens   int
	OutputTokens  int
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

// buildChatCompletionsURL 拼接 OpenAI 兼容的 chat/completions 端点。
// 各厂商预置 baseURL 的版本段形态差异很大（/v1、/v2、/api/v3、/api/paas/v4、
// /compatible-mode/v1、/v1beta/openai），此前按厂商名硬编码补 "/v1" 会拼出
// /v1/v1/chat/completions 这类 404 路径，故统一按「路径里是否已含版本段」决定是否补 /v1。
func buildChatCompletionsURL(baseURL string) string {
	trimmed := strings.TrimRight(baseURL, "/")
	if hasVersionSegment(trimmed) {
		return trimmed + "/chat/completions"
	}
	return trimmed + "/v1/chat/completions"
}

// hasVersionSegment 判断 URL 路径中是否已存在 v1 / v2 / v4.0 / v1beta 之类的版本段。
// 只扫描 path，避免把形如 v2.example.com 的主机名误判为版本段。
func hasVersionSegment(rawURL string) bool {
	path := rawURL
	if u, err := url.Parse(rawURL); err == nil && u.Host != "" {
		path = u.Path
	}
	for _, seg := range strings.Split(path, "/") {
		if len(seg) >= 2 && seg[0] == 'v' && seg[1] >= '0' && seg[1] <= '9' {
			return true
		}
	}
	return false
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

	// 统一走 OpenAI 兼容的 chat/completions：Responses API 仅 OpenAI 官方支持，
	// 且原先传的 input 是单个对象而非字符串/数组，本身不符合规范
	endpoint := buildChatCompletionsURL(baseURL)
	body := map[string]interface{}{
		"model":    req.Model,
		"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
	}
	if req.MaxTokens > 0 {
		body["max_tokens"] = req.MaxTokens
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(bodyBytes))
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
				Content          string `json:"content"`
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

	endpoint := buildChatCompletionsURL(baseURL)
	body := map[string]interface{}{
		"model":    req.Model,
		"messages": []map[string]string{{"role": "user", "content": req.Prompt}},
		"stream":   true,
	}

	// 注入 max_tokens（如果调用方指定）
	if req.MaxTokens > 0 {
		body["max_tokens"] = req.MaxTokens
	}
	// 请求流式 usage：OpenAI 兼容接口在流末尾追加一个含 usage 的 chunk
	body["stream_options"] = map[string]interface{}{"include_usage": true}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(bodyBytes))
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
	var inputTokens, outputTokens int

	// 使用 bufio.Scanner 逐行读取 SSE
	scanner := bufio.NewScanner(resp.Body)
	// 提升单行上限：含 usage 的尾 chunk 或长 delta 行可能超过默认 64KB
	scanner.Buffer(make([]byte, 0, 64*1024), 1<<20)
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

		// SSE 格式: data: {"choices":[{"delta":{"content":"..."}}], "usage":{...}}
		if strings.HasPrefix(line, "data: ") {
			text := strings.TrimPrefix(line, "data: ")
			if text == "[DONE]" {
				break
			}
			// 解析 SSE JSON（含末尾 usage chunk）
			var chunk struct {
				Choices []struct {
					Delta struct {
						Content          string `json:"content"`
						ReasoningContent string `json:"reasoning_content"`
					} `json:"delta"`
				} `json:"choices"`
				Usage *struct {
					PromptTokens     int `json:"prompt_tokens"`
					CompletionTokens int `json:"completion_tokens"`
				} `json:"usage"`
			}
			if err := json.Unmarshal([]byte(text), &chunk); err == nil {
				if len(chunk.Choices) > 0 {
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
				// usage 通常在 choices 为空的最后一个 chunk
				if chunk.Usage != nil {
					inputTokens = chunk.Usage.PromptTokens
					outputTokens = chunk.Usage.CompletionTokens
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
		InputTokens:   inputTokens,
		OutputTokens:  outputTokens,
	}, nil
}
