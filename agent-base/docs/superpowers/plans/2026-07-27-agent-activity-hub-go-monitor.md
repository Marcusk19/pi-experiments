# Agent Activity Hub Go Monitor Implementation Plan

> **For agentic workers:** This plan is documentation only. Do not automatically invoke implementation subskills. If the user explicitly requests execution, ask them to choose an execution skill first. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and release the standalone `agent-hub` snapshot CLI and polished Charmbracelet TUI against the read-only monitor API.

**Architecture:** A Go monitor client discovers `monitor.json`, validates every response against canonical embedded JSON Schema, and exposes typed snapshot/detail methods. The default command renders once; a deterministic Bubble Tea model owns long-polling, selection, filters, detail loading, stale-state recovery, and responsive rendering.

**Tech Stack:** Go 1.24, Bubble Tea 1.3.10, Bubbles 0.21.0, Lip Gloss 1.1.0, `jsonschema/v6` 6.0.2, `x/term` 0.33.0, GitHub Actions.

## Global Constraints

- This plan starts after `2026-07-27-agent-activity-hub-monitor-api.md`; canonical files under `schemas/monitor/v1/` are the wire authority.
- Executable modes are exactly `agent-hub` (TUI, default), `agent-hub list`, `agent-hub list --json`, `agent-hub list --no-color`, `agent-hub list --wide`, and `agent-hub version`.
- The monitor never starts the daemon, registers a session, reads SQLite, mutates tasks, or persists credentials/data/history.
- Default discovery is `$XDG_RUNTIME_DIR/agent-activity-hub/monitor.json`; fallback is `${TMPDIR}/agent-activity-hub-${uid}/monitor.json`.
- TUI requests 25-second long-polls; waits never exceed 30 seconds.
- Retry starts at 250 ms, doubles with jitter, and caps at 10 seconds; protocol mismatch is blocking.
- Layout: split panes at width ≥100; list/detail screens at 60–99; minimum-size view below 60 columns or 16 rows.
- Color never carries meaning alone; `NO_COLOR` and `TERM=dumb` disable decorative color.
- Release targets are `darwin/arm64`, `darwin/amd64`, `linux/arm64`, and `linux/amd64`, with SHA-256 checksums.

---

### Task 1: Bootstrap Go and validate embedded monitor contracts

**Files:**
- Create: `go.mod`
- Create: `schemas/monitor/v1/embed.go`
- Create: `internal/monitorapi/types.go`
- Create: `internal/monitorapi/schema.go`
- Create: `internal/monitorapi/schema_test.go`

**Interfaces:**
- Consumes: canonical monitor JSON Schemas/fixtures from the TypeScript API plan.
- Produces: typed `Snapshot`, `SessionDetail`, `DiscoveryRecord` and `DecodeSnapshot`, `DecodeDetail`, `DecodeDiscovery`.

- [ ] **Step 1: Create the module and pin dependencies**

Create `go.mod`:

```go
module github.com/Marcusk19/agent-base

go 1.24.0

require (
    github.com/charmbracelet/bubbles v0.21.0
    github.com/charmbracelet/bubbletea v1.3.10
    github.com/charmbracelet/lipgloss v1.1.0
    github.com/santhosh-tekuri/jsonschema/v6 v6.0.2
    golang.org/x/term v0.33.0
)
```

Run: `go mod tidy`
Expected: `go.sum` is created with no import errors after subsequent Go files are added.

- [ ] **Step 2: Write failing schema fixture tests**

Create `schema_test.go` that iterates `monitorv1.Fixtures`, decodes valid snapshot/detail/discovery fixtures, rejects malformed known fields, and recursively rejects forbidden privacy keys. Core assertion:

```go
func TestSharedFixtures(t *testing.T) {
    tests := []struct{name, schema string; decode func([]byte) error}{
        {"valid-snapshot.json", "snapshot.schema.json", func(b []byte) error { _, err := DecodeSnapshot(b); return err }},
        {"valid-detail.json", "detail.schema.json", func(b []byte) error { _, err := DecodeDetail(b); return err }},
        {"valid-discovery.json", "discovery.schema.json", func(b []byte) error { _, err := DecodeDiscovery(b); return err }},
    }
    for _, tc := range tests { t.Run(tc.name, func(t *testing.T) {
        if err := tc.decode(monitorv1.Fixtures[tc.name]); err != nil { t.Fatal(err) }
    }) }
}
```

