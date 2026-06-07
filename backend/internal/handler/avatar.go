package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

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

	avatarURL, err := h.objectStorage.Upload(c.Request.Context(), key, bytes.NewReader(data), int64(len(data)), contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "UPLOAD_FAILED", "message": "头像上传失败"})
		return
	}

	if err := h.authService.UpdateAvatar(c.Request.Context(), userID, avatarURL, avatarHash); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "UPDATE_FAILED", "message": "头像保存失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": "OK",
		"data": model.UploadAvatarResponse{AvatarURL: avatarURL},
	})
}

// ServeAvatar 代理访问头像（通过后端生成 MinIO 预签名 URL，避免直接暴露 MinIO 地址导致 403）
// GET /api/avatars/:userID/:filename
func (h *Handler) ServeAvatar(c *gin.Context) {
	userID := c.Param("userID")
	filename := c.Param("filename")
	key := "avatars/" + userID + "/" + filename

	url, err := h.objectStorage.PresignedGetURL(c.Request.Context(), key, 5*time.Minute)
	if err != nil {
		c.String(http.StatusNotFound, "头像不存在")
		return
	}

	c.Redirect(http.StatusTemporaryRedirect, url)
}
