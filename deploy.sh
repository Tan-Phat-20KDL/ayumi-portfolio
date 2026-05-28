#!/usr/bin/env bash
# One-shot deploy script for Cloudflare Pages.
# First run: prompts wrangler login (browser) + creates the Pages project.
# Subsequent runs: just redeploys.
set -e

PROJECT="${1:-ayumi-portfolio}"   # pass the project name as first arg, or edit this default

cd "$(dirname "$0")"

echo "==> Deploying to Cloudflare Pages as project: $PROJECT"
echo

# NODE_TLS_REJECT_UNAUTHORIZED=0 bypasses corporate firewall MITM (FortiGate etc).
# Only needed if you're on a network that intercepts TLS. Safe for a one-shot deploy.
export NODE_TLS_REJECT_UNAUTHORIZED=0

# wrangler will trigger 'wrangler login' on first run if not authenticated
npx wrangler pages deploy . \
  --project-name="$PROJECT" \
  --commit-dirty=true \
  --branch=main

echo
echo "✅ Deploy finished."
echo
echo "Next (one-time only, in Cloudflare Dashboard):"
echo "  1. Workers & Pages → $PROJECT → Settings → Bindings → Add → KV namespace"
echo "       Variable: PORTFOLIO_KV   Namespace: create 'portfolio-data'"
echo "  2. Same page → Variables and Secrets → Add → Secret"
echo "       Name: ADMIN_PASSWORD   Value: <strong password you'll use to sign in>"
echo "  3. Deployments tab → ... → Retry deployment (so bindings take effect)"
echo
echo "Then open https://$PROJECT.pages.dev/ and click Sign in."
