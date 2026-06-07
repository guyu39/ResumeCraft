package object

import (
	"context"
	"io"
	"time"
)

// ObjectStorage 对象存储抽象接口，S3 兼容
type ObjectStorage interface {
	Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) (url string, err error)
	Download(ctx context.Context, key string) (reader io.ReadCloser, size int64, contentType string, err error)
	Delete(ctx context.Context, key string) error
	PresignedGetURL(ctx context.Context, key string, expiry time.Duration) (string, error)
}
