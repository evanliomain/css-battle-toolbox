#!/usr/bin/env bash
# Print the version live on the Chrome Web Store, from the public update
# endpoint that Chrome itself calls (no credentials needed).
# Usage: scripts/online-version.sh
set -euo pipefail

EXTENSION_ID="emdpbenabkkocjldgifjkciijdmcflin"

version="$(
  curl --silent --show-error --fail --location \
    "https://clients2.google.com/service/update2/crx?response=updatecheck&acceptformat=crx3&prodversion=999&x=id%3D${EXTENSION_ID}%26uc" |
    sed -n -E 's/.*<updatecheck[^>]* version="([^"]+)".*/\1/p'
)"
[ -n "$version" ] || { echo "❌ Could not read the version online on the Chrome Web Store." >&2; exit 1; }
echo "$version"
