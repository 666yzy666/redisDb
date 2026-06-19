package middleware

import "github.com/gin-gonic/gin"

// Admin 要求已登录用户的 role==admin(须在 Auth 之后)
func Admin() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("role") != "admin" {
			abort(c, 403, 40300, "需要管理员权限")
			return
		}
		c.Next()
	}
}
