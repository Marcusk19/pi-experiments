package main

import (
	"context"
	"os"

	"golang.org/x/term"
)

func main() { os.Exit(run(context.Background(), os.Args[1:], realDependencies())) }
func terminalWidth() int {
	width, _, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil {
		return 100
	}
	return width
}
