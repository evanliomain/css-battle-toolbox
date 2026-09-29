#!/usr/bin/env bash
# Print the CHANGELOG.md section of a version, without its heading.
# Usage: scripts/changelog-section.sh 1.2.6
set -euo pipefail

version="${1:?Usage: $0 <version>}"
changelog="$(dirname "$0")/../CHANGELOG.md"

awk -v heading="# $version" '
  $0 == heading { inside = 1; next }
  inside && /^# / { exit }
  inside { print }
' "$changelog" | sed -e '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
