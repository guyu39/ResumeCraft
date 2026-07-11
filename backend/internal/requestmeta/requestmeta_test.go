package requestmeta

import (
	"context"
	"testing"
)

func TestWithActorPreservesRequestMetadata(t *testing.T) {
	ctx := With(context.Background(), Metadata{
		RequestID: "req_123",
		Method:    "POST",
		Path:      "/api/resumes",
		IP:        "127.0.0.1",
		UserAgent: "test-agent",
	})

	metadata, ok := From(WithActor(ctx, "f6f8b23e-401c-4d1f-b969-3afbcde92e1a"))
	if !ok {
		t.Fatal("metadata missing from context")
	}
	if metadata.ActorUserID != "f6f8b23e-401c-4d1f-b969-3afbcde92e1a" {
		t.Fatalf("actor user ID = %q", metadata.ActorUserID)
	}
	if metadata.RequestID != "req_123" || metadata.Method != "POST" || metadata.Path != "/api/resumes" {
		t.Fatalf("request metadata was not preserved: %#v", metadata)
	}
}
