#!/usr/bin/env bash
# Check the Chrome Web Store credentials with a read only call: nothing is
# uploaded nor published.
#
# Usage: scripts/check-chrome-store.sh
# Env:   see scripts/chrome-store-api.sh
set -euo pipefail

source "$(dirname "$0")/chrome-store-api.sh"

echo "🔑 Get an access token"
token="$(access_token)"
[ -n "$token" ] || { echo "❌ No access token in the response" >&2; exit 1; }

echo "🔎 Read the status of the item"
status="$(call "$CWS_API/v2/$CWS_ITEM:fetchStatus" --header "Authorization: Bearer $token")"

echo "Item      : $(echo "$status" | json_field itemId)"
echo "Published : $(echo "$status" | json_field publishedItemRevisionStatus.distributionChannels.0.crxVersion) ($(echo "$status" | json_field publishedItemRevisionStatus.state))"
echo "Submitted : $(echo "$status" | json_field submittedItemRevisionStatus.distributionChannels.0.crxVersion) ($(echo "$status" | json_field submittedItemRevisionStatus.state))"
echo "✅ The credentials work"