- [ ] **Step 3: Verify types and embedded package are absent**

Run: `go test ./internal/monitorapi`
Expected: FAIL because packages/functions do not exist.

- [ ] **Step 4: Embed canonical files from their own package directory**

Create `schemas/monitor/v1/embed.go`:

```go
package monitorv1

import "embed"

//go:embed *.schema.json
var Schemas embed.FS

//go:embed fixtures/*.json
var fixtureFS embed.FS

var Fixtures = map[string][]byte{}

func init() {
    entries, err := fixtureFS.ReadDir("fixtures")
    if err != nil { panic(err) }
    for _, entry := range entries {
        data, err := fixtureFS.ReadFile("fixtures/" + entry.Name())
        if err != nil { panic(err) }
        Fixtures[entry.Name()] = data
    }
}
```

- [ ] **Step 5: Define exact wire types**

In `types.go`, define JSON-tagged structs matching the canonical fields. Use `int64` for millisecond timestamps/revision and these central types:

```go
type SnapshotDaemon struct {
    ID string `json:"id"`; StartedAt int64 `json:"startedAt"`; Health string `json:"health"`
}
type DetailDaemon struct { ID string `json:"id"`; StartedAt int64 `json:"startedAt"` }
type Adapter struct { Name string `json:"name"`; Version string `json:"version"` }
type SummaryCompleteness struct {
    Activity string `json:"activity"`; Attention string `json:"attention"`
    Tools string `json:"tools"`; Tasks string `json:"tasks"`
}
type DetailCompleteness struct {
    Activity string `json:"activity"`; Attention string `json:"attention"`
    Tools string `json:"tools"`; Tasks string `json:"tasks"`; Timeline string `json:"timeline"`
}
type SessionSummary struct {
    MonitorID string `json:"monitorId"`; DisplayName string `json:"displayName"`
    Adapter string `json:"adapter"`; Workspace string `json:"workspace"`
    State string `json:"state"`; ActivitySummary string `json:"activitySummary"`
    ActivitySince int64 `json:"activitySince"`; AttentionReasons []string `json:"attentionReasons"`
    ActiveToolCount int `json:"activeToolCount"`; ActiveTaskState *string `json:"activeTaskState,omitempty"`
    Completeness SummaryCompleteness `json:"completeness"`
}
type Snapshot struct {
    APIVersion string `json:"apiVersion"`; Daemon SnapshotDaemon `json:"daemon"`
    Revision int64 `json:"revision"`; GeneratedAt int64 `json:"generatedAt"`
    TotalSessions int `json:"totalSessions"`; Truncated bool `json:"truncated"`
    Sessions []SessionSummary `json:"sessions"`
}
```

Define `ToolDetail`, `TaskDetail`, and `TimelineEntry` with the exact fields from `detail.schema.json`. Define `SessionDetail` as `{apiVersion, daemon, revision, generatedAt, session}` where `session` contains monitor/display/adapter/workspace/cwd/timing/state/summary/attention/tools/tasks/timeline and `DetailCompleteness`. Define `DiscoveryRecord` as `{endpoint, apiVersion, daemonId, startedAt, capability}`. Every field must carry its lower-camel-case JSON tag; do not use `DisallowUnknownFields`.

- [ ] **Step 6: Validate raw JSON before typed unmarshal**

In `schema.go`, compile each embedded schema once with `sync.Once`, validate decoded `any`, then `json.Unmarshal` into the target. Export:

```go
func DecodeSnapshot(data []byte) (Snapshot, error)
func DecodeDetail(data []byte) (SessionDetail, error)
func DecodeDiscovery(data []byte) (DiscoveryRecord, error)
```

Wrap errors as `fmt.Errorf("monitor v1 snapshot: %w", err)` and equivalent detail/discovery copy.

- [ ] **Step 7: Run contract tests**

Run: `gofmt -w schemas/monitor/v1 internal/monitorapi && go test ./internal/monitorapi`
Expected: PASS.

### Task 2: Implement read-only runtime discovery

