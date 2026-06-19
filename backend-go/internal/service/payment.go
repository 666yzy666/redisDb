package service

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"miniapp/internal/config"
	"miniapp/internal/httpx"
	"miniapp/internal/repository"
	"miniapp/internal/service/channel"
)

const defaultChannel = "mock"
const maxPaymentPageSize = 100

type PaymentService struct {
	cfg    *config.Config
	orders *repository.PaymentRepo
}

func NewPaymentService(cfg *config.Config, orders *repository.PaymentRepo) *PaymentService {
	return &PaymentService{cfg: cfg, orders: orders}
}

func genOrderNo() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return "PO" + time.Now().Format("20060102150405") + hex.EncodeToString(b)
}

// orderJSON 输出(channel/paid_at 处理 null)
func orderJSON(o *repository.PaymentOrder) map[string]any {
	m := map[string]any{
		"id":         o.ID,
		"order_no":   o.OrderNo,
		"user_id":    o.UserID,
		"amount":     o.Amount,
		"subject":    o.Subject,
		"status":     o.Status,
		"created_at": o.CreatedAt.Format(time.RFC3339),
		"channel":    nil,
		"paid_at":    nil,
	}
	if o.Channel.Valid {
		m["channel"] = o.Channel.String
	}
	if o.PaidAt.Valid {
		m["paid_at"] = o.PaidAt.Time.Format(time.RFC3339)
	}
	return m
}

func (s *PaymentService) CreateOrder(userID int64, amount float64, subject string) (map[string]any, error) {
	if amount <= 0 {
		return nil, httpx.BadRequest("金额必须大于 0")
	}
	if subject == "" {
		return nil, httpx.BadRequest("订单标题不能为空")
	}
	id, err := s.orders.Create(genOrderNo(), userID, amount, subject)
	if err != nil {
		return nil, err
	}
	o, err := s.orders.FindByID(id)
	if err != nil {
		return nil, err
	}
	return orderJSON(o), nil
}

func (s *PaymentService) ListMyOrders(userID int64) ([]map[string]any, error) {
	rows, err := s.orders.ListByUser(userID)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for i := range rows {
		out = append(out, orderJSON(&rows[i]))
	}
	return out, nil
}

// getOwned 取订单并校验归属(不存在/越权统一按不存在)
func (s *PaymentService) getOwned(userID, id int64) (*repository.PaymentOrder, error) {
	o, err := s.orders.FindByID(id)
	if err != nil {
		return nil, err
	}
	if o == nil || o.UserID != userID {
		return nil, httpx.NotFound("订单不存在")
	}
	return o, nil
}

func (s *PaymentService) CancelOrder(userID, id int64) (map[string]any, error) {
	if _, err := s.getOwned(userID, id); err != nil {
		return nil, err
	}
	affected, err := s.orders.MarkCancelled(id)
	if err != nil {
		return nil, err
	}
	if affected == 0 {
		return nil, httpx.BadRequest("订单状态已变化,无法取消", 40903)
	}
	o, err := s.orders.FindByID(id)
	if err != nil {
		return nil, err
	}
	return orderJSON(o), nil
}

// Pay 发起支付:校验属于本人且 pending,调渠道
func (s *PaymentService) Pay(userID, id int64) (map[string]any, error) {
	o, err := s.getOwned(userID, id)
	if err != nil {
		return nil, err
	}
	if o.Status != "pending" {
		return nil, httpx.BadRequest("订单状态不可支付")
	}
	ch, ok := channel.Get(defaultChannel)
	if !ok {
		return nil, httpx.BadRequest("未知支付渠道")
	}
	res := ch.CreateCharge(o.OrderNo)
	res["orderNo"] = o.OrderNo
	return res, nil
}

// HandleNotify 处理回调(网关或 mock):解析 → markPaid(幂等)
func (s *PaymentService) HandleNotify(channelName string, body map[string]any) (map[string]any, error) {
	ch, ok := channel.Get(channelName)
	if !ok {
		return nil, httpx.BadRequest("未知支付渠道: " + channelName)
	}
	orderNo, success := ch.ParseNotify(body)
	if orderNo == "" {
		return nil, httpx.BadRequest("回调缺少 orderNo")
	}
	if success {
		o, err := s.orders.FindByNo(orderNo)
		if err != nil {
			return nil, err
		}
		if o == nil {
			return nil, httpx.NotFound("订单不存在")
		}
		if _, err := s.orders.MarkPaid(o.ID, channelName); err != nil { // affected=0 视为已处理,幂等
			return nil, err
		}
	}
	return map[string]any{"ok": true}, nil
}

func (s *PaymentService) ListAllForAdmin(page, pageSize int, status string) (map[string]any, error) {
	p := page
	if p < 1 {
		p = 1
	}
	size := pageSize
	if size < 1 {
		size = 20
	}
	if size > maxPaymentPageSize {
		size = maxPaymentPageSize
	}
	if status != "pending" && status != "paid" && status != "cancelled" {
		status = ""
	}
	rows, err := s.orders.ListAll(status, size, (p-1)*size)
	if err != nil {
		return nil, err
	}
	total, err := s.orders.CountAll(status)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(rows))
	for i := range rows {
		items = append(items, orderJSON(&rows[i]))
	}
	return map[string]any{"items": items, "total": total, "page": p, "pageSize": size}, nil
}
