package config

import (
	"os"
	"strconv"
)

// Config 全项目配置,统一从环境变量读取(变量名与 Node 版一致)
type Config struct {
	Env  string
	Port string

	MySQLHost     string
	MySQLPort     string
	MySQLUser     string
	MySQLPassword string
	MySQLDatabase string

	RedisHost     string
	RedisPort     string
	RedisPassword string
	RedisDB       int

	JWTSecret      string
	JWTExpireHours int

	SMTPHost string
	SMTPPort int
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	VerifyCodeTTL  int // 秒
	VerifyCooldown int // 秒

	AdminEmail    string
	AdminPassword string
}

func Load() *Config {
	return &Config{
		Env:  getenv("NODE_ENV", "development"),
		Port: getenv("PORT", "3000"),

		MySQLHost:     getenv("MYSQL_HOST", "127.0.0.1"),
		MySQLPort:     getenv("MYSQL_PORT", "3306"),
		MySQLUser:     getenv("MYSQL_USER", "root"),
		MySQLPassword: getenv("MYSQL_PASSWORD", ""),
		MySQLDatabase: getenv("MYSQL_DATABASE", "miniapp"),

		RedisHost:     getenv("REDIS_HOST", "127.0.0.1"),
		RedisPort:     getenv("REDIS_PORT", "6379"),
		RedisPassword: getenv("REDIS_PASSWORD", ""),
		RedisDB:       getenvInt("REDIS_DB", 0),

		JWTSecret:      getenv("JWT_SECRET", "dev_secret"),
		JWTExpireHours: getenvInt("JWT_EXPIRE_HOURS", 24*7),

		SMTPHost: getenv("SMTP_HOST", ""),
		SMTPPort: getenvInt("SMTP_PORT", 465),
		SMTPUser: getenv("SMTP_USER", ""),
		SMTPPass: getenv("SMTP_PASS", ""),
		SMTPFrom: getenv("SMTP_FROM", "no-reply@example.com"),

		VerifyCodeTTL:  getenvInt("VERIFY_CODE_TTL", 300),
		VerifyCooldown: getenvInt("VERIFY_COOLDOWN", 60),

		AdminEmail:    getenv("ADMIN_EMAIL", ""),
		AdminPassword: getenv("ADMIN_PASSWORD", ""),
	}
}

func (c *Config) IsDev() bool { return c.Env != "production" }

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getenvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
