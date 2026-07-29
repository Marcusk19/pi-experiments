#!/usr/bin/env bash
set -euo pipefail

archive=${1:?archive path is required}
temp=$(mktemp -d)
trap 'rm -rf "$temp"' EXIT

tar -xzf "$archive" -C "$temp"
"$temp/agent-hub" version | grep -q '^agent-hub '
mkdir -p "$temp/runtime"
set +e
output=$(XDG_RUNTIME_DIR="$temp/runtime" "$temp/agent-hub" list 2>&1)
status=$?
set -e
if [[ $status -ne 1 ]]; then
  echo "expected disconnected exit 1, got $status" >&2
  exit 1
fi
grep -q 'Agent Activity Hub is not running' <<<"$output"
echo "agent-hub release smoke test passed"
