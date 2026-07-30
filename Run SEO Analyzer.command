#!/bin/bash
set -e

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
URL="http://localhost:${PORT}"

echo "Starting Auditline SEO Analyzer..."
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install Node.js from https://nodejs.org, then double-click this file again."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "Installing project dependencies. This may take a minute..."
  npm install
fi

if [ ! -d "$HOME/Library/Caches/ms-playwright" ]; then
  echo "Installing Playwright Chromium browser..."
  npx playwright install chromium
fi

echo
echo "Opening ${URL}"
sleep 1
open "${URL}" >/dev/null 2>&1 || true

echo
echo "Server is running at ${URL}"
echo "Keep this window open while using the app."
echo "Press Ctrl+C in this window to stop it."
echo

PORT="${PORT}" npm start
