package httpx

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// 统一响应体 {code, message, data},与 Node 版一致

func Success(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": data})
}

func SuccessMsg(c *gin.Context, data any, msg string) {
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": msg, "data": data})
}

// APIError 业务异常:携带 HTTP 状态码与业务 code
type APIError struct {
	Status int
	Code   int
	Msg    string
}

func (e *APIError) Error() string { return e.Msg }

func New(status, code int, msg string) *APIError { return &APIError{Status: status, Code: code, Msg: msg} }

func BadRequest(msg string, code ...int) *APIError  { return New(http.StatusBadRequest, pick(code, 40000), msg) }
func Unauthorized(msg string, code ...int) *APIError { return New(http.StatusUnauthorized, pick(code, 40100), msg) }
func Forbidden(msg string, code ...int) *APIError    { return New(http.StatusForbidden, pick(code, 40300), msg) }
func NotFound(msg string, code ...int) *APIError     { return New(http.StatusNotFound, pick(code, 40400), msg) }

func pick(code []int, def int) int {
	if len(code) > 0 {
		return code[0]
	}
	return def
}

// Fail 把 error 转成统一错误响应;非 APIError 一律 500
func Fail(c *gin.Context, err error) {
	var ae *APIError
	if errors.As(err, &ae) {
		c.JSON(ae.Status, gin.H{"code": ae.Code, "message": ae.Msg, "data": nil})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"code": 50000, "message": "服务器内部错误", "data": nil})
}
