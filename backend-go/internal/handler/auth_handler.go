package handler

import (
	"github.com/gin-gonic/gin"

	"miniapp/internal/httpx"
	"miniapp/internal/service"
)

type AuthHandler struct{ auth *service.AuthService }

func NewAuthHandler(auth *service.AuthService) *AuthHandler { return &AuthHandler{auth: auth} }

func (h *AuthHandler) SendCode(c *gin.Context) {
	var body struct {
		Email string `json:"email"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.auth.SendRegisterCode(c.Request.Context(), body.Email)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "验证码已发送")
}

func (h *AuthHandler) Register(c *gin.Context) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.auth.Register(c.Request.Context(), body.Email, body.Password, body.Code)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "注册成功")
}

func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.auth.Login(c.Request.Context(), body.Email, body.Password)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "登录成功")
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var body struct {
		Email string `json:"email"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.auth.SendResetCode(c.Request.Context(), body.Email)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "验证码已发送")
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var body struct {
		Email    string `json:"email"`
		Code     string `json:"code"`
		Password string `json:"password"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.auth.ResetPassword(c.Request.Context(), body.Email, body.Code, body.Password)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "密码已重置")
}
