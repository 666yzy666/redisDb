package middleware

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"

	"miniapp/internal/config"
)

// Auth 校验 JWT + 比对 Redis 会话,注入 userId/email/role 到 context
func Auth(cfg *config.Config, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, "Bearer ") {
			abort(c, 401, 40100, "缺少 token")
			return
		}
		tokenStr := strings.TrimPrefix(h, "Bearer ")

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			abort(c, 401, 40100, "token 无效或已过期")
			return
		}
		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			abort(c, 401, 40100, "token 无效")
			return
		}
		idf, _ := claims["userId"].(float64)
		userID := int64(idf)

		// 比对 Redis 会话(支持服务端踢登录)
		cached, _ := rdb.Get(c.Request.Context(), fmt.Sprintf("session:%d", userID)).Result()
		if cached == "" || cached != tokenStr {
			abort(c, 401, 40100, "会话已失效,请重新登录")
			return
		}

		c.Set("userId", userID)
		if email, ok := claims["email"].(string); ok {
			c.Set("email", email)
		}
		if role, ok := claims["role"].(string); ok {
			c.Set("role", role)
		}
		c.Next()
	}
}

func abort(c *gin.Context, status, code int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"code": code, "message": msg, "data": nil})
}
