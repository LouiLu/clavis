package config

import "os"

type Config struct {
	Port             string
	SampleBackendURL string
}

func Load() Config {
	return Config{
		Port:             getenv("GATEWAY_PORT", "8080"),
		SampleBackendURL: getenv("SAMPLE_BACKEND_URL", "http://sample-backend:6060"),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
