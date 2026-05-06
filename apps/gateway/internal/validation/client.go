package validation

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Input struct {
	APIKey      string `json:"api_key"`
	ServiceSlug string `json:"service_slug"`
	Method      string `json:"method,omitempty"`
	Path        string `json:"path,omitempty"`
}

type ValidationResult struct {
	Valid          bool                  `json:"valid"`
	Reason         string                `json:"reason,omitempty"`
	Organization   *OrganizationRef      `json:"organization,omitempty"`
	APIKey         *APIKeyRef            `json:"api_key,omitempty"`
	BackendService *BackendServiceDetail `json:"backend_service,omitempty"`
	RateLimit      *RateLimitPolicy      `json:"rate_limit,omitempty"`
}

type OrganizationRef struct {
	ID string `json:"id"`
}

type APIKeyRef struct {
	ID     string `json:"id"`
	Prefix string `json:"prefix"`
}

type RouteRule struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

type BackendServiceDetail struct {
	ID            string      `json:"id"`
	Slug          string      `json:"slug"`
	BaseURL       string      `json:"base_url"`
	AllowedRoutes []RouteRule `json:"allowed_routes"`
}

type RateLimitPolicy struct {
	RequestsPerInterval int `json:"requests_per_interval"`
	IntervalSeconds     int `json:"interval_seconds"`
	BurstSize           int `json:"burst_size"`
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(controlPlaneURL string) *Client {
	return &Client{
		baseURL: controlPlaneURL,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

type LookupInput struct {
	APIKey string `json:"api_key"`
}

func (c *Client) Lookup(input LookupInput) (*ValidationResult, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("marshal lookup request: %w", err)
	}

	url := fmt.Sprintf("%s/internal/v1/api-keys/lookup", c.baseURL)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create lookup request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call control plane lookup: %w", err)
	}
	defer resp.Body.Close()

	var result ValidationResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode lookup response: %w", err)
	}

	return &result, nil
}

func (c *Client) Validate(input Input) (*ValidationResult, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("marshal validation request: %w", err)
	}

	url := fmt.Sprintf("%s/internal/v1/api-keys/validate", c.baseURL)
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create validation request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call control plane: %w", err)
	}
	defer resp.Body.Close()

	var result ValidationResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode validation response: %w", err)
	}

	return &result, nil
}
