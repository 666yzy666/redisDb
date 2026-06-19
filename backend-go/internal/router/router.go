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
	Auth    *handler.AuthHandler
	User    *handler.UserHandler
	Admin   *handler.AdminHandler
	Payment *handler.PaymentHandler
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

		// 付款订单
		p := api.Group("/payment")
		{
			p.POST("/notify/:channel", h.Payment.Notify) // 回调:公开
			pa := p.Group("", auth)                       // 以下需登录
			{
				pa.POST("/orders", h.Payment.Create)
				pa.GET("/orders", h.Payment.ListMine)
				pa.POST("/orders/:id/pay", h.Payment.Pay)
				pa.POST("/orders/:id/cancel", h.Payment.Cancel)
				pa.POST("/mock/complete", h.Payment.MockComplete)
			}
		}

		// 后台(需登录 + 管理员)
		ad := api.Group("/admin", auth, admin)
		{
			ad.GET("/ping", h.Admin.Ping)
			ad.GET("/users", h.Admin.ListUsers)
			ad.PATCH("/users/:id/role", h.Admin.SetRole)
			ad.PATCH("/users/:id/status", h.Admin.SetStatus)
			ad.GET("/orders", h.Payment.AdminListOrders)
		}
	}

	return r
}
