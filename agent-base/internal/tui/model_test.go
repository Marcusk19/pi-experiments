package tui

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/Marcusk19/agent-base/internal/monitorapi"
	tea "github.com/charmbracelet/bubbletea"
)

type fakeAPI struct{}

func (fakeAPI) Snapshot(context.Context, *int64, time.Duration) (monitorapi.Snapshot, error) {
	return monitorapi.Snapshot{}, nil
}
func (fakeAPI) Detail(context.Context, string) (monitorapi.SessionDetail, error) {
	return monitorapi.SessionDetail{}, nil
}
func (fakeAPI) RefreshDiscovery(context.Context) error { return nil }
func TestResponsiveViews(t *testing.T) {
	m := New(fakeAPI{}, Options{Now: func() time.Time { return time.UnixMilli(2000) }, Jitter: func(time.Duration) time.Duration { return 0 }})
	m.snapshot = monitorapi.Snapshot{TotalSessions: 1, Sessions: []monitorapi.SessionSummary{{MonitorID: strings.Repeat("a", 32), DisplayName: "worker", Adapter: "pi", Workspace: "repo", State: "running", ActivitySummary: "Testing", AttentionReasons: []string{"tool failed"}}}}
	m.applySessions()
	for _, tc := range []struct {
		w, h int
		want string
	}{{120, 24, "Session detail"}, {80, 24, "Sessions"}, {59, 24, "Requires at least 60×16"}, {80, 15, "Requires at least 60×16"}} {
		next, _ := m.Update(tea.WindowSizeMsg{Width: tc.w, Height: tc.h})
		view := next.(Model).View()
		if !strings.Contains(view, tc.want) {
			t.Fatalf("%dx%d missing %q: %s", tc.w, tc.h, tc.want, view)
		}
	}
}
func TestFilterSyntax(t *testing.T) {
	values := []monitorapi.SessionSummary{{DisplayName: "one", Adapter: "pi", Workspace: "repo", State: "running"}, {DisplayName: "two", Adapter: "claude", Workspace: "docs", State: "idle"}}
	got := filterSessions(values, "harness:pi state:running")
	if len(got) != 1 || got[0].DisplayName != "one" {
		t.Fatalf("got %#v", got)
	}
}
