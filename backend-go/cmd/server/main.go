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

	// 仓库 / 服务
	userRepo := repository.NewUserRepo(database)
	emailSvc := service.NewEmailService(cfg)
	authSvc := service.NewAuthService(cfg, userRepo, rdb, emailSvc)
	userSvc := service.NewUserService(userRepo)
	adminSvc := service.NewAdminService(cfg, userRepo, rdb)
	paymentRepo := repository.NewPaymentRepo(database)
	paymentSvc := service.NewPaymentService(cfg, paymentRepo)

	// 首启自动建管理员
	if err := service.EnsureAdmin(cfg, userRepo); err != nil {
		log.Printf("[WARN] ensureAdmin 失败: %v", err)
	}

	r := router.Setup(cfg, rdb, router.Handlers{
		Auth:  handler.NewAuthHandler(authSvc),
		User:    handler.NewUserHandler(userSvc),
		Admin:   handler.NewAdminHandler(adminSvc),
		Payment: handler.NewPaymentHandler(paymentSvc),
	})

	addr := ":" + cfg.Port
	log.Printf("Server listening on http://localhost%s (env=%s)", addr, cfg.Env)
	if err := r.Run(addr); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
