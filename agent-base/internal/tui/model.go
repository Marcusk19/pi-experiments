package tui

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"time"

	"github.com/Marcusk19/agent-base/internal/monitorapi"
	"github.com/charmbracelet/bubbles/spinner"
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

type API interface {
	Snapshot(context.Context, *int64, time.Duration) (monitorapi.Snapshot, error)
	Detail(context.Context, string) (monitorapi.SessionDetail, error)
	RefreshDiscovery(context.Context) error
}
type Options struct {
	Color  bool
	Now    func() time.Time
	Jitter func(time.Duration) time.Duration
}
type snapshotMsg struct {
	value monitorapi.Snapshot
	err   error
}
type detailMsg struct {
	id    string
	value monitorapi.SessionDetail
	err   error
}
type retryMsg struct{}
type refreshedMsg struct{ err error }
type sortMode int

const (
	sortHub sortMode = iota
	sortAge
	sortHarness
	sortWorkspace
	sortName
)

type Model struct {
	api                           API
	options                       Options
	snapshot                      monitorapi.Snapshot
	sessions                      []monitorapi.SessionSummary
	selected                      int
	selectedID                    string
	detail                        *monitorapi.SessionDetail
	pendingDetail                 string
	width, height                 int
	stale                         bool
	lastError                     error
	blocked                       error
	retries                       int
	sort                          sortMode
	filter                        textinput.Model
	viewport                      viewport.Model
	spinner                       spinner.Model
	filtering, help, detailScreen bool
}

func New(api API, options Options) Model {
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.Jitter == nil {
		options.Jitter = func(d time.Duration) time.Duration {
			return time.Duration(rand.Int63n(int64(max(d/4, time.Millisecond))))
		}
	}
	input := textinput.New()
	input.Placeholder = "filter (state:, harness:, workspace:)"
	input.CharLimit = 160
	spin := spinner.New()
	spin.Spinner = spinner.Dot
	return Model{api: api, options: options, filter: input, viewport: viewport.New(0, 0), spinner: spin}
}

func (m Model) Init() tea.Cmd { return tea.Batch(m.loadSnapshot(nil, 0), m.spinner.Tick) }
func (m Model) loadSnapshot(after *int64, wait time.Duration) tea.Cmd {
	return func() tea.Msg { v, e := m.api.Snapshot(context.Background(), after, wait); return snapshotMsg{v, e} }
}
func (m Model) loadDetail(id string) tea.Cmd {
	return func() tea.Msg { v, e := m.api.Detail(context.Background(), id); return detailMsg{id, v, e} }
}

func (m Model) Update(message tea.Msg) (tea.Model, tea.Cmd) {
	var commands []tea.Cmd
	switch msg := message.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		m.viewport.Width = max(1, msg.Width/2-4)
		m.viewport.Height = max(1, msg.Height-8)
	case snapshotMsg:
		if msg.err != nil {
			m.stale = true
			m.lastError = msg.err
			var e *monitorapi.Error
			if errors.As(msg.err, &e) && e.Kind == monitorapi.ErrorProtocol {
				m.blocked = msg.err
				return m, nil
			}
			m.retries++
			commands = append(commands, m.retryCmd())
			break
		}
		previousRevision := m.snapshot.Revision
		previousDaemon := m.snapshot.DaemonID
		hadSnapshot := previousDaemon != ""
		m.snapshot = msg.value
		m.stale = false
		m.lastError = nil
		m.retries = 0
		m.applySessions()
		if m.selectedID != "" && (!hadSnapshot || previousRevision != m.snapshot.Revision || previousDaemon != m.snapshot.DaemonID || m.detail == nil) {
			m.pendingDetail = m.selectedID
			commands = append(commands, m.loadDetail(m.selectedID))
		}
		revision := m.snapshot.Revision
		commands = append(commands, m.loadSnapshot(&revision, 25*time.Second))
	case detailMsg:
		if msg.id == m.selectedID && msg.err == nil {
			m.detail = &msg.value
			m.pendingDetail = ""
			m.syncViewport()
		}
	case retryMsg:
		commands = append(commands, m.loadSnapshot(nil, 0))
	case refreshedMsg:
		if msg.err != nil {
			m.lastError = msg.err
			m.stale = true
			commands = append(commands, m.retryCmd())
		} else {
			commands = append(commands, m.loadSnapshot(nil, 0))
		}
	case spinner.TickMsg:
		m.spinner, commands = appendSpinner(m.spinner, commands, msg)
	case tea.KeyMsg:
		if m.filtering {
			return m.updateFilter(msg)
		}
		switch msg.String() {
		case "q", "ctrl+c":
			return m, tea.Quit
		case "?":
			m.help = !m.help
		case "/":
			m.filtering = true
			m.filter.Focus()
			return m, textinput.Blink
		case "up", "k":
			m.move(-1)
		case "down", "j":
			m.move(1)
		case "enter":
			if m.width < 100 && m.selectedID != "" {
				m.detailScreen = true
			}
		case "esc":
			m.detailScreen = false
		case "s":
			m.sort = (m.sort + 1) % 5
			m.applySessions()
		case "r":
			commands = append(commands, func() tea.Msg { return refreshedMsg{m.api.RefreshDiscovery(context.Background())} })
		}
	}
	return m, tea.Batch(commands...)
}

