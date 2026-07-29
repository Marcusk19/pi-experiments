package monitorapi

import (
	"encoding/json"
	"testing"

	monitorv1 "github.com/Marcusk19/agent-base/schemas/monitor/v1"
)

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := monitorv1.Fixtures.ReadFile("fixtures/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func TestSharedFixtures(t *testing.T) {
	if _, err := DecodeSnapshot(fixture(t, "valid-snapshot.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := DecodeDetail(fixture(t, "valid-detail.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := DecodeDiscovery(fixture(t, "valid-discovery.json")); err != nil {
		t.Fatal(err)
	}
}
func TestRejectsMissingRequiredKnownField(t *testing.T) {
	if _, err := DecodeSnapshot([]byte(`{"apiVersion":"monitor/v1"}`)); err == nil {
		t.Fatal("expected schema error")
	}
}
func TestAllowsUnknownV1Fields(t *testing.T) {
	var value map[string]any
	if err := json.Unmarshal(fixture(t, "valid-snapshot.json"), &value); err != nil {
		t.Fatal(err)
	}
	value["future"] = true
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := DecodeSnapshot(data); err != nil {
		t.Fatal(err)
	}
}
