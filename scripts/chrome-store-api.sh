#!/usr/bin/env bash
# Shared helpers for the Chrome Web Store API v2, to source from other scripts.
# https://developer.chrome.com/docs/webstore/using-api
#
# Env: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN,
#      CWS_PUBLISHER_ID, CWS_EXTENSION_ID
: "${CWS_CLIENT_ID:?}" "${CWS_CLIENT_SECRET:?}" "${CWS_REFRESH_TOKEN:?}"
: "${CWS_PUBLISHER_ID:?}" "${CWS_EXTENSION_ID:?}"

CWS_API="https://chromewebstore.googleapis.com"
CWS_ITEM="publishers/$CWS_PUBLISHER_ID/items/$CWS_EXTENSION_ID"

# Read a field of the JSON given on stdin, empty when missing.
# Dots go down nested objects and arrays: publishedItemRevisionStatus.state
json_field() {
  node -e '
    let input = "";
    process.stdin.on("data", (chunk) => (input += chunk));
    process.stdin.on("end", () => {
      // Empty input when a previous call failed, its error is already printed
      if (!input.trim()) return;
      const value = process.argv[1]
        .split(".")
        .reduce((object, key) => object?.[key], JSON.parse(input));
      console.log(value ?? "");
    });
  ' "$1"
}

# Print the response and stop when the HTTP status is not 2xx
call() {
  local response status
  response="$(curl --silent --show-error --write-out '\n%{http_code}' "$@")"
  status="${response##*$'\n'}"
  response="${response%$'\n'*}"
  if [ "${status:0:1}" != "2" ]; then
    echo "❌ HTTP $status: $response" >&2
    exit 1
  fi
  echo "$response"
}

# Swap the refresh token for a one hour access token
access_token() {
  call https://oauth2.googleapis.com/token \
    --data-urlencode "client_id=$CWS_CLIENT_ID" \
    --data-urlencode "client_secret=$CWS_CLIENT_SECRET" \
    --data-urlencode "refresh_token=$CWS_REFRESH_TOKEN" \
    --data-urlencode "grant_type=refresh_token" |
    json_field access_token
}
