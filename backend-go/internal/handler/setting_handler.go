package handler

import (
	"github.com/gin-gonic/gin"

	"miniapp/internal/httpx"
	"miniapp/internal/service"
)

type SettingHandler struct {
	svc   *service.SettingService
	stats *service.StatsService
}

func NewSettingHandler(svc *service.SettingService, stats *service.StatsService) *SettingHandler {
	return &SettingHandler{svc: svc, stats: stats}
}

// GetPublic GET /settings/public(公开)
func (h *SettingHandler) GetPublic(c *gin.Context) {
	res, err := h.svc.GetPublic()
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

// AdminGet GET /admin/settings
func (h *SettingHandler) AdminGet(c *gin.Context) {
	res, err := h.svc.GetAllForAdmin()
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

// AdminUpdate PUT /admin/settings
func (h *SettingHandler) AdminUpdate(c *gin.Context) {
	var body map[string]any
	_ = c.ShouldBindJSON(&body)
	res, err := h.svc.UpdateMany(body)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "设置已保存")
}

// Stats GET /admin/stats
func (h *SettingHandler) Stats(c *gin.Context) {
	res, err := h.stats.GetStats()
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}
