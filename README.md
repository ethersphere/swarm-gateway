# Swarm Gateway

## Example usage

```sh
HOSTNAME=bzz.limo POSTAGE_AMOUNT=800000000 POSTAGE_DEPTH=17 node dist
time="2025-04-08T11:52:52.687Z" level="info" msg="log level=info"
time="2025-04-08T11:52:52.911Z" level="info" msg="enabled stamp manager with autobuy"
time="2025-04-08T11:52:52.914Z" level="info" msg="resolving .eth names and CIDs at *.bzz.limo"
time="2025-04-08T11:52:52.921Z" level="info" msg="starting server at bzz.limo:3000"
```

## Environment variables

### Database

The database configuration is expected to be set in the `DATABASE_CONFIG` environment variable. The format is a JSON string with the following fields:

```
{"user":"","password":"","host":"","port":-1,"database":"","ssl":{"ca": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}}
```

Password may be omitted and specified in `DATABASE_PASSWORD` environment variable instead.

### Overview

| Name                      | Default Value             | Description                                       |
| ------------------------- | ------------------------- | ------------------------------------------------- |
| PORT                      | `3000`                    | Port of the proxy                                 |
| HOSTNAME                  | `'localhost'`             | Hostname of the proxy                             |
| BEE_API_URL               | `'http://localhost:1633'` | URL of the Bee node API                           |
| AUTH_SECRET               | disabled                  | Require `authorization` header for proxy API      |
| SOFT_AUTH                 | `false`                   | Only POST requests require authentication         |
| MODERATION_SECRET         | disabled                  | Require `authorization` header for moderation API |
| INSTANCE_NAME             | `undefined`               | Name of the instance to match rules.              |
| REMOVE_PIN_HEADER         | `true`                    | Removes swarm-pin header on all proxy requests.   |
| POSTAGE_STAMP             | `undefined`               | Hardcoded batch ID for uploads.                   |
| POSTAGE_DEPTH             | `undefined`               | Batch depth for autobuy.                          |
| POSTAGE_AMOUNT            | `undefined`               | Batch amount for autobuy.                         |
| POSTAGE_THRESHOLD_USAGE   | `0.85` (85%)              | Threshold for usage of batches                    |
| POSTAGE_THRESHOLD_SECONDS | 1 hour                    | Threshold for TTL of batches                      |
| POSTAGE_KEEP_ALIVE        | `false`                   | Keep batches alive.                               |
| LOG_LEVEL                 | `'info'`                  | Log level that is outputted (`info`, `debug`)     |
| HOMEPAGE                  | `undefined`               | Swarm hash that loads as the homepage             |
| POST_SIZE_LIMIT           | `'1gb'`                   | Maximum size of the POST request body.            |
