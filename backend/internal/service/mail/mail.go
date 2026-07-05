// ============================================================
// mail — 验证码邮件发送（标准库 net/smtp，无第三方依赖）
// 端口 465 走隐式 TLS（QQ/163/Gmail 常用），其余端口走 smtp.SendMail（支持 STARTTLS）。
// ============================================================

package mail

import (
	"crypto/tls"
	"errors"
	"fmt"
	"net/smtp"
	"strings"

	"resumecraft-pdf-backend/internal/config"
)

var ErrNotConfigured = errors.New("smtp not configured")

type Sender struct {
	cfg config.SMTPConfig
}

func NewSender(cfg config.SMTPConfig) *Sender {
	return &Sender{cfg: cfg}
}

func (s *Sender) Configured() bool {
	return s.cfg.Configured()
}

// SendCode 发送验证码邮件。purpose: register | login | change_password。
func (s *Sender) SendCode(to, code, purpose string) error {
	if !s.cfg.Configured() {
		return ErrNotConfigured
	}

	action := "注册"
	actionDesc := "注册"
	if purpose == "login" {
		action = "登录"
		actionDesc = "登录"
	} else if purpose == "change_password" {
		action = "修改密码"
		actionDesc = "修改密码"
	}
	subject := fmt.Sprintf("【ResumeCraft】%s验证码", action)
	htmlBody := fmt.Sprintf(`<div style="font-family:'Microsoft YaHei',sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#111827;font-size:18px">ResumeCraft %s验证码</h2>
  <p style="color:#4b5563;font-size:14px">你正在%s，验证码为：</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#6366f1;margin:16px 0">%s</div>
  <p style="color:#9ca3af;font-size:12px">验证码 5 分钟内有效，请勿泄露给他人。若非本人操作，请忽略此邮件。</p>
</div>`, action, actionDesc, code)

	return s.send(to, subject, htmlBody)
}

func (s *Sender) send(to, subject, htmlBody string) error {
	from := s.cfg.From
	fromHeader := from
	if s.cfg.FromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", s.cfg.FromName, from)
	}

	var msg strings.Builder
	msg.WriteString("From: " + fromHeader + "\r\n")
	msg.WriteString("To: " + to + "\r\n")
	msg.WriteString("Subject: " + subject + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)
	auth := smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)

	if s.cfg.Port == 465 {
		return s.sendTLS(addr, auth, from, to, []byte(msg.String()))
	}
	// 587/25：SendMail 内部会在服务端支持时自动 STARTTLS
	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg.String()))
}

// sendTLS 隐式 TLS（端口 465）：先建立 TLS 连接再走 SMTP 会话
func (s *Sender) sendTLS(addr string, auth smtp.Auth, from, to string, msg []byte) error {
	tlsCfg := &tls.Config{ServerName: s.cfg.Host}
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("smtp tls dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.cfg.Host)
	if err != nil {
		return fmt.Errorf("smtp new client: %w", err)
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail from: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("smtp rcpt to: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp write: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close data: %w", err)
	}
	return client.Quit()
}
