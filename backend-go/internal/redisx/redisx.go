package redisx

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"

	"miniapp/internal/config"
)

// Connect 建立 Redis 客户端并 ping 探活
func Connect(ctx context.Context, c *config.Config) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", c.RedisHost, c.RedisPort),
		Password: c.RedisPassword,
		DB:       c.RedisDB,
	})
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	return client, nil
}
