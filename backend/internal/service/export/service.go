package export

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log"
	"sync"

	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/pdf"
	"resumecraft-pdf-backend/internal/service/resume"
	exportStorage "resumecraft-pdf-backend/internal/storage/export"
	"resumecraft-pdf-backend/internal/storage/object"
)

var (
	ErrTaskNotFound      = errors.New("export task not found")
	ErrUnsupportedFormat = errors.New("unsupported export format")
)

type Service interface {
	CreateTask(ctx context.Context, userID, resumeID string, req model.CreateExportRequest) (*model.ExportTask, error)
	GetTask(ctx context.Context, taskID string) (*model.ExportTask, error)
	GetRepo() exportStorage.Repository
}

type service struct {
	exportRepo      exportStorage.Repository
	resumeSvc       resume.Service
	pdfService      pdf.Service
	rendererFactory *RendererFactory
	objectStorage   object.ObjectStorage
	taskQueue       chan string
	wg              sync.WaitGroup
	stopCh          chan struct{}
}

func NewService(exportRepo exportStorage.Repository, resumeSvc resume.Service, pdfService pdf.Service, concurrency int, objectStorage object.ObjectStorage) Service {
	svc := &service{
		exportRepo:      exportRepo,
		resumeSvc:       resumeSvc,
		pdfService:      pdfService,
		rendererFactory: NewRendererFactory(pdfService),
		objectStorage:   objectStorage,
		taskQueue:       make(chan string, 100),
		stopCh:          make(chan struct{}),
	}
	if objectStorage == nil {
		svc.objectStorage = &object.NoopClient{}
	}

	for i := 0; i < concurrency; i++ {
		svc.wg.Add(1)
		go svc.worker(i)
	}

	return svc
}

func (s *service) worker(id int) {
	defer s.wg.Done()
	for {
		select {
		case taskID := <-s.taskQueue:
			s.processTask(taskID)
		case <-s.stopCh:
			return
		}
	}
}

func (s *service) processTask(taskID string) {
	ctx := context.Background()

	task, err := s.exportRepo.GetByID(ctx, taskID)
	if err != nil {
		log.Printf("[export] worker: get task %s failed: %v", taskID, err)
		return
	}

	s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 10)

	resumeDetail, err := s.resumeSvc.GetByID(ctx, task.UserID, task.ResumeID)
	if err != nil {
		s.exportRepo.UpdateFailed(ctx, taskID, "RESUME_NOT_FOUND", "简历不存在或无权限访问")
		return
	}

	s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 30)

	var fileBytes []byte
	var contentType string

	switch task.Format {
	case "pdf":
		html := buildResumeHTML(resumeDetail)
		s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 50)

		pdfBytes, err := s.pdfService.RenderHTML(html)
		if err != nil {
			log.Printf("[export] worker: render pdf failed: %v", err)
			s.exportRepo.UpdateFailed(ctx, taskID, "RENDER_FAILED", "PDF 生成失败")
			return
		}
		fileBytes = pdfBytes
		contentType = "application/pdf"

	default:
		renderer := s.rendererFactory.Get(task.Format)
		if renderer == nil {
			s.exportRepo.UpdateFailed(ctx, taskID, "UNSUPPORTED_FORMAT", fmt.Sprintf("不支持的导出格式: %s", task.Format))
			return
		}
		s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 50)

		rendered, ct, err := renderer.Render(resumeDetail)
		if err != nil {
			log.Printf("[export] worker: render %s failed: %v", task.Format, err)
			s.exportRepo.UpdateFailed(ctx, taskID, "RENDER_FAILED", fmt.Sprintf("%s 生成失败", task.Format))
			return
		}
		fileBytes = rendered
		contentType = ct
	}

	s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 90)

	ext := formatExt(task.Format)
	fileKey := fmt.Sprintf("exports/%s.%s", taskID, ext)
	fileURL, err := s.objectStorage.Upload(ctx, fileKey, bytes.NewReader(fileBytes), int64(len(fileBytes)), contentType)
	if err != nil {
		log.Printf("[export] worker: upload to storage failed: %v, falling back to memory", err)
		if err := s.exportRepo.UpdateSuccess(ctx, taskID, fileBytes); err != nil {
			log.Printf("[export] worker: update success failed: %v", err)
			return
		}
	} else {
		if err := s.exportRepo.UpdateSuccessWithURL(ctx, taskID, fileURL, fileKey); err != nil {
			log.Printf("[export] worker: update success with url failed: %v", err)
			return
		}
	}

	log.Printf("[export] worker: task %s (%s) completed successfully", taskID, task.Format)
}

func (s *service) CreateTask(ctx context.Context, userID, resumeID string, req model.CreateExportRequest) (*model.ExportTask, error) {
	if !s.rendererFactory.Supports(req.Format) {
		return nil, ErrUnsupportedFormat
	}

	_, err := s.resumeSvc.GetByID(ctx, userID, resumeID)
	if err != nil {
		return nil, err
	}

	task, err := s.exportRepo.Create(ctx, userID, resumeID, req.VersionID, req.Format)
	if err != nil {
		return nil, err
	}

	select {
	case s.taskQueue <- task.ID:
	default:
		log.Printf("[export] task queue full, task %s may be delayed", task.ID)
	}

	return exportStorage.TaskToExportTask(task), nil
}

func (s *service) GetTask(ctx context.Context, taskID string) (*model.ExportTask, error) {
	task, err := s.exportRepo.GetByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	return exportStorage.TaskToExportTask(task), nil
}

func (s *service) GetRepo() exportStorage.Repository {
	return s.exportRepo
}

func (s *service) Stop() {
	close(s.stopCh)
	s.wg.Wait()
}

func buildResumeHTML(resume interface{}) string {
	return "<html><body><h1>Resume</h1></body></html>"
}

func formatExt(format string) string {
	switch format {
	case "pdf":
		return "pdf"
	case "markdown":
		return "md"
	case "json":
		return "json"
	case "resume":
		return "json"
	default:
		return format
	}
}
