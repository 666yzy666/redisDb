package repository

import (
	"database/sql"
	"errors"
	"time"

	"github.com/jmoiron/sqlx"
)

// PaymentOrder 对应 payment_orders 表
type PaymentOrder struct {
	ID        int64          `db:"id"`
	OrderNo   string         `db:"order_no"`
	UserID    int64          `db:"user_id"`
	Amount    string         `db:"amount"` // DECIMAL 以字符串读出(与前端展示一致)
	Subject   string         `db:"subject"`
	Status    string         `db:"status"`
	Channel   sql.NullString `db:"channel"`
	PaidAt    sql.NullTime   `db:"paid_at"`
	CreatedAt time.Time      `db:"created_at"`
}

type PaymentRepo struct{ db *sqlx.DB }

func NewPaymentRepo(db *sqlx.DB) *PaymentRepo { return &PaymentRepo{db: db} }

const poCols = `id, order_no, user_id, amount, subject, status, channel, paid_at, created_at`

func (r *PaymentRepo) Create(orderNo string, userID int64, amount float64, subject string) (int64, error) {
	res, err := r.db.Exec(
		`INSERT INTO payment_orders (order_no, user_id, amount, subject) VALUES (?, ?, ?, ?)`,
		orderNo, userID, amount, subject)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (r *PaymentRepo) FindByID(id int64) (*PaymentOrder, error) {
	var o PaymentOrder
	err := r.db.Get(&o, `SELECT `+poCols+` FROM payment_orders WHERE id = ? LIMIT 1`, id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *PaymentRepo) FindByNo(orderNo string) (*PaymentOrder, error) {
	var o PaymentOrder
	err := r.db.Get(&o, `SELECT `+poCols+` FROM payment_orders WHERE order_no = ? LIMIT 1`, orderNo)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &o, nil
}

func (r *PaymentRepo) ListByUser(userID int64) ([]PaymentOrder, error) {
	rows := []PaymentOrder{}
	err := r.db.Select(&rows, `SELECT `+poCols+` FROM payment_orders WHERE user_id = ? ORDER BY id DESC`, userID)
	return rows, err
}

func (r *PaymentRepo) ListAll(status string, limit, offset int) ([]PaymentOrder, error) {
	rows := []PaymentOrder{}
	var err error
	if status != "" {
		err = r.db.Select(&rows, `SELECT `+poCols+` FROM payment_orders WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?`, status, limit, offset)
	} else {
		err = r.db.Select(&rows, `SELECT `+poCols+` FROM payment_orders ORDER BY id DESC LIMIT ? OFFSET ?`, limit, offset)
	}
	return rows, err
}

func (r *PaymentRepo) CountAll(status string) (int, error) {
	var total int
	var err error
	if status != "" {
		err = r.db.Get(&total, `SELECT COUNT(*) FROM payment_orders WHERE status = ?`, status)
	} else {
		err = r.db.Get(&total, `SELECT COUNT(*) FROM payment_orders`)
	}
	return total, err
}

// MarkPaid 守卫式:仅 pending 才转 paid,返回受影响行数(幂等关键)
func (r *PaymentRepo) MarkPaid(id int64, channel string) (int64, error) {
	res, err := r.db.Exec(
		`UPDATE payment_orders SET status='paid', channel=?, paid_at=NOW() WHERE id=? AND status='pending'`,
		channel, id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *PaymentRepo) MarkCancelled(id int64) (int64, error) {
	res, err := r.db.Exec(`UPDATE payment_orders SET status='cancelled' WHERE id=? AND status='pending'`, id)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// Stats 仪表盘用(P5):总数 / 已付数 / 已付金额
type PaymentStats struct {
	Total      int     `db:"total"`
	Paid       int     `db:"paid"`
	PaidAmount float64 `db:"paidAmount"`
}

func (r *PaymentRepo) Stats() (PaymentStats, error) {
	var s PaymentStats
	err := r.db.Get(&s,
		`SELECT COUNT(*) AS total,
		        COALESCE(SUM(status='paid'),0) AS paid,
		        COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) AS paidAmount
		 FROM payment_orders`)
	return s, err
}
