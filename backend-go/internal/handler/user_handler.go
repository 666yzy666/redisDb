package handler

import (
	"github.com/gin-gonic/gin"

	"miniapp/internal/httpx"
	"miniapp/internal/service"
)

type UserHandler struct{ users *service.UserService }

func NewUserHandler(users *service.UserService) *UserHandler { return &UserHandler{users: users} }

func (h *UserHandler) GetProfile(c *gin.Context) {
	res, err := h.users.GetProfile(c.GetInt64("userId"))
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.Success(c, res)
}

func (h *UserHandler) UpdateProfile(c *gin.Context) {
	var body struct {
		Nickname  string `json:"nickname"`
		AvatarURL string `json:"avatarUrl"`
	}
	_ = c.ShouldBindJSON(&body)
	res, err := h.users.UpdateProfile(c.GetInt64("userId"), body.Nickname, body.AvatarURL)
	if err != nil {
		httpx.Fail(c, err)
		return
	}
	httpx.SuccessMsg(c, res, "更新成功")
}
