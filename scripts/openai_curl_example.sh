#!/usr/bin/env bash
set -euo pipefail

# scripts/openai_curl_example.sh
# Example safe curl calls to the OpenAI API. Does NOT contain any API keys.
# Usage:
# 1) Export your API key locally: export OPENAI_API_KEY="sk-..."
#    or save it to ~/.openai_key and the script will read it.
# 2) Run: ./scripts/openai_curl_example.sh
#
# IMPORTANT: Never commit real API keys to the repo. Keep keys in environment
# variables or a secret manager.

# Prefer reading from env, fallback to ~/.openai_key
if [ -z "${OPENAI_API_KEY-}" ]; then
  if [ -f "${HOME}/.openai_key" ]; then
    OPENAI_API_KEY="$(cat "${HOME}/.openai_key")"
  else
    echo "ERROR: OPENAI_API_KEY not set and ~/.openai_key not found"
    exit 1
  fi
fi

# Choose a model available to your account
MODEL="gpt-4o-mini"
PROMPT="Write a short README paragraph about calling the OpenAI API with curl."

# Basic chat completion (non-streaming)
curl -sS https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"${MODEL}\",
    \"messages\": [
      {\"role\":\"system\",\"content\":\"You are a helpful assistant.\"},
      {\"role\":\"user\",\"content\":\"${PROMPT}\"}
    ],
    \"max_tokens\": 200,
    \"temperature\": 0.6
  }"

echo

echo "=== Streaming example (Ctrl+C to stop) ==="
# Stream a chat completion. Use -N/--no-buffer so curl prints chunks as they arrive.
curl -sS -N https://api.openai.com/v1/chat/completions \
  -H "Authorization: Bearer ${OPENAI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\": \"${MODEL}\",
    \"messages\": [{\"role\":\"user\",\"content\":\"Stream a single-line haiku.\"}],
    \"stream\": true
  }"

# End of script
