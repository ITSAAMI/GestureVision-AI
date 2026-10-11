#!/usr/bin/env bash
# Build the frontend and publish it to the gh-pages branch (GitHub Pages).
# Usage: VITE_API_URL=https://your-backend.example scripts/deploy-pages.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="${PAGES_DOMAIN:-gvisionai.tech}"
REMOTE="$(git -C "$ROOT" remote get-url origin)"

cd "$ROOT/frontend"
npm ci
npm run build

cd dist
cp index.html 404.html        # client-side routes work on refresh
echo "$DOMAIN" > CNAME        # custom domain
touch .nojekyll               # serve files as-is

rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy frontend $(git -C "$ROOT" rev-parse --short HEAD)"
git -c http.postBuffer=524288000 push -q -f "$REMOTE" gh-pages   # the site is ~40 MB (WASM + models)
rm -rf .git
echo "Published to gh-pages for https://$DOMAIN"
