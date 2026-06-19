package router

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"

	"miniapp/internal/config"
	"miniapp/internal/handler"
	"miniapp/internal/middleware"
)

type Handlers struct {
	Auth  *handler.AuthHandler
	User  *handler.UserHandler
	Admin *handler.AdminHandler
}

// Setup 注册路由
func Setup(cfg *config.Config, rdb *redis.Client, h Handlers) *gin.Engine {
	r := gin.Default()
	auth := middleware.Auth(cfg, rdb)
	admin := middleware.Admin()

	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"status": "up"}})
		})

		// 邮箱认证(公开)
		a := api.Group("/auth")
		{
			a.POST("/send-code", h.Auth.SendCode)
			a.POST("/register", h.Auth.Register)
			a.POST("/login", h.Auth.Login)
			a.POST("/forgot-password", h.Auth.ForgotPassword)
			a.POST("/reset-password", h.Auth.ResetPassword)
		}

		// 用户(需登录)
		u := api.Group("/users", auth)
		{
			u.GET("/profile", h.User.GetProfile)
			u.PUT("/profile", h.User.UpdateProfile)
		}

		// 后台(需登录 + 管理员)
		ad := api.Group("/admin", auth, admin)
		{
			ad.GET("/ping", h.Admin.Ping)
			ad.GET("/users", h.Admin.ListUsers)
			ad.PATCH("/users/:id/role", h.Admin.SetRole)
			ad.PATCH("/users/:id/status", h.Admin.SetStatus)
		}
	}

	return r
}
