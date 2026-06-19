//go:build !embed

// Package web 默认(无 embed 标签)构建:不内嵌前端,仅提供 API。
// 本地开发用 Vite dev server 跑前端,后端只管 /api。
package web

import "github.com/gin-gonic/gin"

// Register 空实现:不挂前端
func Register(r *gin.Engine) {}

// Enabled 未内嵌前端
func Enabled() bool { return false }
