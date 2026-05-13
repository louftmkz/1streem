#!/usr/bin/env bash
# One-shot installer for the macOS launchd-based scraper.
# Run once with:
#   bash scripts/install-mac-launchd.sh
#
# Re-running is safe — it overwrites the existing plist and re-loads it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PLIST_LABEL="com.1streem.scraper"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"
ENV_FILE="$HOME/.1streem-env"
LOG_DIR="$HOME/Library/Logs"
LOG_STDOUT="$LOG_DIR/1streem-scraper.log"
LOG_STDERR="$LOG_DIR/1streem-scraper.error.log"

echo "==> 1streem launchd installer"
echo "Repo:  $REPO_DIR"

# ---------- Prereq checks ----------
if ! command -v node >/dev/null 2>&1; then
  cat >&2 <<EOF
ERROR: Node.js is not installed.
Install it from https://nodejs.org (LTS) and re-run this script.
EOF
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git is not installed. Install Xcode Command Line Tools: xcode-select --install" >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
echo "Node:  $NODE_BIN ($(node -v))"
echo "Git:   $(command -v git) ($(git --version))"

# ---------- Cookie ----------
echo
if [ -f "$ENV_FILE" ] && grep -q "^SPOTIFY_SP_DC=" "$ENV_FILE"; then
  echo "Found existing $ENV_FILE."
  read -r -p "Reuse the stored Spotify cookie? [Y/n] " reuse
  reuse="${reuse:-Y}"
  if [[ ! "$reuse" =~ ^[Yy]$ ]]; then
    read -rsp "Paste your sp_dc cookie value: " SP_DC; echo
    [ -z "$SP_DC" ] && { echo "Empty cookie. Aborting." >&2; exit 1; }
    {
      echo "SPOTIFY_SP_DC=\"$SP_DC\""
      echo "SPOTIFY_ARTIST_ID=\"3LaYDsZXr5HlfDY7vtxq0v\""
    } > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Updated $ENV_FILE"
  fi
else
  read -rsp "Paste your sp_dc cookie value from open.spotify.com: " SP_DC; echo
  [ -z "$SP_DC" ] && { echo "Empty cookie. Aborting." >&2; exit 1; }
  {
    echo "SPOTIFY_SP_DC=\"$SP_DC\""
    echo "SPOTIFY_ARTIST_ID=\"3LaYDsZXr5HlfDY7vtxq0v\""
  } > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Wrote $ENV_FILE (chmod 600)"
fi

# ---------- Generate plist ----------
mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$PLIST_PATH")"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$PLIST_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>$REPO_DIR/scripts/run-scraper.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$(dirname "$NODE_BIN"):/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>4</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$LOG_STDOUT</string>
  <key>StandardErrorPath</key>
  <string>$LOG_STDERR</string>
  <key>WorkingDirectory</key>
  <string>$REPO_DIR</string>
</dict>
</plist>
EOF

echo "Wrote $PLIST_PATH"

# ---------- Reload launchd ----------
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "Loaded launchd agent: $PLIST_LABEL"

# Make sure run-scraper.sh is executable
chmod +x "$SCRIPT_DIR/run-scraper.sh"

echo
echo "==> Installed."
echo
echo "Schedule:  daily at 04:00 local time (Mac must be awake or wakeable)"
echo "Logs:      $LOG_STDOUT"
echo "Errors:    $LOG_STDERR"
echo
echo "To test right now (synchronous, takes ~30-60 s):"
echo "    bash $REPO_DIR/scripts/run-scraper.sh"
echo
echo "To trigger the launchd job directly:"
echo "    launchctl kickstart -k gui/\$UID/$PLIST_LABEL"
echo
echo "To uninstall later:"
echo "    launchctl unload $PLIST_PATH && rm $PLIST_PATH"
