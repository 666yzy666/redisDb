package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"miniapp/internal/httpx"
	"miniapp/internal/service"
)

type AdminHandler struct{ admin *service.AdminService }

func NewAdminHandler(admin *service.AdminService) *AdminHandler { return &AdminHandler{admin: admin} }

func (h *AdminHandler) Ping(c *gin.Context) {
	httpx.SuccessMsg(c, gin.H{"admin": true, "userId": c.GetInt64("userId")}, "pong")
}

func (h *AdminHandler) ListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("pageSize"))
	res, err := h.admin.ListUsers(page, pageSize, c.Query("email"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

func (h *AdminHandler) SetRole(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Role string `json:"role"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.admin.SetRole(c.GetInt64("userId"), id, body.Role)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "角色已更新")
}

func (h *AdminHandler) SetStatus(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Status string `json:"status"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.admin.SetStatus(c.Request.Context(), c.GetInt64("userId"), id, body.Status)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "状态已更新")
}
