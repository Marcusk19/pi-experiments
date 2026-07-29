package monitorapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
)

var ErrHubNotRunning = errors.New("Agent Activity Hub is not running")
var ErrProtocolMismatch = errors.New("Agent Activity Hub monitor protocol is incompatible")

type DiscoveryOptions struct {
	XDGRunDir string
	TempDir   string
	UID       int
}

func DefaultDiscoveryOptions() DiscoveryOptions {
	return DiscoveryOptions{XDGRunDir: os.Getenv("XDG_RUNTIME_DIR"), TempDir: os.TempDir(), UID: os.Getuid()}
}

func DiscoveryPath(options DiscoveryOptions) string {
	if options.XDGRunDir != "" {
		return filepath.Join(options.XDGRunDir, "agent-activity-hub", "monitor.json")
	}
	return filepath.Join(options.TempDir, fmt.Sprintf("agent-activity-hub-%d", options.UID), "monitor.json")
}

func Discover(_ context.Context, options DiscoveryOptions) (DiscoveryRecord, error) {
	path := DiscoveryPath(options)
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return DiscoveryRecord{}, ErrHubNotRunning
	}
	if err != nil {
		return DiscoveryRecord{}, fmt.Errorf("read monitor discovery: %w", err)
	}
	if info.Mode().Perm()&0o077 != 0 {
		return DiscoveryRecord{}, fmt.Errorf("monitor discovery permissions must be user-only")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return DiscoveryRecord{}, fmt.Errorf("read monitor discovery: %w", err)
	}
	var versionProbe struct {
		APIVersion string `json:"apiVersion"`
	}
	if err := json.Unmarshal(data, &versionProbe); err == nil && versionProbe.APIVersion != "" && versionProbe.APIVersion != APIVersion {
		return DiscoveryRecord{}, fmt.Errorf("%w: client=%s server=%s", ErrProtocolMismatch, APIVersion, versionProbe.APIVersion)
	}
	record, err := DecodeDiscovery(data)
	if err != nil {
		return DiscoveryRecord{}, err
	}
	endpoint, err := url.Parse(record.Endpoint)
	if err != nil || endpoint.Scheme != "http" || (endpoint.Hostname() != "127.0.0.1" && endpoint.Hostname() != "::1") {
		return DiscoveryRecord{}, fmt.Errorf("monitor endpoint must be loopback HTTP")
	}
	return record, nil
}

type FileDiscoverer struct{ Options DiscoveryOptions }

func (d FileDiscoverer) Discover(ctx context.Context) (DiscoveryRecord, error) {
	return Discover(ctx, d.Options)
}
