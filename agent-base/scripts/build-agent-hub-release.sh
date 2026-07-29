#!/usr/bin/env bash
set -euo pipefail

version=${VERSION:?VERSION is required}
commit=${COMMIT:?COMMIT is required}
build_date=${BUILD_DATE:?BUILD_DATE is required}
out=${OUT_DIR:-dist/agent-hub}

rm -rf "$out"
mkdir -p "$out"
for target in darwin/arm64 darwin/amd64 linux/arm64 linux/amd64; do
  os=${target%/*}
  arch=${target#*/}
  name="agent-hub_${version}_${os}_${arch}"
  dir=$(mktemp -d)
  CGO_ENABLED=0 GOOS=$os GOARCH=$arch go build -trimpath \
    -ldflags="-s -w -X main.version=$version -X main.commit=$commit -X main.buildDate=$build_date" \
    -o "$dir/agent-hub" ./cmd/agent-hub
  tar -C "$dir" -cf - agent-hub | gzip -n > "$out/${name}.tar.gz"
  rm -rf "$dir"
done
(
  cd "$out"
  shasum -a 256 agent-hub_*.tar.gz > SHA256SUMS
)
