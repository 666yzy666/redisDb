package service

import (
	"crypto/tls"
	"fmt"
	"log"

	gomail "gopkg.in/gomail.v2"

	"miniapp/internal/config"
)

// EmailService:未配置 SMTP_HOST 时打印到日志(mock),配置了则真发
type EmailService struct{ cfg *config.Config }

func NewEmailService(cfg *config.Config) *EmailService { return &EmailService{cfg: cfg} }

func (s *EmailService) Send(to, subject, body string) error {
	if s.cfg.SMTPHost == "" {
		log.Printf("[WARN] 未配置 SMTP,模拟发信 -> 收件人:%s 主题:%s 内容:%s", to, subject, body)
		return nil
	}
	m := gomail.NewMessage()
	m.SetHeader("From", s.cfg.SMTPFrom)
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/plain", body)

	d := gomail.NewDialer(s.cfg.SMTPHost, s.cfg.SMTPPort, s.cfg.SMTPUser, s.cfg.SMTPPass)
	if s.cfg.SMTPPort == 465 {
		d.SSL = true // 隐式 TLS
	}
	d.TLSConfig = &tls.Config{ServerName: s.cfg.SMTPHost}

	if err := d.DialAndSend(m); err != nil {
		return fmt.Errorf("发信失败: %w", err)
	}
	log.Printf("[INFO] 邮件已发送 -> %s", to)
	return nil
}
