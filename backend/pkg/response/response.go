package response

import "github.com/gin-gonic/gin"

type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func JSONError(c *gin.Context, status int, code, message string) {
	c.JSON(status, ErrorBody{Code: code, Message: message})
}
