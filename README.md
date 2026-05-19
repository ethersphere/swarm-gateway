# Swarm Gateway

An HTTP gateway that sits in front of a [Bee](https://github.com/ethersphere/bee) node (Ethereum Swarm) and exposes its content-addressed storage to the web. It handles subdomain routing for ENS names and Swarm hashes, manages postage stamps for uploads, and optionally enforces content moderation rules.

**Proxied endpoints:** `GET /chunks/*`, `GET /bytes/*`, `GET /bzz/*`, `GET /feeds/*`, `POST /chunks`, `POST /bytes`, `POST /bzz`, `POST /soc/*`, `POST /feeds/*`

**Other endpoints:** `GET /health`, `GET /readiness`, `GET /metrics` (Prometheus), `GET /gateway`

## Installation

```sh
npm install
npm run build
```

## Example usage

```sh
HOSTNAME=bzz.limo POSTAGE_AMOUNT=800000000 POSTAGE_DEPTH=17 node dist
```

```
time="2025-04-08T11:52:52.687Z" level="info" msg="log level=info"
time="2025-04-08T11:52:52.911Z" level="info" msg="enabled stamp manager with autobuy"
time="2025-04-08T11:52:52.914Z" level="info" msg="resolving .eth names and CIDs at *.bzz.limo"
time="2025-04-08T11:52:52.921Z" level="info" msg="starting server at bzz.limo:3000"
```

## Docker

```sh
docker build -t swarm-gateway .
docker run -p 3000:3000 \
  -e HOSTNAME=bzz.limo \
  -e POSTAGE_AMOUNT=800000000 \
  -e POSTAGE_DEPTH=17 \
  swarm-gateway
```

## Subdomain routing

When `HOSTNAME` is set, the gateway resolves subdomains against the Bee node:

-   `<swarm-cid>.bzz.limo` — serves the content at that Swarm hash
-   `<ens-name>.bzz.limo` — resolves the ENS name and serves the content
-   Subdomain rewrites can be configured via the database

## Environment variables

| Name                      | Default                   | Description                                                                             |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| PORT                      | `3000`                    | Port to listen on                                                                       |
| HOSTNAME                  | `localhost`               | Public hostname of the gateway, used for subdomain routing                              |
| BEE_API_URL               | `http://localhost:1633`   | URL of the Bee node API                                                                 |
| AUTH_SECRET               | —                         | If set, require this value in the `Authorization` header for all requests               |
| SOFT_AUTH                 | `false`                   | When auth is enabled, only enforce it on POST requests                                  |
| MODERATION_SECRET         | —                         | If set, require this value in the `Authorization` header for moderation endpoints       |
| INSTANCE_NAME             | —                         | Instance name used to look up moderation settings from the database                     |
| REMOVE_PIN_HEADER         | `true`                    | Strip the `swarm-pin` header from proxied requests                                      |
| POSTAGE_STAMP             | —                         | Hardcoded postage batch ID to use for all uploads                                       |
| POSTAGE_STAMP_SOC         | —                         | Hardcoded postage batch ID to use for `POST /soc/*` uploads (falls back to `POSTAGE_STAMP` if unset) |
| POSTAGE_DEPTH             | —                         | Batch depth for autobuy (required for autobuy)                                          |
| POSTAGE_AMOUNT            | —                         | Batch amount for autobuy (required for autobuy)                                         |
| POSTAGE_THRESHOLD_USAGE   | `0.85`                    | Buy a new batch when usage of the current one exceeds this fraction                     |
| POSTAGE_THRESHOLD_SECONDS | `3600`                    | Buy a new batch when TTL of the current one drops below this many seconds               |
| POSTAGE_KEEP_ALIVE        | `false`                   | Top up batches instead of buying new ones when they near expiry                         |
| LOG_LEVEL                 | `info`                    | Log verbosity: `critical`, `error`, `warn`, `info`, `verbose`, or `debug`               |
| HOMEPAGE                  | —                         | Swarm hash of a site to serve at the root path                                          |
| POST_SIZE_LIMIT           | `1gb`                     | Maximum POST body size                                                                  |
| DATABASE_CONFIG           | —                         | MySQL connection as JSON: `{"user":"","password":"","host":"","port":3306,"database":"","ssl":{"ca":"..."}}`. If unset, all database-backed features are disabled. |
| DATABASE_PASSWORD         | —                         | MySQL password (overrides the `password` field in `DATABASE_CONFIG`)                    |
| MATTERMOST_WEBHOOK_URL    | —                         | URL of the Mattermost incoming webhook used for alerts                                  |
