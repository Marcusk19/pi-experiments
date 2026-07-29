package monitorapi

import (
	"bytes"
	"encoding/json"
	"fmt"
	"sync"

	monitorv1 "github.com/Marcusk19/agent-base/schemas/monitor/v1"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

var compiled sync.Map

func schema(name string) (*jsonschema.Schema, error) {
	if value, ok := compiled.Load(name); ok {
		return value.(*jsonschema.Schema), nil
	}
	data, err := monitorv1.Schemas.ReadFile(name)
	if err != nil {
		return nil, err
	}
	document, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	compiler := jsonschema.NewCompiler()
	if err := compiler.AddResource(name, document); err != nil {
		return nil, err
	}
	value, err := compiler.Compile(name)
	if err != nil {
		return nil, err
	}
	compiled.Store(name, value)
	return value, nil
}

func decode[T any](data []byte, schemaName, label string) (T, error) {
	var zero T
	var raw any
	if err := json.Unmarshal(data, &raw); err != nil {
		return zero, fmt.Errorf("monitor v1 %s: malformed JSON: %w", label, err)
	}
	s, err := schema(schemaName)
	if err != nil {
		return zero, fmt.Errorf("monitor v1 %s schema: %w", label, err)
	}
	if err := s.Validate(raw); err != nil {
		return zero, fmt.Errorf("monitor v1 %s: %w", label, err)
	}
	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return zero, fmt.Errorf("monitor v1 %s: %w", label, err)
	}
	return result, nil
}

func DecodeSnapshot(data []byte) (Snapshot, error) {
	return decode[Snapshot](data, "snapshot.schema.json", "snapshot")
}
func DecodeDetail(data []byte) (SessionDetail, error) {
	return decode[SessionDetail](data, "detail.schema.json", "detail")
}
func DecodeDiscovery(data []byte) (DiscoveryRecord, error) {
	return decode[DiscoveryRecord](data, "discovery.schema.json", "discovery")
}