**Files:**
- Create: `internal/monitorapi/discovery.go`
- Create: `internal/monitorapi/discovery_test.go`

**Interfaces:**
- Produces: `Discover(ctx, DiscoveryOptions) (DiscoveryRecord, error)` and `ErrHubNotRunning`.

- [ ] **Step 1: Write failing discovery tests**

Use a temp XDG directory. Cover valid record, absent file, malformed record, non-loopback endpoint, wrong API version, and world-readable mode. Assert malformed files remain unchanged.

```go
record, err := Discover(ctx, DiscoveryOptions{XDGRunDir: temp, TempDir: t.TempDir(), UID: 1000})
if err != nil { t.Fatal(err) }
if record.APIVersion != "monitor/v1" { t.Fatalf("apiVersion = %q", record.APIVersion) }
```

Use standard-library assertions throughout rather than adding test dependencies.

- [ ] **Step 2: Verify discovery is absent**

Run: `go test ./internal/monitorapi -run Discovery`
Expected: FAIL.

- [ ] **Step 3: Implement injected path resolution and validation**

```go
var ErrHubNotRunning = errors.New("Agent Activity Hub is not running")

type DiscoveryOptions struct { XDGRunDir, TempDir string; UID int }
func DiscoveryPath(o DiscoveryOptions) string {
    if o.XDGRunDir != "" { return filepath.Join(o.XDGRunDir, "agent-activity-hub", "monitor.json") }
    return filepath.Join(o.TempDir, fmt.Sprintf("agent-activity-hub-%d", o.UID), "monitor.json")
}
```

`Discover` reads only; it never creates/removes/chmods. On Unix require no group/other permission bits (`mode.Perm()&0o077 == 0`), decode the schema, require `monitor/v1`, parse URL, and require hostname exactly `127.0.0.1` or `::1` with `http` scheme.

- [ ] **Step 4: Run discovery tests**

Run: `go test ./internal/monitorapi -run Discovery`
Expected: PASS.

### Task 3: Implement the typed HTTP client and one-shot rediscovery

**Files:**
- Create: `internal/monitorapi/client.go`
- Create: `internal/monitorapi/errors.go`
- Create: `internal/monitorapi/client_test.go`

**Interfaces:**
- Produces: `Client.Snapshot`, `Client.Detail`, `Client.RefreshDiscovery`, and typed `Error.Kind`.

- [ ] **Step 1: Write failing HTTP tests**

Use `httptest.Server` to assert bearer auth, snapshot/detail decoding, `after` and clamped `wait`, unknown-field tolerance, malformed body, 401 rediscovery exactly once, connection failure rediscovery once, 404 detail, and protocol mismatch classification.

- [ ] **Step 2: Verify client is absent**

Run: `go test ./internal/monitorapi -run Client`
Expected: FAIL.

- [ ] **Step 3: Define stable error and discovery interfaces**

```go
type ErrorKind string
const (
    ErrorUnavailable ErrorKind = "unavailable"; ErrorUnauthorized ErrorKind = "unauthorized"
    ErrorProtocol ErrorKind = "protocol"; ErrorMalformed ErrorKind = "malformed"
    ErrorNotFound ErrorKind = "not_found"
)
type Error struct { Kind ErrorKind; Status int; Err error }
func (e *Error) Error() string { return e.Err.Error() }
func (e *Error) Unwrap() error { return e.Err }

type Discoverer interface { Discover(context.Context) (DiscoveryRecord, error) }
```

- [ ] **Step 4: Implement client methods**

```go
type Client struct { http *http.Client; discoverer Discoverer; record DiscoveryRecord }
func NewClient(httpClient *http.Client, d Discoverer) *Client
func (c *Client) RefreshDiscovery(ctx context.Context) error
func (c *Client) Snapshot(ctx context.Context, after *int64, wait time.Duration) (Snapshot, error)
func (c *Client) Detail(ctx context.Context, monitorID string) (SessionDetail, error)
```

Build only GET requests, set `Authorization: Bearer <capability>` and `Accept: application/json`, cap wait at 30 seconds, limit response bodies to 4 MiB, and validate before returning. On unauthorized/unavailable, rediscover once and retry once; never retry protocol/malformed/not-found responses.

- [ ] **Step 5: Run client tests**

