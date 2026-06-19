package service

import "miniapp/internal/repository"

// StatsService 仪表盘统计:汇总用户/订单/公告
type StatsService struct {
	users  *repository.UserRepo
	orders *repository.PaymentRepo
	anns   *repository.AnnouncementRepo
}

func NewStatsService(users *repository.UserRepo, orders *repository.PaymentRepo, anns *repository.AnnouncementRepo) *StatsService {
	return &StatsService{users: users, orders: orders, anns: anns}
}

// GetStats 返回 {users, orders, paidOrders, paidAmount, announcements}(与 Node 版字段一致)
func (s *StatsService) GetStats() (map[string]any, error) {
	users, err := s.users.CountUsers("")
	if err != nil {
		return nil, err
	}
	os, err := s.orders.Stats()
	if err != nil {
		return nil, err
	}
	anns, err := s.anns.CountAll()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"users":         users,
		"orders":        os.Total,
		"paidOrders":    os.Paid,
		"paidAmount":    os.PaidAmount,
		"announcements": anns,
	}, nil
}
