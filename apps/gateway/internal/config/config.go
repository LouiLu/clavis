package config

import "os"

type Config struct {
	Port            string
	ControlPlaneURL string
	RedisURL        string
}

func Load() Config {
	return Config{
		Port:            getenv("GATEWAY_PORT", "8080"),
		ControlPlaneURL: getenv("CONTROL_PLANE_URL", "http://control-plane:4000"),
		RedisURL:        getenv("REDIS_URL", "redis://redis:6379"),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
