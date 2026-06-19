package service

import (
	"strings"
	"time"

	"miniapp/internal/httpx"
	"miniapp/internal/repository"
)

const maxAnnouncementPageSize = 100

type AnnouncementService struct {
	anns *repository.AnnouncementRepo
}

func NewAnnouncementService(anns *repository.AnnouncementRepo) *AnnouncementService {
	return &AnnouncementService{anns: anns}
}

// announcementJSON 用户端字段(不含 published)
func announcementJSON(a *repository.Announcement, withPublished bool) map[string]any {
	m := map[string]any{
		"id":         a.ID,
		"title":      a.Title,
		"content":    a.Content,
		"created_at": a.CreatedAt.Format(time.RFC3339),
	}
	if withPublished {
		m["published"] = a.Published
	}
	return m
}

func assertAnnouncementFields(title, content string) (string, string, error) {
	t := strings.TrimSpace(title)
	c := strings.TrimSpace(content)
	if t == "" {
		return "", "", httpx.BadRequest("标题不能为空")
	}
	if c == "" {
		return "", "", httpx.BadRequest("内容不能为空")
	}
	return t, c, nil
}

// ListForUser 已发布公告
func (s *AnnouncementService) ListForUser() ([]map[string]any, error) {
	rows, err := s.anns.ListPublished()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]any, 0, len(rows))
	for i := range rows {
		out = append(out, announcementJSON(&rows[i], false))
	}
	return out, nil
}

// ListForAdmin 全部公告(分页)
func (s *AnnouncementService) ListForAdmin(page, pageSize int) (map[string]any, error) {
	p := page
	if p < 1 {
		p = 1
	}
	size := pageSize
	if size < 1 {
		size = 20
	}
	if size > maxAnnouncementPageSize {
		size = maxAnnouncementPageSize
	}
	rows, err := s.anns.ListAll(size, (p-1)*size)
	if err != nil {
		return nil, err
	}
	total, err := s.anns.CountAll()
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(rows))
	for i := range rows {
		items = append(items, announcementJSON(&rows[i], true))
	}
	return map[string]any{"items": items, "total": total, "page": p, "pageSize": size}, nil
}

func (s *AnnouncementService) Create(title, content string) (map[string]any, error) {
	t, c, err := assertAnnouncementFields(title, content)
	if err != nil {
		return nil, err
	}
	id, err := s.anns.Create(t, c)
	if err != nil {
		return nil, err
	}
	a, err := s.anns.FindByID(id)
	if err != nil {
		return nil, err
	}
	return announcementJSON(a, true), nil
}

func (s *AnnouncementService) Update(id int64, title, content string) (map[string]any, error) {
	t, c, err := assertAnnouncementFields(title, content)
	if err != nil {
		return nil, err
	}
	found, err := s.anns.FindByID(id)
	if err != nil {
		return nil, err
	}
	if found == nil {
		return nil, httpx.NotFound("公告不存在")
	}
	if err := s.anns.Update(id, t, c); err != nil {
		return nil, err
	}
	a, err := s.anns.FindByID(id)
	if err != nil {
		return nil, err
	}
	return announcementJSON(a, true), nil
}

func (s *AnnouncementService) SetPublished(id int64, published bool) (map[string]any, error) {
	found, err := s.anns.FindByID(id)
	if err != nil {
		return nil, err
	}
	if found == nil {
		return nil, httpx.NotFound("公告不存在")
	}
	v := 0
	if published {
		v = 1
	}
	if err := s.anns.SetPublished(id, v); err != nil {
		return nil, err
	}
	a, err := s.anns.FindByID(id)
	if err != nil {
		return nil, err
	}
	return announcementJSON(a, true), nil
}

func (s *AnnouncementService) Remove(id int64) (map[string]any, error) {
	found, err := s.anns.FindByID(id)
	if err != nil {
		return nil, err
	}
	if found == nil {
		return nil, httpx.NotFound("公告不存在")
	}
	if err := s.anns.Remove(id); err != nil {
		return nil, err
	}
	return map[string]any{"removed": true}, nil
}
