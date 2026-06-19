package router

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"miniapp/internal/handler"
)

// Setup 注册路由(P1:健康检查 + 邮箱认证)
func Setup(authH *handler.AuthHandler) *gin.Engine {
	r := gin.Default()

	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"status": "up"}})
		})

		auth := api.Group("/auth")
		{
			auth.POST("/send-code", authH.SendCode)
			auth.POST("/register", authH.Register)
			auth.POST("/login", authH.Login)
		}
	}

	return r
}
