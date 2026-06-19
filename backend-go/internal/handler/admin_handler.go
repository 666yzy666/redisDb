package handler

import (
	"github.com/gin-gonic/gin"

	"miniapp/internal/httpx"
)

// AdminHandler 后台接口(P2 先有 ping,P3/P4 续加用户/订单)
type AdminHandler struct{}

func NewAdminHandler() *AdminHandler { return &AdminHandler{} }

func (h *AdminHandler) Ping(c *gin.Context) {
	httpx.SuccessMsg(c, gin.H{"admin": true, "userId": c.GetInt64("userId")}, "pong")
}
