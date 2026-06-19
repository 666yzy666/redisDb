package service

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"

	"miniapp/internal/config"
	"miniapp/internal/httpx"
	"miniapp/internal/repository"
)

type AuthService struct {
	cfg   *config.Config
	users *repository.UserRepo
	rdb   *redis.Client
	email *EmailService
}

func NewAuthService(cfg *config.Config, users *repository.UserRepo, rdb *redis.Client, email *EmailService) *AuthService {
	return &AuthService{cfg: cfg, users: users, rdb: rdb, email: email}
}

// SafeUser 对外返回的用户字段(不含密码哈希)
type SafeUser struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	Nickname  string `json:"nickname"`
	AvatarURL string `json:"avatar_url"`
	CreatedAt string `json:"created_at"`
}

func toSafe(u *repository.User) SafeUser {
	return SafeUser{
		ID:        u.ID,
		Email:     u.Email.String,
		Role:      u.Role,
		Nickname:  u.Nickname,
		AvatarURL: u.AvatarURL,
		CreatedAt: u.CreatedAt.Format(time.RFC3339),
	}
}

func codeKey(email string) string     { return "verify:register:" + email }
func cooldownKey(email string) string { return "verify:cooldown:" + email }
func sessionKey(id int64) string      { return fmt.Sprintf("session:%d", id) }

var emailRe = func(s string) bool {
	at := strings.IndexByte(s, '@')
	dot := strings.LastIndexByte(s, '.')
	return at > 0 && dot > at+1 && dot < len(s)-1
}

func assertEmail(email string) error {
	if email == "" || !emailRe(email) {
		return httpx.BadRequest("邮箱格式不正确")
	}
	return nil
}
func assertPassword(pw string) error {
	if len(pw) < 6 {
		return httpx.BadRequest("密码至少 6 位")
	}
	return nil
}

func genCode() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000))
	return fmt.Sprintf("%06d", n.Int64())
}

// SendRegisterCode 发注册验证码
func (s *AuthService) SendRegisterCode(ctx context.Context, email string) (map[string]any, error) {
	if err := assertEmail(email); err != nil {
		return nil, err
	}
	if exists, _ := s.rdb.Get(ctx, cooldownKey(email)).Result(); exists != "" {
		return nil, httpx.BadRequest("验证码发送过于频繁,请稍后再试", 42900)
	}
	code := genCode()
	ttl := time.Duration(s.cfg.VerifyCodeTTL) * time.Second
	s.rdb.Set(ctx, codeKey(email), code, ttl)
	s.rdb.Set(ctx, cooldownKey(email), "1", time.Duration(s.cfg.VerifyCooldown)*time.Second)

	body := fmt.Sprintf("您的验证码是 %s,%d 分钟内有效。", code, s.cfg.VerifyCodeTTL/60)
	if err := s.email.Send(email, "注册验证码", body); err != nil {
		return nil, err
	}

	res := map[string]any{"sent": true}
	if s.cfg.IsDev() {
		res["code"] = code // dev 方便本地调试
	}
	return res, nil
}

// Register 注册即登录
func (s *AuthService) Register(ctx context.Context, email, password, code string) (map[string]any, error) {
	if err := assertEmail(email); err != nil {
		return nil, err
	}
	if err := assertPassword(password); err != nil {
		return nil, err
	}
	if code == "" {
		return nil, httpx.BadRequest("请输入验证码")
	}
	real, _ := s.rdb.Get(ctx, codeKey(email)).Result()
	if real == "" || real != code {
		return nil, httpx.BadRequest("验证码错误或已过期", 40010)
	}
	if u, err := s.users.FindByEmail(email); err != nil {
		return nil, err
	} else if u != nil {
		return nil, httpx.BadRequest("该邮箱已注册", 40011)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		return nil, err
	}
	if _, err := s.users.CreateEmailUser(email, string(hash), ""); err != nil {
		return nil, err
	}
	s.rdb.Del(ctx, codeKey(email))

	u, err := s.users.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	return s.IssueSession(ctx, u)
}

// Login 邮箱密码登录
func (s *AuthService) Login(ctx context.Context, email, password string) (map[string]any, error) {
	if err := assertEmail(email); err != nil {
		return nil, err
	}
	if err := assertPassword(password); err != nil {
		return nil, err
	}
	u, err := s.users.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	if u == nil || !u.PasswordHash.Valid {
		return nil, httpx.Unauthorized("邮箱或密码错误")
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash.String), []byte(password)) != nil {
		return nil, httpx.Unauthorized("邮箱或密码错误")
	}
	if u.Status == "disabled" {
		return nil, httpx.Forbidden("账号已被禁用")
	}
	return s.IssueSession(ctx, u)
}

// IssueSession 签 JWT + 写 Redis 会话,返回 {token, user}
func (s *AuthService) IssueSession(ctx context.Context, u *repository.User) (map[string]any, error) {
	exp := time.Duration(s.cfg.JWTExpireHours) * time.Hour
	claims := jwt.MapClaims{
		"userId": u.ID,
		"email":  u.Email.String,
		"role":   u.Role,
		"exp":    time.Now().Add(exp).Unix(),
		"iat":    time.Now().Unix(),
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, err
	}
	s.rdb.Set(ctx, sessionKey(u.ID), token, exp)
	return map[string]any{"token": token, "user": toSafe(u)}, nil
}
