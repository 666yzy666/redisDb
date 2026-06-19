package service

import (
	"log"

	"golang.org/x/crypto/bcrypt"

	"miniapp/internal/config"
	"miniapp/internal/repository"
)

// EnsureAdmin 首启按 ADMIN_EMAIL/ADMIN_PASSWORD 自动建管理员(已存在则跳过,幂等)
func EnsureAdmin(cfg *config.Config, users *repository.UserRepo) error {
	if cfg.AdminEmail == "" || cfg.AdminPassword == "" {
		return nil
	}
	existing, err := users.FindByEmail(cfg.AdminEmail)
	if err != nil {
		return err
	}
	if existing != nil {
		log.Printf("[INFO] 管理员 %s 已存在,跳过自动创建", cfg.AdminEmail)
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), 10)
	if err != nil {
		return err
	}
	id, err := users.CreateEmailUser(cfg.AdminEmail, string(hash), "admin")
	if err != nil {
		return err
	}
	if err := users.UpdateRole(id, "admin"); err != nil {
		return err
	}
	log.Printf("[INFO] 已自动创建管理员: %s", cfg.AdminEmail)
	return nil
}
