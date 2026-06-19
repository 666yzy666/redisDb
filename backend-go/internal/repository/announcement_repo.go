package repository

import (
	"database/sql"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
)

// Announcement 对应 announcements 表
type Announcement struct {
	ID        int64     `db:"id"`
	Title     string    `db:"title"`
	Content   string    `db:"content"`
	Published int       `db:"published"`
	CreatedAt time.Time `db:"created_at"`
}

type AnnouncementRepo struct{ db *sqlx.DB }

func NewAnnouncementRepo(db *sqlx.DB) *AnnouncementRepo { return &AnnouncementRepo{db: db} }

// ListPublished 用户端:仅已发布,倒序
func (r *AnnouncementRepo) ListPublished() ([]Announcement, error) {
	rows := []Announcement{}
	err := r.db.Select(&rows,
		`SELECT id, title, content, created_at FROM announcements
		 WHERE published = 1 ORDER BY id DESC`)
	return rows, err
}

// ListAll 后台:全部,分页
func (r *AnnouncementRepo) ListAll(limit, offset int) ([]Announcement, error) {
	rows := []Announcement{}
	err := r.db.Select(&rows,
		`SELECT id, title, content, published, created_at FROM announcements
		 ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	return rows, err
}

func (r *AnnouncementRepo) CountAll() (int, error) {
	var total int
	err := r.db.Get(&total, `SELECT COUNT(*) FROM announcements`)
	return total, err
}

// FindByID 不存在返回 (nil, nil)
func (r *AnnouncementRepo) FindByID(id int64) (*Announcement, error) {
	var a Announcement
	err := r.db.Get(&a,
		`SELECT id, title, content, published, created_at FROM announcements WHERE id = ? LIMIT 1`, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *AnnouncementRepo) Create(title, content string) (int64, error) {
	res, err := r.db.Exec(
		`INSERT INTO announcements (title, content) VALUES (?, ?)`, title, content)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *AnnouncementRepo) Update(id int64, title, content string) error {
	_, err := r.db.Exec(`UPDATE announcements SET title = ?, content = ? WHERE id = ?`, title, content, id)
	return err
}

func (r *AnnouncementRepo) SetPublished(id int64, published int) error {
	_, err := r.db.Exec(`UPDATE announcements SET published = ? WHERE id = ?`, published, id)
	return err
}

func (r *AnnouncementRepo) Remove(id int64) error {
	_, err := r.db.Exec(`DELETE FROM announcements WHERE id = ?`, id)
	return err
}
