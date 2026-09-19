#!/usr/bin/env bash
# Copies the variables a deployment needs from .env.local onto a Railway service.
#
#   ./scripts/railway-env.sh web   <app-domain> <chat-domain>
#   ./scripts/railway-env.sh chat  <app-domain> <chat-domain>
#
# Run it from web/ with the right service linked (railway service).
set -euo pipefail

target="${1:?usage: railway-env.sh <web|chat> <app-domain> <chat-domain>}"
app_domain="${2:?missing app domain, e.g. payeer.up.railway.app}"
chat_domain="${3:?missing chat domain, e.g. payeer-chat.up.railway.app}"
env_file="${ENV_FILE:-.env.local}"

[ -f "$env_file" ] || { echo "No $env_file here. Run this from web/."; exit 1; }

read_var() { grep -E "^$1=" "$env_file" | head -1 | cut -d= -f2- || true; }

set_vars() {
  local args=()
  for pair in "$@"; do
    [ -n "${pair#*=}" ] && args+=(--set "$pair")
  done
  [ ${#args[@]} -eq 0 ] && { echo "nothing to set"; return; }
  railway variables "${args[@]}"
}

case "$target" in
  web)
    set_vars \
      "NEXT_PUBLIC_NETWORK=$(read_var NEXT_PUBLIC_NETWORK)" \
      "NEXT_PUBLIC_PAYEER_ADDRESS=$(read_var NEXT_PUBLIC_PAYEER_ADDRESS)" \
      "NEXT_PUBLIC_PACTS_ADDRESS=$(read_var NEXT_PUBLIC_PACTS_ADDRESS)" \
      "NEXT_PUBLIC_REOWN_PROJECT_ID=$(read_var NEXT_PUBLIC_REOWN_PROJECT_ID)" \
      "NEXT_PUBLIC_CIRCLE_APP_ID=$(read_var NEXT_PUBLIC_CIRCLE_APP_ID)" \
      "NEXT_PUBLIC_CHAT_URL=wss://$chat_domain" \
      "CIRCLE_API_KEY=$(read_var CIRCLE_API_KEY)" \
      "RESOLVER_PRIVATE_KEY=$(read_var RESOLVER_PRIVATE_KEY)" \
      "GROQ_API_KEY=$(read_var GROQ_API_KEY)" \
      "GROQ_MODEL=$(read_var GROQ_MODEL)" \
      "GROQ_SEARCH_MODEL=$(read_var GROQ_SEARCH_MODEL)" \
      "ANTHROPIC_API_KEY=$(read_var ANTHROPIC_API_KEY)"
    echo "Set for the app. NEXT_PUBLIC_* are baked in at build time, so redeploy: railway up"
    ;;
  chat)
    set_vars \
      "NEXT_PUBLIC_NETWORK=$(read_var NEXT_PUBLIC_NETWORK)" \
      "NEXT_PUBLIC_PACTS_ADDRESS=$(read_var NEXT_PUBLIC_PACTS_ADDRESS)" \
      "GROQ_API_KEY=$(read_var GROQ_API_KEY)" \
      "GROQ_MODEL=$(read_var GROQ_MODEL)" \
      "ALLOWED_ORIGINS=https://$app_domain"
    echo "Set for chat. Redeploy: railway up"
    ;;
  *)
    echo "First argument must be web or chat"; exit 1;;
esac
