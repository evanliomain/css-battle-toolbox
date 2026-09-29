#!/usr/bin/env bash
# Tag a new version when package.json and CHANGELOG.md are ahead of the Chrome
# Web Store. Pushing the tag triggers .github/workflows/release.yml, which
# publishes on the store and on GitHub Releases.
#
# Usage: npm run release
#        DRY_RUN=1 npm run release   (every check, no tag, no push)
set -euo pipefail

EXTENSION_ID="emdpbenabkkocjldgifjkciijdmcflin"
REPOSITORY="evanliomain/css-battle-toolbox"

cd "$(dirname "$0")/.."

fail() {
  echo "❌ $*" >&2
  exit 1
}

# 1. The tag must point at what is on origin/master
branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "master" ] || fail "Release from master, not from $branch."
[ -z "$(git status --porcelain)" ] || fail "The working tree has uncommitted changes."
git fetch --quiet --tags origin master
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/master)" ] ||
  fail "master is not in sync with origin/master."

# 2. The three versions
local_version="$(node -p 'require("./package.json").version')"
changelog_version="$(sed -n -E 's/^# ([0-9]+\.[0-9]+\.[0-9]+)[[:space:]]*$/\1/p' CHANGELOG.md | head -n 1)"
online_version="$(
  curl --silent --show-error --fail --location \
    "https://clients2.google.com/service/update2/crx?response=updatecheck&acceptformat=crx3&prodversion=999&x=id%3D${EXTENSION_ID}%26uc" |
    sed -n -E 's/.*<updatecheck[^>]* version="([^"]+)".*/\1/p'
)"
[ -n "$online_version" ] || fail "Could not read the version online on the Chrome Web Store."

echo "package.json : $local_version"
echo "CHANGELOG.md : ${changelog_version:-none}"
echo "Online       : $online_version"

# 3. Is there something to release?
[ "$local_version" = "$changelog_version" ] ||
  fail "package.json is at $local_version but CHANGELOG.md is at ${changelog_version:-none}."

is_newer="$(node -e '
  const [a, b] = process.argv.slice(1).map((v) => v.split(".").map(Number));
  const diff = a.map((n, i) => n - (b[i] ?? 0)).find((d) => d !== 0) ?? 0;
  console.log(diff > 0);
' "$local_version" "$online_version")"
if [ "$is_newer" != "true" ]; then
  echo "✅ Nothing new: $online_version is already online."
  exit 0
fi

if git rev-parse --quiet --verify "refs/tags/$local_version" >/dev/null ||
  [ -n "$(git ls-remote --tags origin "refs/tags/$local_version")" ]; then
  fail "$local_version is already tagged, it is probably under review on the Chrome Web Store."
fi

# 4. Fail here rather than in the GitHub Action
npx vitest run
npm run build

if [ -n "${DRY_RUN:-}" ]; then
  echo "🧪 DRY_RUN: $local_version would be tagged and pushed."
  exit 0
fi

# 5. The tag triggers the publication
git tag --annotate "$local_version" --cleanup=verbatim \
  --message "$local_version" --message "$(scripts/changelog-section.sh "$local_version")"
git push origin "$local_version"

echo "🚀 $local_version tagged, follow the publication on https://github.com/$REPOSITORY/actions"
