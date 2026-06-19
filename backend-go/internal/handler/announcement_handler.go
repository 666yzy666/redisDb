package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"miniapp/internal/httpx"
	"miniapp/internal/service"
)

type AnnouncementHandler struct{ svc *service.AnnouncementService }

func NewAnnouncementHandler(svc *service.AnnouncementService) *AnnouncementHandler {
	return &AnnouncementHandler{svc: svc}
}

// ListForUser GET /announcements(登录用户:已发布)
func (h *AnnouncementHandler) ListForUser(c *gin.Context) {
	res, err := h.svc.ListForUser()
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

// AdminList GET /admin/announcements
func (h *AnnouncementHandler) AdminList(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	pageSize, _ := strconv.Atoi(c.Query("pageSize"))
	res, err := h.svc.ListForAdmin(page, pageSize)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

// AdminCreate POST /admin/announcements
func (h *AnnouncementHandler) AdminCreate(c *gin.Context) {
	var body struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.svc.Create(body.Title, body.Content)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "已创建")
}

// AdminUpdate PUT /admin/announcements/:id
func (h *AnnouncementHandler) AdminUpdate(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.svc.Update(id, body.Title, body.Content)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "已更新")
}

// AdminSetPublished PATCH /admin/announcements/:id/publish
func (h *AnnouncementHandler) AdminSetPublished(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var body struct {
		Published bool `json:"published"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.svc.SetPublished(id, body.Published)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "已更新发布状态")
}

// AdminRemove DELETE /admin/announcements/:id
func (h *AnnouncementHandler) AdminRemove(c *gin.Context) {
	id, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	res, err := h.svc.Remove(id)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "已删除")
}
