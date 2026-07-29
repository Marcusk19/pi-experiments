package monitorapi

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoveryPathAndRead(t *testing.T) {
	root := t.TempDir()
	options := DiscoveryOptions{XDGRunDir: root, TempDir: t.TempDir(), UID: 42}
	path := DiscoveryPath(options)
	want := filepath.Join(root, "agent-activity-hub", "monitor.json")
	if path != want {
		t.Fatalf("path=%q", path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	data := fixture(t, "valid-discovery.json")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	record, err := Discover(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	if record.APIVersion != APIVersion {
		t.Fatalf("version=%q", record.APIVersion)
	}
}
func TestDiscoveryDoesNotDeleteMalformedFile(t *testing.T) {
	root := t.TempDir()
	options := DiscoveryOptions{XDGRunDir: root, TempDir: t.TempDir(), UID: 42}
	path := DiscoveryPath(options)
	_ = os.MkdirAll(filepath.Dir(path), 0o700)
	_ = os.WriteFile(path, []byte("bad"), 0o600)
	if _, err := Discover(context.Background(), options); err == nil {
		t.Fatal("expected error")
	}
	data, _ := os.ReadFile(path)
	if string(data) != "bad" {
		t.Fatal("discovery was changed")
	}
}
