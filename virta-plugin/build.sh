#!/usr/bin/env bash
# Packages the Virta plugin into public/marketbubble-virta-plugin.zip so the deployed dashboard
# serves its own plugin: install it in Virta from
#   https://marketbubble.virta.lol/marketbubble-virta-plugin.zip
#
# Layout note: Virta's installer strips the first path segment of every archive entry (GitHub
# zipballs wrap everything in a repo-sha directory), so the zip must wrap files in one directory.
set -euo pipefail
cd "$(dirname "$0")"

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/marketbubble-virta-plugin"
cp virta-plugin.json "$STAGE/marketbubble-virta-plugin/"
cp -r gui "$STAGE/marketbubble-virta-plugin/"

OUT="$(cd .. && pwd)/public/marketbubble-virta-plugin.zip"
rm -f "$OUT"
(cd "$STAGE" && zip -qr "$OUT" marketbubble-virta-plugin)
echo "built $OUT"
unzip -l "$OUT"