Run: `go test ./internal/monitorapi -run Client`
Expected: PASS.

### Task 4: Build snapshot and JSON renderers

**Files:**
- Create: `internal/snapshot/render.go`
- Create: `internal/snapshot/render_test.go`

**Interfaces:**
- Produces: `Render(io.Writer, monitorapi.Snapshot, Options) error` and `RenderJSON`.

- [ ] **Step 1: Write width and mode tests**

Use a fixed snapshot and golden structural assertions for widths 120, 80, and 50; test no wrapping, column removal, truncation marker, empty state, `--wide`, no color, and JSON round-trip.

- [ ] **Step 2: Verify renderer is absent**

Run: `go test ./internal/snapshot`
Expected: FAIL.

- [ ] **Step 3: Implement explicit column priorities**

```go
type Options struct { Width int; Color bool; Wide bool }
func Render(w io.Writer, s monitorapi.Snapshot, o Options) error
func RenderJSON(w io.Writer, s monitorapi.Snapshot) error {
    enc := json.NewEncoder(w); enc.SetIndent("", "  "); return enc.Encode(s)
}
```

At ≥100 show session/harness/workspace/activity/age; 70–99 drop harness; below 70 show session/activity/age. Truncate cells with one Unicode ellipsis; never rely on terminal wrapping. Preserve daemon order. Show textual state in every row and append `showing 500 of N` when truncated.

- [ ] **Step 4: Run renderer tests**

Run: `go test ./internal/snapshot`
Expected: PASS.

### Task 5: Implement command parsing, exits, and version output

**Files:**
- Create: `cmd/agent-hub/main.go`
- Create: `cmd/agent-hub/run.go`
- Create: `cmd/agent-hub/run_test.go`

**Interfaces:**
- Consumes: discovery client and snapshot renderer.
- Produces: executable modes and exit codes 0 success, 1 operational, 2 usage, 3 protocol incompatibility.

- [ ] **Step 1: Write failing command tests**

Inject stdout/stderr, environment, width, and a fake API. Cover every approved invocation, conflicting flags, hub-not-running copy, empty success, `NO_COLOR`, `TERM=dumb`, JSON, and version fields.

- [ ] **Step 2: Verify command package is absent**

Run: `go test ./cmd/agent-hub`
Expected: FAIL.

- [ ] **Step 3: Implement standard-library parsing and dependency injection**

```go
var version = "dev"; var commit = "unknown"; var buildDate = "unknown"
type API interface {
    Snapshot(context.Context, *int64, time.Duration) (monitorapi.Snapshot, error)
    Detail(context.Context, string) (monitorapi.SessionDetail, error)
    RefreshDiscovery(context.Context) error
}
type Dependencies struct { Out, Err io.Writer; Environ func(string) string; Width func() int; API API; RunTUI func(API) error }
func run(ctx context.Context, args []string, d Dependencies) int
```

Parse only approved flags/subcommands. `main()` builds real dependencies and calls `os.Exit(run(...))`. Print exact version form `agent-hub <version> (<commit>, <buildDate>)`.

- [ ] **Step 4: Run command tests and build**

Run: `go test ./cmd/agent-hub && go build ./cmd/agent-hub`
Expected: PASS and `agent-hub` builds.

### Task 6: Build deterministic Bubble Tea state and retry logic

**Files:**
- Create: `internal/tui/model.go`
- Create: `internal/tui/messages.go`
- Create: `internal/tui/filter.go`
- Create: `internal/tui/model_test.go`

**Interfaces:**
- Produces: `New(api, Options) Model`, deterministic Tea messages, selection/filter/sort/retry state.

- [ ] **Step 1: Write state-transition tests**

Test initial load, 25-second poll, changed revision, manual refresh, stale disconnect, successful recovery, protocol block, malformed response, selection by monitor ID, nearest-row selection on expiry, no sessions, filter persistence, sort modes, stale detail response discard, and retry sequence 250 ms→500 ms→1 s→10 s.

- [ ] **Step 2: Verify TUI package is absent**

Run: `go test ./internal/tui -run Model`
Expected: FAIL.

- [ ] **Step 3: Define messages and model dependencies**

