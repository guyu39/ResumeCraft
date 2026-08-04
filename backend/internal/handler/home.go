package handler

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"resumecraft-pdf-backend/internal/model"
	"resumecraft-pdf-backend/pkg/response"

	"github.com/gin-gonic/gin"
)

// ListHomeTodos 首页待办：聚合投递的笔试与面试时间
// GET /api/home/todos
func (h *Handler) ListHomeTodos(c *gin.Context) {
	userID, ok := getUserID(c)
	if !ok {
		return
	}
	items, err := h.homeService.ListTodos(c.Request.Context(), userID)
	if err != nil {
		log.Printf("[home] ListHomeTodos error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "待办加载失败")
		return
	}
	if items == nil {
		items = []model.TodoItem{}
	}
	response.JSONSuccess(c, gin.H{"items": items})
}

// ListHomeNews AI 新闻速递
// GET /api/home/news?days=30&limit=50
func (h *Handler) ListHomeNews(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	items, err := h.homeService.ListNews(c.Request.Context(), days, limit)
	if err != nil {
		log.Printf("[home] ListHomeNews error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "新闻加载失败")
		return
	}
	if items == nil {
		items = []model.AiNewsItem{}
	}
	response.JSONSuccess(c, gin.H{"items": items})
}

// ListHomeGithubProjects GitHub 最新开源项目
// GET /api/home/github-projects?days=7
func (h *Handler) ListHomeGithubProjects(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	groups, err := h.homeService.ListGithubProjects(c.Request.Context(), days)
	if err != nil {
		log.Printf("[home] ListHomeGithubProjects error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "项目加载失败")
		return
	}
	if groups == nil {
		groups = []model.GithubGroup{}
	}
	response.JSONSuccess(c, gin.H{"groups": groups})
}

// GetHomeDailyReports 近 7 天 AI 日报（按日期倒序）
// GET /api/home/daily-report?days=7
func (h *Handler) GetHomeDailyReports(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	reports, err := h.homeService.GetDailyReports(c.Request.Context(), days)
	if err != nil {
		log.Printf("[home] GetHomeDailyReports error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "日报加载失败")
		return
	}
	if reports == nil {
		reports = []model.AiDailyReport{}
	}
	response.JSONSuccess(c, gin.H{"reports": reports})
}

// GenerateHomeDailyReport 手动触发生成当日日报与项目推荐（AI 或规则回退）
// POST /api/home/daily-report/generate
func (h *Handler) GenerateHomeDailyReport(c *gin.Context) {
	report, err := h.homeService.GenerateDailyReport(c.Request.Context())
	if err != nil {
		log.Printf("[home] GenerateHomeDailyReport error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "日报生成失败: "+err.Error())
		return
	}
	response.JSONSuccess(c, gin.H{"report": report, "updatedAt": time.Now().UnixMilli()})
}

// ListHomeProjects 简历项目推荐（按更新时间日期分组倒序）
// GET /api/home/projects?days=7
func (h *Handler) ListHomeProjects(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	groups, err := h.homeService.ListProjects(c.Request.Context(), days)
	if err != nil {
		log.Printf("[home] ListHomeProjects error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "项目推荐加载失败")
		return
	}
	if groups == nil {
		groups = []model.ProjectGroup{}
	}
	response.JSONSuccess(c, gin.H{"groups": groups})
}

// ListHomeNewJobs 最近新增岗位（今日+昨日）
// GET /api/home/new-jobs?days=2&limit=20
func (h *Handler) ListHomeNewJobs(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	items, err := h.homeService.ListNewJobs(c.Request.Context(), days, limit)
	if err != nil {
		log.Printf("[home] ListHomeNewJobs error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "新岗位加载失败")
		return
	}
	if items == nil {
		items = []model.NewJobItem{}
	}
	response.JSONSuccess(c, gin.H{"items": items})
}