func appendSpinner(s spinner.Model, cmds []tea.Cmd, msg spinner.TickMsg) (spinner.Model, []tea.Cmd) {
	var cmd tea.Cmd
	s, cmd = s.Update(msg)
	return s, append(cmds, cmd)
}
func (m Model) retryCmd() tea.Cmd {
	d := 250 * time.Millisecond * time.Duration(1<<min(m.retries-1, 5))
	if d > 10*time.Second {
		d = 10 * time.Second
	}
	d += m.options.Jitter(d)
	return tea.Tick(d, func(time.Time) tea.Msg { return retryMsg{} })
}
func (m Model) updateFilter(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	if msg.String() == "esc" || msg.String() == "enter" {
		m.filtering = false
		m.filter.Blur()
		m.applySessions()
		return m, nil
	}
	var cmd tea.Cmd
	m.filter, cmd = m.filter.Update(msg)
	m.applySessions()
	return m, cmd
}
func (m *Model) move(delta int) {
	if len(m.sessions) == 0 {
		return
	}
	m.selected = max(0, min(len(m.sessions)-1, m.selected+delta))
	m.selectCurrent()
}
func (m *Model) selectCurrent() {
	if len(m.sessions) == 0 {
		m.selected = 0
		m.selectedID = ""
		m.detail = nil
		return
	}
	m.selectedID = m.sessions[m.selected].MonitorID
}
func (m *Model) applySessions() {
	previous := m.selectedID
	m.sessions = filterSessions(m.snapshot.Sessions, m.filter.Value())
	sortSessions(m.sessions, m.sort)
	m.selected = 0
	for i, s := range m.sessions {
		if s.MonitorID == previous {
			m.selected = i
			break
		}
	}
	if m.selected >= len(m.sessions) {
		m.selected = max(0, len(m.sessions)-1)
	}
	m.selectCurrent()
}
func filterSessions(values []monitorapi.SessionSummary, query string) []monitorapi.SessionSummary {
	result := []monitorapi.SessionSummary{}
	tokens := strings.Fields(strings.ToLower(query))
	for _, v := range values {
		ok := true
		blob := strings.ToLower(v.DisplayName + " " + v.Adapter + " " + v.Workspace + " " + v.State + " " + v.ActivitySummary)
		for _, t := range tokens {
			field, value, found := strings.Cut(t, ":")
			if found {
				var candidate string
				switch field {
				case "state":
					candidate = v.State
				case "harness":
					candidate = v.Adapter
				case "workspace":
					candidate = v.Workspace
				default:
					candidate = blob
				}
				if !strings.Contains(strings.ToLower(candidate), value) {
					ok = false
				}
			} else if !strings.Contains(blob, t) {
				ok = false
			}
		}
		if ok {
			result = append(result, v)
		}
	}
	return result
}
func sortSessions(values []monitorapi.SessionSummary, mode sortMode) {
	if mode == sortHub {
		return
	}
	sort.SliceStable(values, func(i, j int) bool {
		a, b := values[i], values[j]
		switch mode {
		case sortAge:
			return a.ActivitySince > b.ActivitySince
		case sortHarness:
			return a.Adapter < b.Adapter
		case sortWorkspace:
			return a.Workspace < b.Workspace
		default:
			return a.DisplayName < b.DisplayName
		}
	})
}
func (m *Model) syncViewport() {
	if m.detail == nil {
		return
	}
	lines := []string{m.detail.CWD, "", m.detail.ActivitySummary, "", "Recent activity"}
	for _, e := range m.detail.Timeline {
		lines = append(lines, fmt.Sprintf("%s  %s", time.UnixMilli(e.Timestamp).Format("15:04"), e.Label))
	}
	m.viewport.SetContent(strings.Join(lines, "\n"))
}
