package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"resumecraft-pdf-backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const maxAvatarSize = 5 << 20 // 5MB

func (h *Handler) UploadAvatar(c *gin.Context) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"code": "UNAUTHORIZED", "message": "未登录"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "BAD_REQUEST", "message": "请选择文件"})
		return
	}
	defer file.Close()

	if header.Size > maxAvatarSize {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FILE_TOO_LARGE", "message": "文件大小不能超过 5MB"})
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, maxAvatarSize+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": "BAD_REQUEST", "message": "读取文件失败"})
		return
	}
	if int64(len(data)) > maxAvatarSize {
		c.JSON(http.StatusBadRequest, gin.H{"code": "FILE_TOO_LARGE", "message": "文件大小不能超过 5MB"})
		return
	}

	hashBytes := sha256.Sum256(data)
	avatarHash := hex.EncodeToString(hashBytes[:])
	existingURL, existingHash, err := h.authService.GetAvatarMeta(c.Request.Context(), userID)
	if err == nil {
		// 已有头像且哈希相同 → 直接返回已有 URL，避免重复上传
		if existingHash != "" && existingHash == avatarHash && existingURL != "" {
			c.JSON(http.StatusOK, gin.H{
				"code": "OK",
				"data": model.UploadAvatarResponse{AvatarURL: existingURL},
			})
			return
		}
	}
	// err != nil 是正常情况（新用户首次上传，尚无头像记录），继续执行上传逻辑
	// 如果是真正的数据库错误，后续 Upload/UpdateAvatar 也会报错

	contentType := strings.ToLower(header.Header.Get("Content-Type"))
	ext := filepath.Ext(strings.ToLower(header.Filename))
	if contentType != "image/jpeg" && contentType != "image/png" {
		switch ext {
		case ".jpg", ".jpeg":
			contentType = "image/jpeg"
		case ".png":
			contentType = "image/png"
		default:
			c.JSON(http.StatusBadRequest, gin.H{"code": "INVALID_FILE_TYPE", "message": "仅支持 JPG 和 PNG 格式"})
			return
		}
	}
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" {
		ext = ".jpg"
	}

	key := "avatars/" + userID + "/" + uuid.New().String() + ext
	filename := key[strings.LastIndex(key, "/")+1:] // 提取 UUID.ext 部分

	avatarURL, err := h.objectStorage.Upload(c.Request.Context(), key, bytes.NewReader(data), int64(len(data)), contentType)
	if err != nil {
		log.Printf("[avatar] upload to storage failed for user %s: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"code": "UPLOAD_FAILED", "message": "头像上传失败"})
		return
	}

	if err := h.authService.UpdateAvatar(c.Request.Context(), userID, avatarURL, avatarHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "UPDATE_FAILED", "message": "头像保存失败"})
		return
	}

	// 返回 API 代理路径而非原始 MinIO URL，确保前端渲染时头像 URL 始终可达
	// （MinIO 容器内地址 minio:9000 在浏览器端不可解析）
	proxyURL := "/api/avatars/" + userID + "/" + filename

	c.JSON(http.StatusOK, gin.H{
		"code": "OK",
		"data": model.UploadAvatarResponse{AvatarURL: proxyURL},
	})
}

// ServeAvatar 流式代理头像，避免 302 重定向导致的跨域问题
// 之前使用 302 重定向到 MinIO 预签名 URL，导致：
//  1. 浏览器端 Canvas 被跨域图片污染，toDataURL() 抛出 SecurityError
//  2. PDF 导出时 Chromium 加载 302 链接触发 InsecureLocalNetwork 拦截
//
// 改为后端直接从 MinIO 读取数据返回，使图片真正同源。
// GET /api/avatars/:userID/:filename
func (h *Handler) ServeAvatar(c *gin.Context) {
	userID := c.Param("userID")
	filename := c.Param("filename")
	key := "avatars/" + userID + "/" + filename

	reader, size, contentType, err := h.objectStorage.Download(c.Request.Context(), key)
	if err != nil {
		c.String(http.StatusNotFound, "头像不存在")
		return
	}
	defer reader.Close()

	if contentType != "" {
		c.Header("Content-Type", contentType)
	}
	c.Header("Content-Length", strconv.FormatInt(size, 10))
	c.Header("Cache-Control", "public, max-age=3600")
	c.Status(http.StatusOK)
	io.Copy(c.Writer, reader)
}
