package model

import (
	"encoding/json"
	"testing"
)

func TestUpdateResumeRequestIncludesResumeMetadata(t *testing.T) {
	var req UpdateResumeRequest
	if err := json.Unmarshal([]byte(`{"title":"测试简历","locale":"zh-CN","template":"classic","version":3}`), &req); err != nil {
		t.Fatalf("unmarshal update request: %v", err)
	}

	if req.Locale != "zh-CN" || req.Template != "classic" {
		t.Fatalf("metadata = (%q, %q), want (zh-CN, classic)", req.Locale, req.Template)
	}
	if req.Version == nil || *req.Version != 3 {
		t.Fatalf("version = %v, want 3", req.Version)
	}
}
