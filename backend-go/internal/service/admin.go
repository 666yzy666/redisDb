package service

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"

	"miniapp/internal/config"
	"miniapp/internal/httpx"
	"miniapp/internal/repository"
)

type AdminService struct {
	cfg   *config.Config
	users *repository.UserRepo
	rdb   *redis.Client
}

func NewAdminService(cfg *config.Config, users *repository.UserRepo, rdb *redis.Client) *AdminService {
	return &AdminService{cfg: cfg, users: users, rdb: rdb}
}

// AdminUserItem 后台用户列表项(含 status)
type AdminUserItem struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Status    string `json:"status"`
	Nickname  string `json:"nickname"`
	CreatedAt string `json:"created_at"`
}

func toAdminItem(u *repository.User) AdminUserItem {
	return AdminUserItem{
		ID:        u.ID,
		Email:     u.Email.String,
		Role:      u.Role,
		Status:    u.Status,
		Nickname:  u.Nickname,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
}

const maxPageSize = 100

func clampPage(page, pageSize int) (p, size, offset int) {
	p = page
	if p < 1 {
		p = 1
	}
	size = pageSize
	if size < 1 {
		size = 20
	}
	if size > maxPageSize {
		size = maxPageSize
	}
	offset = (p - 1) * size
	return
}

func (s *AdminService) ListUsers(page, pageSize int, email string) (map[string]any, error) {
	p, size, offset := clampPage(page, pageSize)
	rows, err := s.users.ListUsers(email, size, offset)
	if err != nil {
		return nil, err
	}
	total, err := s.users.CountUsers(email)
	if err != nil {
		return nil, err
	}
	items := make([]AdminUserItem, 0, len(rows))
	for i := range rows {
		items = append(items, toAdminItem(&rows[i]))
	}
	return map[string]any{"items": items, "total": total, "page": p, "pageSize": size}, nil
}

func (s *AdminService) SetRole(currentID, targetID int64, role string) (*AdminUserItem, error) {
	if role != "user" && role != "admin" {
		return nil, httpx.BadRequest("role 必须是 user 或 admin")
	}
	if targetID == currentID {
		return nil, httpx.BadRequest("不能修改自己的角色")
	}
	u, err := s.users.FindByID(targetID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, httpx.NotFound("用户不存在")
	}
	if err := s.users.UpdateRole(targetID, role); err != nil {
		return nil, err
	}
	u.Role = role
	item := toAdminItem(u)
	return &item, nil
}

func (s *AdminService) SetStatus(ctx context.Context, currentID, targetID int64, status string) (*AdminUserItem, error) {
	if status != "active" && status != "disabled" {
		return nil, httpx.BadRequest("status 必须是 active 或 disabled")
	}
	if targetID == currentID {
		return nil, httpx.BadRequest("不能禁用自己")
	}
	u, err := s.users.FindByID(targetID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, httpx.NotFound("用户不存在")
	}
	if err := s.users.UpdateStatus(targetID, status); err != nil {
		return nil, err
	}
	if status == "disabled" {
		s.rdb.Del(ctx, fmt.Sprintf("session:%d", targetID)) // 踢下线
	}
	u.Status = status
	item := toAdminItem(u)
	return &item, nil
}
