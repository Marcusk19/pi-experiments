package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/Marcusk19/agent-base/internal/monitorapi"
	"github.com/Marcusk19/agent-base/internal/snapshot"
	activitytui "github.com/Marcusk19/agent-base/internal/tui"
	tea "github.com/charmbracelet/bubbletea"
)

var version = "dev"
var commit = "unknown"
var buildDate = "unknown"

type API interface {
	Snapshot(context.Context, *int64, time.Duration) (monitorapi.Snapshot, error)
	Detail(context.Context, string) (monitorapi.SessionDetail, error)
	RefreshDiscovery(context.Context) error
}
type dependencies struct {
	out, err io.Writer
	getenv   func(string) string
	width    func() int
	api      API
	runTUI   func(API, bool) error
	now      func() time.Time
}

func run(ctx context.Context, args []string, d dependencies) int {
	if len(args) > 0 && args[0] == "version" {
		fmt.Fprintf(d.out, "agent-hub %s (%s, %s)\n", version, commit, buildDate)
		return 0
	}
	if len(args) > 0 && args[0] == "list" {
		return runList(ctx, args[1:], d)
	}
	// Default: interactive TUI
	color := d.getenv("NO_COLOR") == "" && d.getenv("TERM") != "dumb"
	if err := d.runTUI(d.api, color); err != nil {
		fmt.Fprintln(d.err, err)
		return exitFor(err)
	}
	return 0
}

func runList(ctx context.Context, args []string, d dependencies) int {
	flags := flag.NewFlagSet("agent-hub list", flag.ContinueOnError)
	flags.SetOutput(d.err)
	jsonOutput := flags.Bool("json", false, "print JSON")
	noColor := flags.Bool("no-color", false, "disable color")
	wide := flags.Bool("wide", false, "show all columns")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 {
		return 2
	}
	value, err := d.api.Snapshot(ctx, nil, 0)
	if err != nil {
		fmt.Fprintln(d.err, err)
		return exitFor(err)
	}
	if *jsonOutput {
		if err := snapshot.RenderJSON(d.out, value); err != nil {
			fmt.Fprintln(d.err, err)
			return 1
		}
		return 0
	}
	color := !*noColor && d.getenv("NO_COLOR") == "" && d.getenv("TERM") != "dumb"
	if err := snapshot.Render(d.out, value, snapshot.Options{Width: d.width(), Color: color, Wide: *wide, Now: d.now()}); err != nil {
		fmt.Fprintln(d.err, err)
		return 1
	}
	return 0
}
func exitFor(err error) int {
	var apiErr *monitorapi.Error
	if errors.As(err, &apiErr) && apiErr.Kind == monitorapi.ErrorProtocol {
		return 3
	}
	return 1
}
func runTea(api API, color bool) error {
	_, err := tea.NewProgram(activitytui.New(api, activitytui.Options{Color: color}), tea.WithAltScreen()).Run()
	return err
}
func realDependencies() dependencies {
	discoverer := monitorapi.FileDiscoverer{Options: monitorapi.DefaultDiscoveryOptions()}
	client := monitorapi.NewClient(nil, discoverer)
	return dependencies{out: os.Stdout, err: os.Stderr, getenv: os.Getenv, width: terminalWidth, api: client, runTUI: runTea, now: time.Now}
}
