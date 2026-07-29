package snapshot

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Marcusk19/agent-base/internal/monitorapi"
	"github.com/charmbracelet/lipgloss"
)

type Options struct {
	Width int
	Color bool
	Wide  bool
	Now   time.Time
}

func RenderJSON(w io.Writer, value monitorapi.Snapshot) error {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func Render(w io.Writer, value monitorapi.Snapshot, options Options) error {
	if options.Width <= 0 {
		options.Width = 100
	}
	if options.Now.IsZero() {
		options.Now = time.Now()
	}
	title := "AGENT ACTIVITY"
	summary := fmt.Sprintf("%d live · updated %s", value.TotalSessions, age(options.Now, value.GeneratedAt))
	if options.Color {
		title = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("12")).Render(title)
	}
	fmt.Fprintf(w, "%s  %s\n\n", title, summary)
	var headers []string
	if options.Width >= 100 || options.Wide {
		headers = []string{"SESSION", "HARNESS", "WORKSPACE", "STATE", "ACTIVITY", "AGE"}
	} else if options.Width >= 70 {
		headers = []string{"SESSION", "WORKSPACE", "STATE", "ACTIVITY", "AGE"}
	} else {
		headers = []string{"SESSION", "STATE", "ACTIVITY", "AGE"}
	}
	fmt.Fprintln(w, strings.Join(headers, "  "))
	if len(value.Sessions) == 0 {
		fmt.Fprintln(w, "No live sessions.")
		return nil
	}
	for _, session := range value.Sessions {
		name := truncate(session.DisplayName, 18)
		workspace := truncate(session.Workspace, 16)
		activity := truncate(session.ActivitySummary, max(16, options.Width/3))
		state := session.State
		if len(session.AttentionReasons) > 0 {
			state = "attention"
		}
		if options.Color {
			state = stateStyle(state).Render(state)
		}
		fields := []string{name}
		if options.Width >= 100 || options.Wide {
			fields = append(fields, truncate(session.Adapter, 10), workspace)
		} else if options.Width >= 70 {
			fields = append(fields, workspace)
		}
		fields = append(fields, state, activity, age(options.Now, session.ActivitySince))
		fmt.Fprintln(w, strings.Join(fields, "  "))
	}
	if value.Truncated {
		fmt.Fprintf(w, "\nShowing %d of %d live sessions.\n", len(value.Sessions), value.TotalSessions)
	}
	return nil
}

func stateStyle(state string) lipgloss.Style {
	color := "8"
	switch state {
	case "running":
		color = "10"
	case "waiting":
		color = "11"
	case "attention":
		color = "9"
	}
	return lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Bold(state == "attention")
}
func age(now time.Time, milliseconds int64) string {
	d := now.Sub(time.UnixMilli(milliseconds))
	if d < 0 {
		d = 0
	}
	if d < time.Minute {
		return "now"
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%dh", int(d.Hours()))
}
func truncate(value string, limit int) string {
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	runes := []rune(value)
	return string(runes[:max(1, limit-1)]) + "…"
}
