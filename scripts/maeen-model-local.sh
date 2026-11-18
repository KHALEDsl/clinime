#!/bin/sh
set -eu
cache="${CLINIME_MAEEN_CACHE:-$HOME/Library/Caches/ClinimeMaeen}"
engine=$(find "$cache/engine" -type f -name llama-server | head -1)
model="$cache/qwen35-9b.gguf"
test -x "$engine" && test -s "$model" || { echo 'Install the local llama.cpp engine and Qwen model first.' >&2; exit 1; }
umask 077
if [ ! -s "$cache/local.key" ]; then openssl rand -hex 32 > "$cache/local.key"; fi
exec "$engine" --api-key-file "$cache/local.key" -m "$model" --alias maeen --host 127.0.0.1 --port 18997 -c 8192 -np 1 --reasoning off --no-webui --no-warmup
