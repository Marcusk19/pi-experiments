package tui

import (
	"fmt"
	"strings"
	"time"

	"github.com/Marcusk19/agent-base/internal/monitorapi"
	"github.com/charmbracelet/lipgloss"
)

func (m Model) View() string {
	if m.width < 60 || m.height < 16 {
		return center(m.width, m.height, "Agent Activity Hub\n\nRequires at least 60×16")
	}
	if m.blocked != nil {
		return center(m.width, m.height, "Agent Activity Hub\n\nProtocol mismatch\n"+m.blocked.Error()+"\n\nq quit")
	}
	header := fmt.Sprintf("Agent Activity Hub  ·  %d live", m.snapshot.TotalSessions)
	if m.stale {
		header += "  ·  STALE"
	}
	if m.snapshot.Truncated {
		header += fmt.Sprintf("  ·  showing %d", len(m.snapshot.Sessions))
	}
	if m.lastError != nil {
		header += "\n" + m.lastError.Error()
	}
	if m.filtering {
		header += "\n/ " + m.filter.View()
	} else if m.filter.Value() != "" {
		header += "\nfilter: " + m.filter.Value()
	}
	body := ""
	if m.width >= 100 {
		left := m.listView(m.width/2 - 2)
		right := m.detailView(m.width - m.width/2 - 3)
		body = lipgloss.JoinHorizontal(lipgloss.Top, left, right)
	} else if m.detailScreen {
		body = m.detailView(m.width - 2)
	} else {
		body = m.listView(m.width - 2)
	}
	footer := "/ filter   s sort   r refresh   ? help   q quit"
	if m.help {
		footer = "↑/k ↓/j navigate · Enter detail · Esc back · / filter · s sort · r rediscover · q quit"
	}
	return lipgloss.NewStyle().Padding(0, 1).Render(header + "\n" + body + "\n" + footer)
}

func (m Model) listView(width int) string {
	title := style(m.options.Color, "12", true).Render("Sessions")
	rows := []string{title}
	if len(m.sessions) == 0 {
		rows = append(rows, "\nNo matching live sessions.")
		return panel(width, m.height-6, strings.Join(rows, "\n"))
	}
	for i, s := range m.sessions {
		glyph, label := status(s)
		name := clip(s.DisplayName, 18)
		activity := clip(s.ActivitySummary, max(12, width-38))
		row := fmt.Sprintf("%s %-18s %-9s %s", glyph, name, label, activity)
		if i == m.selected {
			row = lipgloss.NewStyle().Bold(true).Reverse(true).Render(row)
		}
		rows = append(rows, row)
	}
	return panel(width, m.height-6, strings.Join(rows, "\n"))
}
func (m Model) detailView(width int) string {
	if m.detail == nil {
		text := "Session detail\n\n"
		if m.selectedID == "" {
			text += "Select a session."
		} else {
			text += m.spinner.View() + " Loading…"
		}
		return panel(width, m.height-6, text)
	}
	d := m.detail
	lines := []string{style(m.options.Color, "12", true).Render("Session detail"), fmt.Sprintf("%s · %s %s", d.DisplayName, d.Adapter, d.AdapterVersion), clip(d.CWD, width-4), "", statusText(d.State, d.AttentionReasons), d.ActivitySummary, ""}
	if len(d.Tools) > 0 {
		lines = append(lines, "Tools")
		for _, tool := range d.Tools {
			lines = append(lines, fmt.Sprintf("  %-10s %s", tool.Status, clip(tool.ToolName, width-18)))
		}
	}
	if len(d.Tasks) > 0 {
		lines = append(lines, "Tasks")
		for _, task := range d.Tasks {
			lines = append(lines, fmt.Sprintf("  %-10s %-6s %s", task.State, task.Role, clip(task.TaskID, width-24)))
		}
	}
	if len(d.Timeline) > 0 {
		lines = append(lines, "Recent activity")
		for _, event := range d.Timeline {
			lines = append(lines, fmt.Sprintf("  %s  %s", time.UnixMilli(event.Timestamp).Format("15:04"), clip(event.Label, width-12)))
		}
	}
	return panel(width, m.height-6, strings.Join(lines, "\n"))
}
func status(s monitorapi.SessionSummary) (string, string) {
	if len(s.AttentionReasons) > 0 {
		return "!", "attention"
	}
	switch s.State {
	case "running":
		return "●", "running"
	case "waiting":
		return "◐", "waiting"
	default:
		return "○", "idle"
	}
}
func statusText(state string, reasons []string) string {
	if len(reasons) > 0 {
		return "attention: " + strings.Join(reasons, ", ")
	}
	return state
}
func panel(width, height int, content string) string {
	return lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).Width(max(1, width-2)).Height(max(1, height-2)).Padding(0, 1).Render(content)
}
func style(color bool, foreground string, bold bool) lipgloss.Style {
	s := lipgloss.NewStyle().Bold(bold)
	if color {
		s = s.Foreground(lipgloss.Color(foreground))
	}
	return s
}
func clip(value string, n int) string {
	r := []rune(value)
	if len(r) <= n {
		return value
	}
	if n < 2 {
		return string(r[:max(0, n)])
	}
	return string(r[:n-1]) + "…"
}
func center(width, height int, value string) string {
	return lipgloss.Place(max(1, width), max(1, height), lipgloss.Center, lipgloss.Center, value)
}