```go
type snapshotMsg struct { snapshot monitorapi.Snapshot; err error }
type detailMsg struct { id string; detail monitorapi.SessionDetail; err error }
type retryMsg struct{}
type sortMode int
const (sortHub sortMode=iota; sortAge; sortHarness; sortWorkspace; sortName)
type Options struct { Now func() time.Time; Jitter func(time.Duration) time.Duration }
```

Model stores snapshot, visible sessions, selected monitor ID, prior visual index, detail, pending detail ID, width/height, filter text/facets, sort, stale/error, blocked protocol error, help, narrow-detail mode, and retry attempt.

- [ ] **Step 4: Implement commands and update logic**

`Init` loads snapshot. A successful snapshot resets retry, preserves selection/filter/sort, requests selected detail only when revision changed, then starts `Snapshot(ctx,&revision,25*time.Second)`. Failures preserve last valid data, set stale, and schedule `tea.Tick` using capped exponential backoff plus injected jitter. `r` refreshes discovery and snapshot. Protocol errors set a blocking state and schedule no retry.

- [ ] **Step 5: Run model tests**

Run: `go test ./internal/tui -run Model`
Expected: PASS without wall-clock sleeps.

### Task 7: Add responsive Charmbracelet views and interaction

**Files:**
- Create: `internal/tui/view.go`
- Create: `internal/tui/keys.go`
- Create: `internal/tui/styles.go`
- Create: `internal/tui/view_test.go`
- Modify: `cmd/agent-hub/run.go`

**Interfaces:**
- Consumes: deterministic model.
- Produces: polished split/narrow/minimum views and approved keyboard behavior.

- [ ] **Step 1: Write structural view/key tests**

Assert ≥100 contains Sessions and Session detail side-by-side; 60–99 shows one screen; <60 or <16 shows `Requires at least 60×16`; stale view contains `STALE`; every glyph row includes a text state. Test arrows, j/k, Enter, Escape, `/`, `s`, `r`, `?`, and `q`, including text-input precedence.

- [ ] **Step 2: Verify views are absent**

Run: `go test ./internal/tui -run 'View|Key'`
Expected: FAIL.

- [ ] **Step 3: Implement components and adaptive styles**

Use `bubbles/table`, `viewport`, `textinput`, `spinner`, and `help`; use Lip Gloss for borders/padding/colors. Define complete status labels:

```go
var status = map[string]struct{ Glyph, Label string }{
    "running": {"●", "running"}, "waiting": {"◐", "waiting"},
    "idle": {"○", "idle"}, "attention": {"!", "attention"},
}
```

Detect no-color before model construction and use plain styles. Detail renders only monitor-safe API fields.

- [ ] **Step 4: Wire `agent-hub tui`**

Construct `tea.NewProgram(model, tea.WithAltScreen())`; return its error. Snapshot mode must never use alternate screen.

- [ ] **Step 5: Run all Go UI tests**

Run: `go test ./internal/tui ./cmd/agent-hub`
Expected: PASS.

### Task 8: Add process-level CLI and fixture-server tests

**Files:**
- Create: `test/e2e/monitor_cli_test.go`
- Create: `test/e2e/testdata/fixture_server.go`

**Interfaces:**
- Consumes: built binary and canonical fixtures.
- Produces: proof the monitor works outside the repository against HTTP.

- [ ] **Step 1: Write E2E tests**

Build `./cmd/agent-hub` into `t.TempDir()`, run a loopback fixture server, write protected `monitor.json`, and execute snapshot/JSON/version/disconnected/protocol-mismatch cases with isolated `XDG_RUNTIME_DIR`. Assert secret forbidden fields never print.

- [ ] **Step 2: Run and observe the first missing behavior**

Run: `go test ./test/e2e -v`
Expected: FAIL until command/discovery integration is complete.

- [ ] **Step 3: Complete real dependency construction**

In `main.go`, use `os.UserCacheDir` nowhere; construct discovery from `os.Getenv("XDG_RUNTIME_DIR")`, `os.TempDir()`, `os.Getuid()`, an `http.Client`, `term.GetSize`, and the TUI runner. No file writes are allowed.

- [ ] **Step 4: Run E2E tests**

Run: `go test ./test/e2e -v`
Expected: PASS.

### Task 9: Add Go verification to local scripts and CI

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `README.md`

