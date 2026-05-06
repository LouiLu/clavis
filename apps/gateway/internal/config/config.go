package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	Port                       string
	ControlPlaneURL            string
	RedisURL                   string
	LoggingEnabled             bool
	LogChannelSize             int
	LogBatchSize               int
	LogFlushInterval           time.Duration
	ValidationCacheEnabled     bool
	ValidationCacheTTL         time.Duration
	ValidationCacheNegativeTTL time.Duration
}

func Load() Config {
	return Config{
		Port:                       getenv("GATEWAY_PORT", "8080"),
		ControlPlaneURL:            getenv("CONTROL_PLANE_URL", "http://control-plane:4000"),
		RedisURL:                   getenv("REDIS_URL", "redis://redis:6379"),
		LoggingEnabled:             getenvBool("GATEWAY_LOGGING_ENABLED", true),
		LogChannelSize:             getenvInt("GATEWAY_LOG_CHANNEL_SIZE", 10000),
		LogBatchSize:               getenvInt("GATEWAY_LOG_BATCH_SIZE", 100),
		LogFlushInterval:           getenvDuration("GATEWAY_LOG_FLUSH_INTERVAL", 5*time.Second),
		ValidationCacheEnabled:     getenvBool("GATEWAY_VALIDATION_CACHE_ENABLED", true),
		ValidationCacheTTL:         getenvDuration("GATEWAY_VALIDATION_CACHE_TTL", 30*time.Second),
		ValidationCacheNegativeTTL: getenvDuration("GATEWAY_VALIDATION_CACHE_NEGATIVE_TTL", 5*time.Second),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getenvBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	v, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return v
}

func getenvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	v, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return v
}

func getenvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	v, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return v
}
