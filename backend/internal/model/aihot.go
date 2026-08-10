package model

import (
	"encoding/json"
	"time"
)

// ============================================================
// AI HOT (https://aihot.virxact.com) 工作台数据模型
// 数据源：REST API v1（匿名只读）
// ============================================================

// AihotItem AI HOT 快讯条目（/api/v1/items）
type AihotItem struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	OriginalTitle string    `json:"originalTitle,omitempty"`
	Summary       string    `json:"summary"`
	SourceName    string    `json:"sourceName"`
	LinksAihot    string    `json:"linksAihot"`    // 站内阅读页
	LinksOriginal string    `json:"linksOriginal"` // 第三方原文
	Category      string    `json:"category,omitempty"`
	Score         int       `json:"score"`
	PublishedAt   time.Time `json:"publishedAt,omitempty"`
	DiscoveredAt  time.Time `json:"discoveredAt,omitempty"`
}

// AihotDaily AI HOT 日报（/api/v1/dailies/latest、/api/v1/dailies/{date}）
// Raw 为 AI HOT report 完整结构原样透传（含 sections 分组）
type AihotDaily struct {
	ReportDate  string          `json:"reportDate"` // YYYY-MM-DD
	Raw         json.RawMessage `json:"report"`     // AI HOT report 原样
	LinksAihot  string          `json:"linksAihot,omitempty"`
	GeneratedAt time.Time       `json:"generatedAt,omitempty"`
	UpdatedAt   time.Time       `json:"updatedAt,omitempty"`
}

// AihotHotTopic 热点榜条目（/api/v1/hot-topics）
type AihotHotTopic struct {
	Rank          int       `json:"rank"`
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	SourceName    string    `json:"sourceName,omitempty"`
	LinksAihot    string    `json:"linksAihot,omitempty"`
	LinksOriginal string    `json:"linksOriginal,omitempty"`
	LinksStory    string    `json:"linksStory,omitempty"` // https://aihot.virxact.com/story/{uuid}
	SourceCount   int       `json:"sourceCount"`
	SignalCount   int       `json:"signalCount"`
	LatestAt      time.Time `json:"latestAt,omitempty"`
}

// AihotStoryReport 事件时间线中的单条报道（/api/v1/stories/{publicId}）
type AihotStoryReport struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Summary       string    `json:"summary,omitempty"`
	SourceName    string    `json:"sourceName,omitempty"`
	PublishedAt   time.Time `json:"publishedAt,omitempty"`
	LinksAihot    string    `json:"linksAihot,omitempty"`
	LinksOriginal string    `json:"linksOriginal,omitempty"`
}

// AihotStory 热点事件详情（时间线 + AI 综述）
type AihotStory struct {
	PublicID    string             `json:"publicId"`
	Title       string             `json:"title"`
	Status      string             `json:"status,omitempty"`
	SourceCount int                `json:"sourceCount,omitempty"`
	ReportCount int                `json:"reportCount,omitempty"`
	Latest      string             `json:"latest,omitempty"`
	Digest      string             `json:"digest,omitempty"`
	LinksAihot  string             `json:"linksAihot,omitempty"`
	Reports     []AihotStoryReport `json:"reports,omitempty"`
	FetchedAt   time.Time          `json:"fetchedAt,omitempty"`
}
