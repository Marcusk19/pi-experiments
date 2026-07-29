package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/Marcusk19/agent-base/internal/monitorapi"
)

type fakeAPI struct {
	snapshot monitorapi.Snapshot
	err      error
}

func (f fakeAPI) Snapshot(context.Context, *int64, time.Duration) (monitorapi.Snapshot, error) {
	return f.snapshot, f.err
}
func (f fakeAPI) Detail(context.Context, string) (monitorapi.SessionDetail, error) {
	return monitorapi.SessionDetail{}, nil
}
func (f fakeAPI) RefreshDiscovery(context.Context) error { return nil }
func deps(api API) (dependencies, *bytes.Buffer, *bytes.Buffer) {
	out, errOut := &bytes.Buffer{}, &bytes.Buffer{}
	return dependencies{out: out, err: errOut, getenv: func(string) string { return "" }, width: func() int { return 100 }, api: api, runTUI: func(API, bool) error { return nil }, now: func() time.Time { return time.UnixMilli(1000) }}, out, errOut
}
func TestDefaultIsTUI(t *testing.T) {
	api := fakeAPI{snapshot: monitorapi.Snapshot{APIVersion: "monitor/v1", TotalSessions: 0, Sessions: []monitorapi.SessionSummary{}}}
	tuiCalled := false
	d, _, _ := deps(api)
	d.runTUI = func(API, bool) error { tuiCalled = true; return nil }
	if code := run(context.Background(), nil, d); code != 0 {
		t.Fatalf("code=%d", code)
	}
	if !tuiCalled {
		t.Fatal("expected TUI to be launched by default")
	}
}
func TestListAndJSON(t *testing.T) {
	api := fakeAPI{snapshot: monitorapi.Snapshot{APIVersion: "monitor/v1", TotalSessions: 0, Sessions: []monitorapi.SessionSummary{}}}
	d, out, _ := deps(api)
	if code := run(context.Background(), []string{"list"}, d); code != 0 || !strings.Contains(out.String(), "No live sessions") {
		t.Fatalf("code=%d out=%q", code, out.String())
	}
	d, out, _ = deps(api)
	if code := run(context.Background(), []string{"list", "--json"}, d); code != 0 || !strings.Contains(out.String(), `"apiVersion": "monitor/v1"`) {
		t.Fatalf("code=%d out=%q", code, out.String())
	}
}
func TestExitClasses(t *testing.T) {
	d, _, _ := deps(fakeAPI{err: &monitorapi.Error{Kind: monitorapi.ErrorProtocol, Err: errors.New("upgrade")}})
	if code := run(context.Background(), []string{"list"}, d); code != 3 {
		t.Fatal(code)
	}
	d, _, _ = deps(fakeAPI{})
	if code := run(context.Background(), []string{"list", "--bad"}, d); code != 2 {
		t.Fatal(code)
	}
}