**Interfaces:**
- Produces: repeatable Go formatting, vet, race, test, and build gates.

- [ ] **Step 1: Add scripts**

Add root scripts:

```json
"check:go": "test -z \"$(gofmt -l cmd internal schemas/monitor/v1 test)\" && go vet ./... && go test -race ./... && go build ./cmd/agent-hub",
"check": "pnpm run typecheck && pnpm test && pnpm run check:go && pnpm run build && pi --no-extensions -e ./packages/pi-extension/dist/index.js -e ./packages/subagents/dist/index.js --list-models >/dev/null"
```

- [ ] **Step 2: Add Go setup before project checks**

In both workflows add:

```yaml
- uses: actions/setup-go@v5
  with:
    go-version: "1.24.0"
    cache: true
```

- [ ] **Step 3: Run the same gate locally**

Run: `pnpm run check:release`
Expected: TypeScript, Go race tests, build, and tracked artifact tests pass.

### Task 10: Publish checksummed standalone GitHub Release archives

**Files:**
- Create: `scripts/build-agent-hub-release.sh`
- Create: `scripts/smoke-agent-hub-release.sh`
- Modify: `.github/workflows/release.yml`
- Modify: `docs/resources/releasing.md`

**Interfaces:**
- Consumes: a validated `v*` tag matching root package version.
- Produces: four deterministic archives and `SHA256SUMS` attached to a private GitHub Release.

- [ ] **Step 1: Write the artifact smoke script first**

The script accepts one Linux amd64 archive, extracts to `mktemp -d`, verifies `agent-hub version`, confirms `file` reports an executable, runs with an empty isolated runtime and expects the “not running” operational exit, then starts the fixture server and verifies JSON output. It must not invoke Node or Go after extraction.

- [ ] **Step 2: Implement deterministic cross-builds**

Create `scripts/build-agent-hub-release.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
version=${VERSION:?}; commit=${COMMIT:?}; build_date=${BUILD_DATE:?}
rm -rf dist/agent-hub && mkdir -p dist/agent-hub
for target in darwin/arm64 darwin/amd64 linux/arm64 linux/amd64; do
  os=${target%/*}; arch=${target#*/}; name="agent-hub_${version}_${os}_${arch}"
  dir=$(mktemp -d); CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath \
    -ldflags="-s -w -X main.version=$version -X main.commit=$commit -X main.buildDate=$build_date" \
    -o "$dir/agent-hub" ./cmd/agent-hub
  COPYFILE_DISABLE=1 tar -C "$dir" -czf "dist/agent-hub/${name}.tar.gz" agent-hub
  rm -rf "$dir"
done
(cd dist/agent-hub && shasum -a 256 agent-hub_*.tar.gz > SHA256SUMS)
```

- [ ] **Step 3: Run a local Linux artifact smoke test**

Run:

```bash
VERSION=0.2.0 COMMIT=$(git rev-parse HEAD) BUILD_DATE=$(date -u +%FT%TZ) scripts/build-agent-hub-release.sh
scripts/smoke-agent-hub-release.sh dist/agent-hub/agent-hub_0.2.0_linux_amd64.tar.gz
```

Expected: four archives, one checksum manifest, and smoke PASS.

- [ ] **Step 4: Add gated publication**

Give only the publication job `contents: write`. After existing validation and `pnpm run check:release`, run the build/smoke scripts, upload all files as workflow artifacts, then publish:

```yaml
- uses: softprops/action-gh-release@v2
  with:
    files: |
      dist/agent-hub/*.tar.gz
      dist/agent-hub/SHA256SUMS
```

Set `VERSION` from `${GITHUB_REF_NAME#v}`, `COMMIT=$GITHUB_SHA`, and one UTC `BUILD_DATE` value shared by all builds.

- [ ] **Step 5: Document private release installation**

Add authenticated `gh release download <tag>`, checksum verification, archive extraction, PATH installation, `agent-hub version`, snapshot, and TUI commands. State that the Go binary does not install/start the TypeScript hub daemon.

- [ ] **Step 6: Run final full verification**

Run: `pnpm run check:release && go test -race ./... && git diff --check && git diff --exit-code -- release`
Expected: all checks pass; release bundles and monitor binary tests are clean.
