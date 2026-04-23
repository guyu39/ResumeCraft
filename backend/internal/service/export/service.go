package export

import (
	"context"
	"errors"
	"log"
	"sync"

	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/internal/service/pdf"
	"resumecraft-pdf-backend/internal/service/resume"
	exportStorage "resumecraft-pdf-backend/internal/storage/export"
)

var (
	ErrTaskNotFound = errors.New("export task not found")
)

type Service interface {
	CreateTask(ctx context.Context, userID, resumeID string, req model.CreateExportRequest) (*model.ExportTask, error)
	GetTask(ctx context.Context, taskID string) (*model.ExportTask, error)
}

type service struct {
	exportRepo  exportStorage.Repository
	resumeSvc   resume.Service
	pdfService  pdf.Service
	taskQueue   chan string
	wg          sync.WaitGroup
	stopCh      chan struct{}
}

func NewService(exportRepo exportStorage.Repository, resumeSvc resume.Service, pdfService pdf.Service, concurrency int) Service {
	svc := &service{
		exportRepo: exportRepo,
		resumeSvc:  resumeSvc,
		pdfService: pdfService,
		taskQueue:  make(chan string, 100),
		stopCh:    make(chan struct{}),
	}

	// 启动 worker 池
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

	// 更新为处理中
	s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 10)

	// 获取简历内容
	resumeDetail, err := s.resumeSvc.GetByID(ctx, task.ResumeID, task.ResumeID)
	if err != nil {
		s.exportRepo.UpdateFailed(ctx, taskID, "RESUME_NOT_FOUND", "简历不存在或无权限访问")
		return
	}

	s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 30)

	// 生成 HTML（简化版本，实际需要完整渲染）
	html := buildResumeHTML(resumeDetail)
	s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 50)

	// 调用 PDF 服务生成
	pdfBytes, err := s.pdfService.RenderHTML(html)
	if err != nil {
		log.Printf("[export] worker: render pdf failed: %v", err)
		s.exportRepo.UpdateFailed(ctx, taskID, "RENDER_FAILED", "PDF 生成失败")
		return
	}

	s.exportRepo.UpdateStatus(ctx, taskID, model.ExportStatusProcessing, 90)

	// 保存成功
	if err := s.exportRepo.UpdateSuccess(ctx, taskID, pdfBytes); err != nil {
		log.Printf("[export] worker: update success failed: %v", err)
		return
	}

	log.Printf("[export] worker: task %s completed successfully", taskID)
}

func (s *service) CreateTask(ctx context.Context, userID, resumeID string, req model.CreateExportRequest) (*model.ExportTask, error) {
	// 验证简历归属
	_, err := s.resumeSvc.GetByID(ctx, userID, resumeID)
	if err != nil {
		return nil, err
	}

	task, err := s.exportRepo.Create(ctx, resumeID, req.VersionID)
	if err != nil {
		return nil, err
	}

	// 加入处理队列
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

func (s *service) Stop() {
	close(s.stopCh)
	s.wg.Wait()
}

// buildResumeHTML 简化版 HTML 生成，实际应该使用 SSR 模块
func buildResumeHTML(resume interface{}) string {
	// TODO: 使用现有的 SSR 模块生成完整 HTML
	return "<html><body><h1>Resume</h1></body></html>"
}