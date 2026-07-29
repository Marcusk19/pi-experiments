package monitorv1

import "embed"

// Schemas contains the canonical monitor v1 JSON Schemas.
//
//go:embed *.schema.json
var Schemas embed.FS

// Fixtures contains shared TypeScript/Go contract examples.
//
//go:embed fixtures/*.json
var Fixtures embed.FS
