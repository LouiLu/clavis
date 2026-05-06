package logging

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"platform/gateway/internal/middleware"
)

type Client struct {
	ch            chan []middleware.LogEntry
	done          chan struct{}
	flushInterval time.Duration
	batchSize     int
	httpClient    *http.Client
	endpoint      string
	dropped       atomic.Int64
}

func NewClient(endpoint string, channelSize, batchSize int, flushInterval time.Duration) *Client {
	c := &Client{
		ch:            make(chan []middleware.LogEntry, channelSize),
		done:          make(chan struct{}),
		flushInterval: flushInterval,
		batchSize:     batchSize,
		httpClient:    &http.Client{Timeout: 5 * time.Second},
		endpoint:      endpoint,
	}
	go c.run()
	return c
}

func (c *Client) Send(entries []middleware.LogEntry) {
	select {
	case c.ch <- entries:
	default:
		c.dropped.Add(int64(len(entries)))
	}
}

func (c *Client) Dropped() int64 {
	return c.dropped.Load()
}

func (c *Client) run() {
	var acc []middleware.LogEntry
	timer := time.NewTimer(c.flushInterval)
	defer timer.Stop()

	for {
		select {
		case entries := <-c.ch:
			acc = append(acc, entries...)
			if len(acc) >= c.batchSize {
				c.flush(acc)
				acc = nil
				timer.Reset(c.flushInterval)
			}
		case <-timer.C:
			if len(acc) > 0 {
				c.flush(acc)
				acc = nil
			}
			timer.Reset(c.flushInterval)
		case <-c.done:
			if len(acc) > 0 {
				c.flush(acc)
			}
			return
		}
	}
}

func (c *Client) flush(entries []middleware.LogEntry) {
	body, err := json.Marshal(map[string]any{"entries": entries})
	if err != nil {
		log.Printf("logging client: marshal error: %v", err)
		return
	}

	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*100) * time.Millisecond)
		}

		req, err := http.NewRequest(http.MethodPost, c.endpoint, bytes.NewReader(body))
		if err != nil {
			log.Printf("logging client: create request error: %v", err)
			return
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			log.Printf("logging client: post error (attempt %d): %v", attempt+1, err)
			continue
		}
		resp.Body.Close()

		if resp.StatusCode < 300 {
			return
		}

		if resp.StatusCode >= 500 {
			log.Printf("logging client: server error %d (attempt %d)", resp.StatusCode, attempt+1)
			continue
		}

		log.Printf("logging client: unexpected status %d, dropping batch", resp.StatusCode)
		return
	}

	log.Printf("logging client: dropping %d entries after retries", len(entries))
}

func (c *Client) Shutdown() {
	close(c.done)
}

var _ middleware.LogSender = (*Client)(nil)
