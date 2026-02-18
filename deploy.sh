#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------
# deploy.sh — Deploy jobSeekerAgent to Vercel
#
# Usage:
#   ./deploy.sh              # Deploy to preview
#   ./deploy.sh --prod       # Deploy to production
#   ./deploy.sh --env-only   # Only push env vars (no deploy)
# ---------------------------------------------------

PROD=false
ENV_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --prod)       PROD=true ;;
    --env-only)   ENV_ONLY=true ;;
    -h|--help)
      echo "Usage: ./deploy.sh [--prod] [--env-only]"
      echo ""
      echo "Flags:"
      echo "  --prod       Deploy to production (default: preview)"
      echo "  --env-only   Only sync environment variables, skip deploy"
      echo "  -h, --help   Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg"
      exit 1
      ;;
  esac
done

# ---- Preflight checks ----

if ! command -v vercel &> /dev/null; then
  echo "❌ Vercel CLI not found. Install it with:"
  echo "   npm i -g vercel"
  exit 1
fi

if ! vercel whoami &> /dev/null; then
  echo "❌ Not logged in to Vercel. Run:"
  echo "   vercel login"
  exit 1
fi

# ---- Link project (idempotent) ----

if [ ! -d ".vercel" ]; then
  echo "🔗 Linking project to Vercel..."
  vercel link
fi

# ---- Environment variables ----

ENV_FILE=".env.local"

if [ -f "$ENV_FILE" ]; then
  echo "🔑 Syncing environment variables from $ENV_FILE..."

  # Required env vars for the app
  REQUIRED_VARS=(
    "ANTHROPIC_API_KEY"
    "PINECONE_API_KEY"
    "PINECONE_INDEX"
    "NEXT_PUBLIC_INSTANT_APP_ID"
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID"
    "NEXT_PUBLIC_GOOGLE_CLIENT_NAME"
  )

  while IFS='=' read -r key value; do
    # Skip blank lines and comments
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    # Trim whitespace
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"
    [ -z "$key" ] && continue

    echo "  Setting $key for preview + production..."
    printf '%s' "$value" | vercel env add "$key" preview --force 2>/dev/null || true
    printf '%s' "$value" | vercel env add "$key" production --force 2>/dev/null || true
  done < "$ENV_FILE"

  # Verify required vars
  echo ""
  echo "Checking required environment variables..."
  MISSING=()
  for var in "${REQUIRED_VARS[@]}"; do
    if ! grep -q "^${var}=" "$ENV_FILE"; then
      MISSING+=("$var")
    fi
  done

  if [ ${#MISSING[@]} -gt 0 ]; then
    echo "⚠️  Warning: The following required vars are missing from $ENV_FILE:"
    for var in "${MISSING[@]}"; do
      echo "   - $var"
    done
    echo "   Add them to $ENV_FILE or set them in the Vercel dashboard."
  else
    echo "✅ All required environment variables found."
  fi
else
  echo "⚠️  No $ENV_FILE found. Make sure environment variables are set in the Vercel dashboard."
fi

if $ENV_ONLY; then
  echo ""
  echo "✅ Environment variables synced. Skipping deploy (--env-only)."
  exit 0
fi

# ---- Build check ----

echo ""
echo "🏗️  Running local build check..."
npm run build

# ---- Deploy ----

echo ""
if $PROD; then
  echo "🚀 Deploying to PRODUCTION..."
  vercel --prod
else
  echo "🚀 Deploying to preview..."
  vercel
fi

echo ""
echo "✅ Deployment complete!"
