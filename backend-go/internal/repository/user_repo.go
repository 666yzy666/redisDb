package repository

import (
	"database/sql"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
)

// User 对应 users 表(email/password_hash/openid 可空)
type User struct {
	ID           int64          `db:"id"`
	OpenID       sql.NullString `db:"openid"`
	Email        sql.NullString `db:"email"`
	PasswordHash sql.NullString `db:"password_hash"`
	Role         string         `db:"role"`
	Status       string         `db:"status"`
	Nickname     string         `db:"nickname"`
	AvatarURL    string         `db:"avatar_url"`
	CreatedAt    time.Time      `db:"created_at"`
}

type UserRepo struct{ db *sqlx.DB }

func NewUserRepo(db *sqlx.DB) *UserRepo { return &UserRepo{db: db} }

// FindByEmail 不存在返回 (nil, nil)
func (r *UserRepo) FindByEmail(email string) (*User, error) {
	var u User
	err := r.db.Get(&u,
		`SELECT id, openid, email, password_hash, role, status, nickname, avatar_url, created_at
		 FROM users WHERE email = ? LIMIT 1`, email)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) FindByID(id int64) (*User, error) {
	var u User
	err := r.db.Get(&u,
		`SELECT id, openid, email, password_hash, role, status, nickname, avatar_url, created_at
		 FROM users WHERE id = ? LIMIT 1`, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (r *UserRepo) CreateEmailUser(email, passwordHash, nickname string) (int64, error) {
	res, err := r.db.Exec(
		`INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?)`,
		email, passwordHash, nickname)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *UserRepo) UpdateRole(id int64, role string) error {
	_, err := r.db.Exec(`UPDATE users SET role = ? WHERE id = ?`, role, id)
	return err
}
