#!/bin/bash
set -uo pipefail

node dist/index.js &
gateway=$!

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
proxy=$!

shutdown() {
	kill -TERM "$gateway" "$proxy" 2>/dev/null || true
}

trap shutdown TERM INT

# Exit as soon as either service dies so the orchestrator restarts the container.
wait -n
status=$?

shutdown
wait

exit "$status"
