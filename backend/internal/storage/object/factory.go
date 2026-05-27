package object

import "resumecraft-pdf-backend/internal/config"

func NewObjectStorage(cfg config.StorageConfig) ObjectStorage {
	if cfg.Endpoint == "" {
		return &NoopClient{}
	}
	return NewMinioClient(cfg)
}
