#!/bin/bash
set -uo pipefail

bee_pid=''
caddy_pid=''
gateway_pid=''

shutdown() {
	kill -TERM $bee_pid $caddy_pid $gateway_pid 2>/dev/null || true
}

trap shutdown TERM INT

if [ -z "${BEE_PASSWORD:-}" ] && [ -z "${BEE_PASSWORD_FILE:-}" ]; then
	echo "fatal: set BEE_PASSWORD or BEE_PASSWORD_FILE to unlock the Bee wallet" >&2
	exit 1
fi

if [ "${BEE_SWAP_ENABLE:-true}" = "true" ] && [ -z "${BEE_BLOCKCHAIN_RPC_ENDPOINT:-}" ]; then
	echo "fatal: set BEE_BLOCKCHAIN_RPC_ENDPOINT to a Gnosis RPC, or BEE_SWAP_ENABLE=false" >&2
	exit 1
fi

bee start &
bee_pid=$!

caddy run --config /etc/caddy/Caddyfile --adapter caddyfile &
caddy_pid=$!

# The gateway talks to Bee on startup, so give the node a chance to bind first.
for _ in $(seq 1 "${BEE_STARTUP_TIMEOUT:-120}"); do
	if ! kill -0 "$bee_pid" 2>/dev/null; then
		echo "fatal: bee exited during startup" >&2
		shutdown
		wait
		exit 1
	fi
	if node -e "fetch('http://${BEE_API_ADDR}/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
		echo "bee api is up at ${BEE_API_ADDR}"
		break
	fi
	sleep 1
done

node dist/index.js &
gateway_pid=$!

# Exit as soon as any service dies so the orchestrator restarts the container.
wait -n
status=$?

shutdown
wait

exit "$status"
