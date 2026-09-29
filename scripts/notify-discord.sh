#!/usr/bin/env bash
# Post the CHANGELOG.md section of a version on Discord, through a webhook.
#
# Usage: scripts/notify-discord.sh 1.2.6
#        DRY_RUN=1 scripts/notify-discord.sh 1.2.6   (print the message, send nothing)
# Env:   DISCORD_WEBHOOK_URL
set -euo pipefail

version="${1:?Usage: $0 <version>}"
payload="$(
  bash "$(dirname "$0")/changelog-section.sh" "$version" | node -e '
    let notes = "";
    process.stdin.on("data", (chunk) => (notes += chunk));
    process.stdin.on("end", () => {
      const version = process.argv[1];
      const store = "https://chromewebstore.google.com/detail/emdpbenabkkocjldgifjkciijdmcflin";
      // Discord refuses an embed description longer than 4096 characters
      if (notes.length > 4000) notes = notes.slice(0, 4000) + "…";
      console.log(JSON.stringify({
        embeds: [{
          title: `CSS Battle Toolbox ${version}`,
          url: `https://github.com/evanliomain/css-battle-toolbox/releases/tag/${version}`,
          description: `${notes.trim()}\n\n[Install it from the Chrome Web Store](${store})`,
        }],
      }));
    });
  ' "$version"
)"

if [ -n "${DRY_RUN:-}" ]; then
  echo "$payload"
  exit 0
fi

: "${DISCORD_WEBHOOK_URL:?}"
echo "📣 Announce $version on Discord"
curl --silent --show-error --fail-with-body --output /dev/null \
  --header "Content-Type: application/json" \
  --data "$payload" \
  "$DISCORD_WEBHOOK_URL?wait=true"
