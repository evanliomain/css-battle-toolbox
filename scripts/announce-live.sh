#!/usr/bin/env bash
# Once a version under review goes live on the Chrome Web Store, announce it on
# Discord and turn its GitHub pre-release into the latest release. The
# pre-release flag marks what is not announced yet, so it runs only once.
#
# Usage: scripts/announce-live.sh
#        DRY_RUN=1 scripts/announce-live.sh   (tell what would happen, change nothing)
# Env:   GH_TOKEN, DISCORD_WEBHOOK_URL
set -euo pipefail

cd "$(dirname "$0")/.."

online="$(bash scripts/online-version.sh)"
echo "Online : $online"

prerelease="$(
  gh release list --limit 100 --json tagName,isPrerelease \
    --jq ".[] | select(.isPrerelease and .tagName == \"$online\") | .tagName"
)"
if [ -z "$prerelease" ]; then
  echo "✅ Nothing to announce."
  exit 0
fi

if [ -n "${DRY_RUN:-}" ]; then
  echo "🧪 DRY_RUN: $online would be announced and marked as latest."
  exit 0
fi

bash scripts/notify-discord.sh "$online"
gh release edit "$online" --prerelease=false --latest
echo "🎉 $online announced."
