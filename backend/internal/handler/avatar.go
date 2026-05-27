package handler

import (
	"net/http"
	"path/filepath"
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

	contentType := strings.ToLower(header.Header.Get("Content-Type"))
	ext := filepath.Ext(strings.ToLower(header.Filename))
	if contentType != "image/jpeg" && contentType != "image/png" {
		// 尝试根据扩展名修正
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

	avatarURL, err := h.objectStorage.Upload(c.Request.Context(), key, file, header.Size, contentType)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "UPLOAD_FAILED", "message": "头像上传失败"})
		return
	}

	if err := h.authService.UpdateAvatar(c.Request.Context(), userID, avatarURL); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": "UPDATE_FAILED", "message": "头像保存失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code": "OK",
		"data": model.UploadAvatarResponse{AvatarURL: avatarURL},
	})
}
