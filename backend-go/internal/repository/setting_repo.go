package repository

import (
	"database/sql"
	"errors"

	"github.com/jmoiron/sqlx"
)

// Setting 对应 settings 表(键值)
type Setting struct {
	Key   string `db:"key"`
	Value string `db:"value"`
}

type SettingRepo struct{ db *sqlx.DB }

func NewSettingRepo(db *sqlx.DB) *SettingRepo { return &SettingRepo{db: db} }

// GetAll 返回全部键值
func (r *SettingRepo) GetAll() ([]Setting, error) {
	rows := []Setting{}
	err := r.db.Select(&rows, "SELECT `key`, `value` FROM settings")
	return rows, err
}

// Get 取单个键(不存在返回 "", false)
func (r *SettingRepo) Get(key string) (string, bool, error) {
	var v string
	err := r.db.Get(&v, "SELECT `value` FROM settings WHERE `key` = ? LIMIT 1", key)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

// Upsert 插入或更新
func (r *SettingRepo) Upsert(key, value string) error {
	_, err := r.db.Exec(
		"INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?",
		key, value, value)
	return err
}
