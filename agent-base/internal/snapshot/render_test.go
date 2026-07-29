package snapshot

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/Marcusk19/agent-base/internal/monitorapi"
)

func sample() monitorapi.Snapshot {
	return monitorapi.Snapshot{APIVersion: "monitor/v1", GeneratedAt: 1000, TotalSessions: 1, Sessions: []monitorapi.SessionSummary{{MonitorID: strings.Repeat("a", 32), DisplayName: "fix-auth", Adapter: "pi", Workspace: "agent-base", State: "running", ActivitySummary: "Running tests", ActivitySince: 1000, Completeness: monitorapi.Completeness{}}}}
}
func TestRenderResponsive(t *testing.T) {
	for _, tc := range []struct {
		width              int
		contains, excludes string
	}{{120, "HARNESS", ""}, {80, "WORKSPACE", "HARNESS"}, {60, "ACTIVITY", "WORKSPACE"}} {
		var out bytes.Buffer
		if err := Render(&out, sample(), Options{Width: tc.width, Now: time.UnixMilli(61_000)}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out.String(), tc.contains) {
			t.Fatalf("width %d: %s", tc.width, out.String())
		}
		if tc.excludes != "" && strings.Contains(out.String(), tc.excludes) {
			t.Fatalf("width %d retained %s", tc.width, tc.excludes)
		}
	}
}
func TestRenderJSONStable(t *testing.T) {
	var out bytes.Buffer
	if err := RenderJSON(&out, sample()); err != nil {
		t.Fatal(err)
	}
	var got monitorapi.Snapshot
	if err := json.Unmarshal(out.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.TotalSessions != 1 {
		t.Fatal(got.TotalSessions)
	}
}
