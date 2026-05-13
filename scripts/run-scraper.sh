#!/usr/bin/env bash
# Wrapper that the launchd agent calls daily.
# - Pulls latest main from GitHub
# - Loads SPOTIFY_SP_DC from ~/.1streem-env
# - Runs the Node scraper
# - Commits + pushes stats.json if it changed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> $(date -u +%FT%TZ) — 1streem scrape run"
echo "Repo: $REPO_DIR"

# Load secrets
if [ ! -f "$HOME/.1streem-env" ]; then
  echo "ERROR: ~/.1streem-env not found. Run scripts/install-mac-launchd.sh first." >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$HOME/.1streem-env"

if [ -z "${SPOTIFY_SP_DC:-}" ]; then
  echo "ERROR: SPOTIFY_SP_DC not set in ~/.1streem-env" >&2
  exit 1
fi

cd "$REPO_DIR"

# Sync repo to latest main (drop any local changes — non-destructive in practice
# since this script doesn't change anything except stats.json)
git fetch origin main
git reset --hard origin/main

# Run scraper
SPOTIFY_SP_DC="$SPOTIFY_SP_DC" \
SPOTIFY_ARTIST_ID="${SPOTIFY_ARTIST_ID:-3LaYDsZXr5HlfDY7vtxq0v}" \
  node scripts/scrape-spotify.mjs

# Push if changed
if [ -n "$(git status --porcelain public/stats.json)" ]; then
  git add public/stats.json
  git -c user.email="lou.kailich@acture.de" -c user.name="1streem-bot" \
    commit -m "chore(stats): daily Spotify update [skip ci]"
  git push origin main
  echo "==> Stats updated and pushed."
else
  echo "==> No changes to stats.json — nothing to commit."
fi
echo "==> Done $(date -u +%FT%TZ)"
