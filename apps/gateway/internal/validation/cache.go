package validation

import (
	"fmt"
	"sync"
	"time"
)

type cacheEntry struct {
	result    *ValidationResult
	expiresAt time.Time
}

// CachingClient wraps a Client with an in-memory TTL cache. It implements
// both the middleware.Validator and middleware.QueryKeyLookup interfaces.
type CachingClient struct {
	inner       *Client
	ttl         time.Duration
	negativeTTL time.Duration
	mu          sync.RWMutex
	entries     map[string]*cacheEntry
	stopCh      chan struct{}
}

// NewCachingClient creates a caching wrapper around the given Client.
func NewCachingClient(inner *Client, ttl, negativeTTL time.Duration) *CachingClient {
	c := &CachingClient{
		inner:       inner,
		ttl:         ttl,
		negativeTTL: negativeTTL,
		entries:     make(map[string]*cacheEntry),
		stopCh:      make(chan struct{}),
	}
	go c.cleanup()
	return c
}

// Stop signals the background cleanup goroutine to exit.
func (c *CachingClient) Stop() {
	close(c.stopCh)
}

func (c *CachingClient) Validate(input Input) (*ValidationResult, error) {
	key := fmt.Sprintf("v:%s:%s", input.APIKey, input.ServiceSlug)
	return c.getOrFetch(key, func() (*ValidationResult, error) {
		return c.inner.Validate(input)
	})
}

func (c *CachingClient) Lookup(input LookupInput) (*ValidationResult, error) {
	key := fmt.Sprintf("l:%s", input.APIKey)
	return c.getOrFetch(key, func() (*ValidationResult, error) {
		return c.inner.Lookup(input)
	})
}

func (c *CachingClient) getOrFetch(key string, fetch func() (*ValidationResult, error)) (*ValidationResult, error) {
	c.mu.RLock()
	if entry, ok := c.entries[key]; ok && time.Now().Before(entry.expiresAt) {
		result := entry.result
		c.mu.RUnlock()
		return result, nil
	}
	c.mu.RUnlock()

	result, err := fetch()
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	ttl := c.ttl
	if !result.Valid {
		ttl = c.negativeTTL
	}
	c.entries[key] = &cacheEntry{
		result:    result,
		expiresAt: time.Now().Add(ttl),
	}
	c.mu.Unlock()

	return result, nil
}

func (c *CachingClient) cleanup() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.stopCh:
			return
		case <-ticker.C:
			c.mu.Lock()
			now := time.Now()
			for k, entry := range c.entries {
				if now.After(entry.expiresAt) {
					delete(c.entries, k)
				}
			}
			c.mu.Unlock()
		}
	}
}
