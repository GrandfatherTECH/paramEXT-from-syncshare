#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "MooDuSh: checking repository state..."
if [ ! -d .git ]; then
  echo "This directory is not a git repository. Download a fresh ZIP from GitHub instead."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Local changes detected. Commit, stash, or copy them before updating."
  exit 1
fi

echo "MooDuSh: downloading the latest version..."
git pull --ff-only

if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
  echo "MooDuSh: rebuilding backend containers..."
  docker compose build backend
  docker compose up -d
fi

echo "Done. If Chrome is open, reload the extension on chrome://extensions/."
