package export

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"resumecraft-pdf-backend/internal/model"

	"github.com/google/uuid"
)

var (
	ErrTaskNotFound = errors.New("export task not found")
)

// Task 导出任务
type Task struct {
	ID          string
	ResumeID    string
	VersionID   string
	Status      model.ExportStatus
	Progress    int
	ErrorCode   string
	ErrorMsg    string
	FileData    []byte
	CreatedAt   time.Time
	FinishedAt  *time.Time
	ExpiresAt   *time.Time
}

type Repository interface {
	Create(ctx context.Context, resumeID, versionID string) (*Task, error)
	GetByID(ctx context.Context, taskID string) (*Task, error)
	UpdateStatus(ctx context.Context, taskID string, status model.ExportStatus, progress int) error
	UpdateSuccess(ctx context.Context, taskID string, fileData []byte) error
	UpdateFailed(ctx context.Context, taskID string, errorCode, errorMsg string) error
	Delete(ctx context.Context, taskID string) error
}

type inMemoryRepository struct {
	mu    sync.RWMutex
	tasks map[string]*Task
}

func NewInMemoryRepository() Repository {
	return &inMemoryRepository{
		tasks: make(map[string]*Task),
	}
}

func (r *inMemoryRepository) Create(ctx context.Context, resumeID, versionID string) (*Task, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	taskID := "exp_" + uuid.New().String()[:12]
	now := time.Now()
	task := &Task{
		ID:        taskID,
		ResumeID:  resumeID,
		VersionID: versionID,
		Status:    model.ExportStatusQueued,
		Progress:  0,
		CreatedAt: now,
	}
	r.tasks[taskID] = task

	return task, nil
}

func (r *inMemoryRepository) GetByID(ctx context.Context, taskID string) (*Task, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	task, ok := r.tasks[taskID]
	if !ok {
		return nil, ErrTaskNotFound
	}
	return task, nil
}

func (r *inMemoryRepository) UpdateStatus(ctx context.Context, taskID string, status model.ExportStatus, progress int) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	task, ok := r.tasks[taskID]
	if !ok {
		return ErrTaskNotFound
	}
	task.Status = status
	task.Progress = progress
	return nil
}

func (r *inMemoryRepository) UpdateSuccess(ctx context.Context, taskID string, fileData []byte) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	task, ok := r.tasks[taskID]
	if !ok {
		return ErrTaskNotFound
	}
	now := time.Now()
	task.Status = model.ExportStatusSuccess
	task.Progress = 100
	task.FileData = fileData
	task.FinishedAt = &now
	expiresAt := now.Add(24 * time.Hour)
	task.ExpiresAt = &expiresAt
	return nil
}

func (r *inMemoryRepository) UpdateFailed(ctx context.Context, taskID string, errorCode, errorMsg string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	task, ok := r.tasks[taskID]
	if !ok {
		return ErrTaskNotFound
	}
	now := time.Now()
	task.Status = model.ExportStatusFailed
	task.ErrorCode = errorCode
	task.ErrorMsg = errorMsg
	task.FinishedAt = &now
	return nil
}

func (r *inMemoryRepository) Delete(ctx context.Context, taskID string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.tasks[taskID]; !ok {
		return ErrTaskNotFound
	}
	delete(r.tasks, taskID)
	return nil
}

func TaskToExportTask(t *Task) *model.ExportTask {
	et := &model.ExportTask{
		TaskID:     t.ID,
		Status:     t.Status,
		Progress:   t.Progress,
		CreatedAt:  t.CreatedAt.UnixMilli(),
	}
	if t.ErrorCode != "" {
		et.ErrorCode = t.ErrorCode
	}
	if t.ErrorMsg != "" {
		et.ErrorMessage = t.ErrorMsg
	}
	if t.ExpiresAt != nil {
		et.ExpiresAt = t.ExpiresAt.UnixMilli()
	}
	if t.FinishedAt != nil {
		et.FinishedAt = t.FinishedAt.UnixMilli()
	}
	if t.Status == model.ExportStatusSuccess {
		et.DownloadURL = fmt.Sprintf("/api/exports/%s/download", t.ID)
	}
	return et
}