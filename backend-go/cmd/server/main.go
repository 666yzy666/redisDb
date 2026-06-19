package main

import (
	"context"
	"log"

	"miniapp/internal/config"
	"miniapp/internal/db"
	"miniapp/internal/handler"
	"miniapp/internal/redisx"
	"miniapp/internal/repository"
	"miniapp/internal/router"
	"miniapp/internal/service"
	"miniapp/internal/web"
)

func main() {
	cfg := config.Load()
	ctx := context.Background()

	database, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("MySQL 连接失败: %v", err)
	}
	log.Printf("MySQL connected -> %s:%s/%s", cfg.MySQLHost, cfg.MySQLPort, cfg.MySQLDatabase)

	rdb, err := redisx.Connect(ctx, cfg)
	if err != nil {
		log.Fatalf("Redis 连接失败: %v", err)
	}
	log.Printf("Redis connected -> %s:%s", cfg.RedisHost, cfg.RedisPort)

	// 仓库
	userRepo := repository.NewUserRepo(database)
	paymentRepo := repository.NewPaymentRepo(database)
	announcementRepo := repository.NewAnnouncementRepo(database)
	settingRepo := repository.NewSettingRepo(database)

	// 服务
	emailSvc := service.NewEmailService(cfg)
	settingSvc := service.NewSettingService(settingRepo)
	authSvc := service.NewAuthService(cfg, userRepo, rdb, emailSvc, settingSvc)
	userSvc := service.NewUserService(userRepo)
	adminSvc := service.NewAdminService(cfg, userRepo, rdb)
	paymentSvc := service.NewPaymentService(cfg, paymentRepo)
	announcementSvc := service.NewAnnouncementService(announcementRepo)
	statsSvc := service.NewStatsService(userRepo, paymentRepo, announcementRepo)

	// 首启自动建管理员
	if err := service.EnsureAdmin(cfg, userRepo); err != nil {
		log.Printf("[WARN] ensureAdmin 失败: %v", err)
	}

	r := router.Setup(cfg, rdb, router.Handlers{
		Auth:         handler.NewAuthHandler(authSvc),
		User:         handler.NewUserHandler(userSvc),
		Admin:        handler.NewAdminHandler(adminSvc),
		Payment:      handler.NewPaymentHandler(paymentSvc),
		Announcement: handler.NewAnnouncementHandler(announcementSvc),
		Setting:      handler.NewSettingHandler(settingSvc, statsSvc),
	})

	// 内嵌前端(仅 `-tags embed` 生产构建生效;本地开发为空实现)
	web.Register(r)

	addr := ":" + cfg.Port
	log.Printf("Server listening on http://localhost%s (env=%s, frontend-embedded=%v)", addr, cfg.Env, web.Enabled())
	if err := r.Run(addr); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
