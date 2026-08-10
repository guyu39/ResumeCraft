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

// ListHomeNewJobs 首页最近新增岗位：优先读取 Redis 最近新增列表（最多 10 条）；
// Redis 未启用或列表为空时回退到 days/limit 参数按 job_postings 主表查询
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

// ListHomeAihotItems AI HOT 快讯流
// GET /api/home/aihot/items?window=24h|7d&category=&q=&limit=
func (h *Handler) ListHomeAihotItems(c *gin.Context) {
	window := c.DefaultQuery("window", "24h")
	if window != "24h" && window != "7d" {
		window = "24h"
	}
	category := c.Query("category")
	q := c.Query("q")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))

	items, err := h.homeService.ListAihotItems(c.Request.Context(), window, category, q, limit)
	if err != nil {
		log.Printf("[home] ListHomeAihotItems error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "快讯加载失败")
		return
	}
	if items == nil {
		items = []model.AihotItem{}
	}
	response.JSONSuccess(c, gin.H{"items": items})
}

// GetHomeAihotDaily AI HOT 日报（缺省返回最新）
// GET /api/home/aihot/daily?date=2026-08-10
func (h *Handler) GetHomeAihotDaily(c *gin.Context) {
	date := c.Query("date")
	daily, dates, err := h.homeService.GetAihotDaily(c.Request.Context(), date)
	if err != nil {
		log.Printf("[home] GetHomeAihotDaily error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "日报加载失败")
		return
	}
	if daily == nil {
		response.JSONSuccess(c, gin.H{"report": nil, "dates": dates})
		return
	}
	response.JSONSuccess(c, gin.H{"report": daily, "dates": dates})
}

// ListHomeAihotHotTopics AI HOT 热点榜
// GET /api/home/aihot/hot-topics
func (h *Handler) ListHomeAihotHotTopics(c *gin.Context) {
	topics, err := h.homeService.ListAihotHotTopics(c.Request.Context())
	if err != nil {
		log.Printf("[home] ListHomeAihotHotTopics error: %v", err)
		response.JSONError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "热点榜加载失败")
		return
	}
	if topics == nil {
		topics = []model.AihotHotTopic{}
	}
	response.JSONSuccess(c, gin.H{"items": topics})
}

// GetHomeAihotStory AI HOT 热点事件详情
// GET /api/home/aihot/stories/:publicId
func (h *Handler) GetHomeAihotStory(c *gin.Context) {
	publicID := c.Param("publicId")
	story, err := h.homeService.GetAihotStory(c.Request.Context(), publicID)
	if err != nil {
		log.Printf("[home] GetHomeAihotStory error: %v", err)
		response.JSONError(c, http.StatusNotFound, "NOT_FOUND", "事件详情加载失败")
		return
	}
	response.JSONSuccess(c, gin.H{"story": story})
}
