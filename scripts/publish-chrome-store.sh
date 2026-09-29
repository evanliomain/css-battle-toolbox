#!/usr/bin/env bash
# Upload a zip to the Chrome Web Store and submit it for review.
#
# Usage: scripts/publish-chrome-store.sh css-battle-toolbox.zip
# Env:   see scripts/chrome-store-api.sh
set -euo pipefail

zip_file="${1:?Usage: $0 <zip file>}"
source "$(dirname "$0")/chrome-store-api.sh"

echo "🔑 Get an access token"
token="$(access_token)"

echo "📦 Upload $zip_file"
upload="$(
  call --request POST "$CWS_API/upload/v2/$CWS_ITEM:upload" \
    --header "Authorization: Bearer $token" \
    --header "Content-Type: application/zip" \
    --data-binary "@$zip_file"
)"
state="$(echo "$upload" | json_field uploadState)"

# The upload can be processed asynchronously
attempts=0
while [[ "$state" == *IN_PROGRESS ]]; do
  attempts=$((attempts + 1))
  [ "$attempts" -le 30 ] || { echo "❌ Upload still in progress after 5 minutes" >&2; exit 1; }
  sleep 10
  state="$(
    call "$CWS_API/v2/$CWS_ITEM:fetchStatus" --header "Authorization: Bearer $token" |
      json_field lastAsyncUploadState
  )"
done

if [ "$state" != "SUCCEEDED" ]; then
  echo "❌ Upload $state: $upload" >&2
  exit 1
fi

echo "🚀 Submit for review"
call --request POST "$CWS_API/v2/$CWS_ITEM:publish" \
  --header "Authorization: Bearer $token" \
  --header "Content-Type: application/json" \
  --data '{"publishType": "DEFAULT_PUBLISH"}'
