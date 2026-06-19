package service

import (
	"strconv"

	"miniapp/internal/repository"
)

// 允许后台编辑的键 + 默认值(与 Node 版一致)
var allowedSettingKeys = []string{"site_name", "registration_open"}
var settingDefaults = map[string]string{
	"site_name":         "MiniApp 框架",
	"registration_open": "1",
}

type SettingService struct {
	settings *repository.SettingRepo
}

func NewSettingService(settings *repository.SettingRepo) *SettingService {
	return &SettingService{settings: settings}
}

// loadMap 读全部设置,缺失的用默认值补齐
func (s *SettingService) loadMap() (map[string]string, error) {
	rows, err := s.settings.GetAll()
	if err != nil {
		return nil, err
	}
	m := map[string]string{}
	for k, v := range settingDefaults {
		m[k] = v
	}
	for _, r := range rows {
		m[r.Key] = r.Value
	}
	return m, nil
}

// truthy "0"/"false" 视为关闭,其余为开启
func truthy(v string) bool { return v != "0" && v != "false" }

// GetPublic 公开设置:站名 + 是否开放注册(布尔)
func (s *SettingService) GetPublic() (map[string]any, error) {
	m, err := s.loadMap()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"site_name":         m["site_name"],
		"registration_open": truthy(m["registration_open"]),
	}, nil
}

// GetAllForAdmin 后台:按允许键返回 {items:[{key,value}]}
func (s *SettingService) GetAllForAdmin() (map[string]any, error) {
	m, err := s.loadMap()
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(allowedSettingKeys))
	for _, k := range allowedSettingKeys {
		items = append(items, map[string]any{"key": k, "value": m[k]})
	}
	return map[string]any{"items": items}, nil
}

// UpdateMany 仅更新允许键中存在的字段,返回最新列表
func (s *SettingService) UpdateMany(body map[string]any) (map[string]any, error) {
	for _, k := range allowedSettingKeys {
		v, ok := body[k]
		if !ok || v == nil {
			continue
		}
		if err := s.settings.Upsert(k, toSettingString(v)); err != nil {
			return nil, err
		}
	}
	return s.GetAllForAdmin()
}

// IsRegistrationOpen 注册开关(供 Auth 注册时校验)
func (s *SettingService) IsRegistrationOpen() (bool, error) {
	v, ok, err := s.settings.Get("registration_open")
	if err != nil {
		return true, err
	}
	if !ok {
		return true, nil
	}
	return truthy(v), nil
}

// toSettingString 把 JSON 任意值转为字符串存储(bool→"true"/"false",数字按原样)
func toSettingString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		// 整数化:registration_open 前端可能传 0/1
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		return ""
	}
}
