package object

import (
	"context"
	"errors"
	"io"
	"time"
)

var ErrNotConfigured = errors.New("object storage not configured")

type NoopClient struct{}

func (n *NoopClient) Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) (string, error) {
	return "", ErrNotConfigured
}

func (n *NoopClient) Download(ctx context.Context, key string) (io.ReadCloser, int64, string, error) {
	return nil, 0, "", ErrNotConfigured
}

func (n *NoopClient) Delete(ctx context.Context, key string) error {
	return ErrNotConfigured
}

func (n *NoopClient) PresignedGetURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	return "", ErrNotConfigured
}
