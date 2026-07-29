package monitorapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type ErrorKind string

const (
	ErrorUnavailable  ErrorKind = "unavailable"
	ErrorUnauthorized ErrorKind = "unauthorized"
	ErrorProtocol     ErrorKind = "protocol"
	ErrorMalformed    ErrorKind = "malformed"
	ErrorNotFound     ErrorKind = "not_found"
)

type Error struct {
	Kind   ErrorKind
	Status int
	Err    error
}

func (e *Error) Error() string { return e.Err.Error() }
func (e *Error) Unwrap() error { return e.Err }

type Discoverer interface {
	Discover(context.Context) (DiscoveryRecord, error)
}

type Client struct {
	http       *http.Client
	discoverer Discoverer
	mu         sync.Mutex
	record     *DiscoveryRecord
}

func NewClient(httpClient *http.Client, discoverer Discoverer) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 35 * time.Second}
	}
	return &Client{http: httpClient, discoverer: discoverer}
}

func (c *Client) RefreshDiscovery(ctx context.Context) error {
	record, err := c.discoverer.Discover(ctx)
	if err != nil {
		kind := ErrorUnavailable
		if errors.Is(err, ErrProtocolMismatch) {
			kind = ErrorProtocol
		}
		return &Error{Kind: kind, Err: err}
	}
	c.mu.Lock()
	c.record = &record
	c.mu.Unlock()
	return nil
}

func (c *Client) Snapshot(ctx context.Context, after *int64, wait time.Duration) (Snapshot, error) {
	path := "/monitor/v1/snapshot"
	query := url.Values{}
	if after != nil {
		query.Set("after", fmt.Sprint(*after))
	}
	if wait > 30*time.Second {
		wait = 30 * time.Second
	}
	if wait > 0 {
		query.Set("wait", fmt.Sprint(wait.Milliseconds()))
	}
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	data, err := c.getWithRediscovery(ctx, path)
	if err != nil {
		return Snapshot{}, err
	}
	result, err := DecodeSnapshot(data)
	if err != nil {
		return Snapshot{}, &Error{Kind: ErrorMalformed, Err: err}
	}
	return result, nil
}

func (c *Client) Detail(ctx context.Context, monitorID string) (SessionDetail, error) {
	data, err := c.getWithRediscovery(ctx, "/monitor/v1/sessions/"+url.PathEscape(monitorID))
	if err != nil {
		return SessionDetail{}, err
	}
	result, err := DecodeDetail(data)
	if err != nil {
		return SessionDetail{}, &Error{Kind: ErrorMalformed, Err: err}
	}
	return result, nil
}

func (c *Client) getWithRediscovery(ctx context.Context, path string) ([]byte, error) {
	for attempt := 0; attempt < 2; attempt++ {
		if c.current() == nil {
			if err := c.RefreshDiscovery(ctx); err != nil {
				return nil, err
			}
		}
		data, err := c.get(ctx, path)
		if err == nil {
			return data, nil
		}
		var apiErr *Error
		if !errors.As(err, &apiErr) || (apiErr.Kind != ErrorUnauthorized && apiErr.Kind != ErrorUnavailable) || attempt == 1 {
			return nil, err
		}
		c.mu.Lock()
		c.record = nil
		c.mu.Unlock()
	}
	panic("unreachable")
}

func (c *Client) current() *DiscoveryRecord {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.record == nil {
		return nil
	}
	copy := *c.record
	return &copy
}

func (c *Client) get(ctx context.Context, path string) ([]byte, error) {
	record := c.current()
	if record == nil {
		return nil, &Error{Kind: ErrorUnavailable, Err: ErrHubNotRunning}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimSuffix(record.Endpoint, "/")+path, nil)
	if err != nil {
		return nil, &Error{Kind: ErrorUnavailable, Err: err}
	}
	req.Header.Set("Authorization", "Bearer "+record.Capability)
	req.Header.Set("Accept", "application/json")
	response, err := c.http.Do(req)
	if err != nil {
		return nil, &Error{Kind: ErrorUnavailable, Err: fmt.Errorf("Agent Activity Hub unavailable: %w", err)}
	}
	defer response.Body.Close()
	data, readErr := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if readErr != nil {
		return nil, &Error{Kind: ErrorMalformed, Status: response.StatusCode, Err: readErr}
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 {
		return data, nil
	}
	kind := ErrorUnavailable
	if response.StatusCode == http.StatusUnauthorized {
		kind = ErrorUnauthorized
	}
	if response.StatusCode == http.StatusNotFound {
		kind = ErrorNotFound
	}
	if response.StatusCode == http.StatusPreconditionFailed || response.StatusCode == http.StatusUpgradeRequired {
		kind = ErrorProtocol
	}
	return nil, &Error{Kind: kind, Status: response.StatusCode, Err: fmt.Errorf("Agent Activity Hub request failed with status %d", response.StatusCode)}
}
