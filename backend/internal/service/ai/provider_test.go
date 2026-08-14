package ai

import "testing"

// TestBuildChatCompletionsURL 覆盖 model.DefaultBaseURLs 里各厂商的 baseURL 形态，
// 防止再出现 /v1/v1/chat/completions、//chat/completions 这类拼接回归
func TestBuildChatCompletionsURL(t *testing.T) {
	cases := []struct {
		name    string
		baseURL string
		want    string
	}{
		{"豆包 Ark", "https://ark.cn-beijing.volces.com/api/v3", "https://ark.cn-beijing.volces.com/api/v3/chat/completions"},
		{"Kimi", "https://api.moonshot.cn/v1", "https://api.moonshot.cn/v1/chat/completions"},
		{"MiniMax", "https://api.minimax.chat/v1", "https://api.minimax.chat/v1/chat/completions"},
		{"DeepSeek", "https://api.deepseek.com/v1", "https://api.deepseek.com/v1/chat/completions"},
		{"智谱 GLM", "https://open.bigmodel.cn/api/paas/v4", "https://open.bigmodel.cn/api/paas/v4/chat/completions"},
		{"通义千问", "https://dashscope.aliyuncs.com/compatible-mode/v1", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"},
		{"文心千帆", "https://qianfan.baidubce.com/v2", "https://qianfan.baidubce.com/v2/chat/completions"},
		{"讯飞星火", "https://spark-api-open.xf-yun.com/v1", "https://spark-api-open.xf-yun.com/v1/chat/completions"},
		{"硅基流动", "https://api.siliconflow.cn/v1", "https://api.siliconflow.cn/v1/chat/completions"},
		{"OpenAI", "https://api.openai.com/v1", "https://api.openai.com/v1/chat/completions"},
		{"Gemini 兼容层带尾斜杠", "https://generativelanguage.googleapis.com/v1beta/openai/", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"},
		{"无版本段需补 v1", "https://api.example.com", "https://api.example.com/v1/chat/completions"},
		{"无版本段带尾斜杠", "https://api.example.com/", "https://api.example.com/v1/chat/completions"},
		{"主机名含版本样式不误判", "https://v2.api.example.com", "https://v2.api.example.com/v1/chat/completions"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := buildChatCompletionsURL(c.baseURL); got != c.want {
				t.Errorf("buildChatCompletionsURL(%q)\n got: %s\nwant: %s", c.baseURL, got, c.want)
			}
		})
	}
}
