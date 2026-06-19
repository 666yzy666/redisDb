package service

import (
	"miniapp/internal/httpx"
	"miniapp/internal/repository"
)

type UserService struct{ users *repository.UserRepo }

func NewUserService(users *repository.UserRepo) *UserService { return &UserService{users: users} }

func (s *UserService) GetProfile(id int64) (*SafeUser, error) {
	u, err := s.users.FindByID(id)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, httpx.NotFound("用户不存在")
	}
	safe := toSafe(u)
	return &safe, nil
}

func (s *UserService) UpdateProfile(id int64, nickname, avatarURL string) (*SafeUser, error) {
	u, err := s.users.FindByID(id)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, httpx.NotFound("用户不存在")
	}
	if nickname == "" {
		nickname = u.Nickname
	}
	if avatarURL == "" {
		avatarURL = u.AvatarURL
	}
	if err := s.users.UpdateProfile(id, nickname, avatarURL); err != nil {
		return nil, err
	}
	return s.GetProfile(id)
}
