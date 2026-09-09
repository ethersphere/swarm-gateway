#!/bin/bash
set -uo pipefail

db_pid=''
bee_pid=''
caddy_pid=''
gateway_pid=''

shutdown() {
	kill -TERM $db_pid $bee_pid $caddy_pid $gateway_pid 2>/dev/null || true
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

mkdir -p /run/mysqld
chown mysql:mysql /run/mysqld

if [ ! -d /var/lib/mysql/mysql ]; then
	echo "initialising the database"
	chown -R mysql:mysql /var/lib/mysql
	mariadb-install-db --user=mysql --datadir=/var/lib/mysql --auth-root-authentication-method=socket > /dev/null
fi

mariadbd --user=mysql --datadir=/var/lib/mysql --socket=/run/mysqld/mysqld.sock --skip-networking &
db_pid=$!

for _ in $(seq 1 "${DATABASE_STARTUP_TIMEOUT:-60}"); do
	if ! kill -0 "$db_pid" 2>/dev/null; then
		echo "fatal: mariadb exited during startup" >&2
		shutdown
		wait
		exit 1
	fi
	if mariadb-admin --socket=/run/mysqld/mysqld.sock ping > /dev/null 2>&1; then
		echo "mariadb is up at /run/mysqld/mysqld.sock"
		break
	fi
	sleep 1
done

database_name=$(node -e "process.stdout.write(JSON.parse(process.env.DATABASE_CONFIG).database || '')")

if [ -z "$database_name" ]; then
	echo "fatal: DATABASE_CONFIG has no database name" >&2
	shutdown
	wait
	exit 1
fi

mariadb --socket=/run/mysqld/mysqld.sock -e "CREATE DATABASE IF NOT EXISTS \`$database_name\`"

bee start &
bee_pid=$!

export GATEWAY_UPSTREAM="127.0.0.1:${PORT:-3000}"

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
