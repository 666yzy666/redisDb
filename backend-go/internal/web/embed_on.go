//go:build embed

// Package web 在 `-tags embed` 构建下,把前端 dist 内嵌进二进制并对外托管。
// 生产镜像用这个;本地开发默认不带 embed 标签,走 embed_off.go(仅 API)。
package web

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed all:dist
var distEmbed embed.FS

// Register 把内嵌前端挂到引擎:
//   - /api/* 未命中 => 返回 JSON 404(不要把 HTML 当接口响应)
//   - 其余路径:命中静态文件就发文件,否则回退 index.html(SPA 前端路由)
func Register(r *gin.Engine) {
	distFS, err := fs.Sub(distEmbed, "dist")
	if err != nil {
		panic("embed dist: " + err.Error())
	}
	fileServer := http.FileServer(http.FS(distFS))
	indexHTML, _ := fs.ReadFile(distFS, "index.html")

	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"code": 40400, "message": "接口不存在"})
			return
		}
		clean := strings.TrimPrefix(p, "/")
		if clean == "" {
			clean = "index.html"
		}
		if f, err := distFS.Open(clean); err == nil {
			_ = f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})
}

// Enabled 是否内嵌了前端
func Enabled() bool { return true }
