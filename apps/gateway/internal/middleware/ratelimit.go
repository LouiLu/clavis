package middleware

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"platform/gateway/internal/validation"
)

// WithValidationResult injects a validation result into the context.
func WithValidationResult(ctx context.Context, result *validation.ValidationResult) context.Context {
	return context.WithValue(ctx, validationResultKey, result)
}

// RateLimit returns middleware that enforces token-bucket rate limiting per API key.
func RateLimit(rdb *redis.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			result := GetValidationResult(r.Context())
			if result == nil || result.RateLimit == nil {
				next.ServeHTTP(w, r)
				return
			}

			policy := result.RateLimit
			key := fmt.Sprintf("ratelimit:%s", result.APIKey.ID)
			limit := policy.BurstSize
			rate := float64(policy.RequestsPerInterval) / float64(policy.IntervalSeconds)
			now := time.Now().Unix()

			allowed, remaining, retryAfter, err := checkTokenBucket(r.Context(), rdb, key, rate, limit, now)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			setRateLimitHeaders(w, limit, remaining, now+int64(policy.IntervalSeconds))

			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
				writeError(w, http.StatusTooManyRequests, "rate_limit_exceeded",
					fmt.Sprintf("Rate limit exceeded. Try again in %d seconds.", retryAfter))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

var tokenBucketScript = redis.NewScript(`
	local key = KEYS[1]
	local rate = tonumber(ARGV[1])
	local burst = tonumber(ARGV[2])
	local now = tonumber(ARGV[3])
	local requested = 1

	local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
	local tokens = tonumber(bucket[1])
	if tokens == nil then
		tokens = burst
	end
	local last_refill = tonumber(bucket[2])
	if last_refill == nil then
		last_refill = now
	end

	local elapsed = now - last_refill
	tokens = math.min(burst, tokens + elapsed * rate)
	local ttl = math.max(1, math.ceil(burst / rate))

	if tokens >= requested then
		tokens = tokens - requested
		redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
		redis.call('EXPIRE', key, ttl)
		return {1, math.floor(tokens)}
	else
		local retry_after = math.ceil((requested - tokens) / rate)
		return {0, retry_after}
	end
`)

func checkTokenBucket(ctx context.Context, rdb *redis.Client, key string, rate float64, burst int, now int64) (bool, int, int, error) {
	result, err := tokenBucketScript.Run(ctx, rdb, []string{key}, rate, burst, now).Result()
	if err != nil {
		return false, 0, 0, fmt.Errorf("redis token bucket: %w", err)
	}

	values, ok := result.([]interface{})
	if !ok || len(values) != 2 {
		return false, 0, 0, fmt.Errorf("unexpected redis response: %v", result)
	}

	allowed, _ := values[0].(int64)
	second, _ := values[1].(int64)

	if allowed == 1 {
		return true, int(second), 0, nil
	}
	return false, 0, int(second), nil
}

func setRateLimitHeaders(w http.ResponseWriter, limit int, remaining int, resetUnix int64) {
	w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
	w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
	w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(resetUnix, 10))
}
