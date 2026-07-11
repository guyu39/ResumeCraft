package requestmeta

import "context"

type Metadata struct {
	RequestID   string
	ActorUserID string
	Method      string
	Path        string
	IP          string
	UserAgent   string
}

type contextKey struct{}

func With(ctx context.Context, metadata Metadata) context.Context {
	return context.WithValue(ctx, contextKey{}, metadata)
}

func From(ctx context.Context) (Metadata, bool) {
	metadata, ok := ctx.Value(contextKey{}).(Metadata)
	return metadata, ok
}

func WithActor(ctx context.Context, actorUserID string) context.Context {
	metadata, _ := From(ctx)
	metadata.ActorUserID = actorUserID
	return With(ctx, metadata)
}
