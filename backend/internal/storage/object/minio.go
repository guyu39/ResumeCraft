package object

import (
	"context"
	"fmt"
	"io"
	"log"
	"time"

	"resumecraft-pdf-backend/internal/config"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinioClient struct {
	client   *minio.Client
	endpoint string
	bucket   string
}

func NewMinioClient(cfg config.StorageConfig) *MinioClient {
	client, err := minio.New(cfg.Endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: cfg.UseSSL,
	})
	if err != nil {
		log.Printf("[storage] minio: create client failed: %v", err)
		return nil
	}

	mc := &MinioClient{
		client:   client,
		endpoint: cfg.Endpoint,
		bucket:   cfg.Bucket,
	}

	if err := mc.ensureBucket(context.Background()); err != nil {
		log.Printf("[storage] minio: ensure bucket failed: %v", err)
		return nil
	}

	log.Printf("[storage] minio: connected to %s, bucket=%s", cfg.Endpoint, cfg.Bucket)
	return mc
}

func (m *MinioClient) Upload(ctx context.Context, key string, reader io.Reader, size int64, contentType string) (string, error) {
	opts := minio.PutObjectOptions{
		ContentType: contentType,
	}
	_, err := m.client.PutObject(ctx, m.bucket, key, reader, size, opts)
	if err != nil {
		return "", fmt.Errorf("upload: %w", err)
	}

	scheme := "http"
	return fmt.Sprintf("%s://%s/%s/%s", scheme, m.endpoint, m.bucket, key), nil
}

func (m *MinioClient) Delete(ctx context.Context, key string) error {
	return m.client.RemoveObject(ctx, m.bucket, key, minio.RemoveObjectOptions{})
}

func (m *MinioClient) PresignedGetURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	u, err := m.client.PresignedGetObject(ctx, m.bucket, key, expiry, nil)
	if err != nil {
		return "", fmt.Errorf("presigned url: %w", err)
	}
	return u.String(), nil
}

func (m *MinioClient) ensureBucket(ctx context.Context) error {
	exists, err := m.client.BucketExists(ctx, m.bucket)
	if err != nil {
		return fmt.Errorf("check bucket: %w", err)
	}

	if !exists {
		if err := m.client.MakeBucket(ctx, m.bucket, minio.MakeBucketOptions{}); err != nil {
			return fmt.Errorf("create bucket: %w", err)
		}
	}

	// 设置 bucket 为 public-read
	policy := fmt.Sprintf(`{
		"Version": "2012-10-17",
		"Statement": [{
			"Effect": "Allow",
			"Principal": {"AWS": ["*"]},
			"Action": ["s3:GetObject"],
			"Resource": ["arn:aws:s3:::%s/*"]
		}]
	}`, m.bucket)
	if err := m.client.SetBucketPolicy(ctx, m.bucket, policy); err != nil {
		log.Printf("[storage] minio: set bucket policy failed: %v", err)
	}

	return nil
}
