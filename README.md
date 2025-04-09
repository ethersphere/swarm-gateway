# Swarm Gateway

## Environment variables

### Database

The database configuration is expected to be set in the `DATABASE_CONFIG` environment variable. The format is a JSON string with the following fields:

```
{"user":"","password":"","host":"","port":-1,"database":"","ssl":{"ca": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}}
```

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

## Create schema

```sql
CREATE TABLE `allowedUserAgents` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `userAgent` varchar(100) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `approvalRequests` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `hash` varchar(128) NOT NULL,
  `ens` varchar(128),
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `reports` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `hash` varchar(128) NOT NULL,
  `reason` text,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `rewrites` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `subdomain` varchar(63) NOT NULL,
  `target` varchar(128) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `rules` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `hash` varchar(128) NOT NULL,
  `mode` enum('allow','deny') NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `settings` (
  `id` int NOT NULL PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `defaultWebsiteRule` enum('allow','deny') NOT NULL,
  `defaultFileRule` enum('allow','deny') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `rewrites`
  ADD UNIQUE KEY `idx_proxy_rewrites_subdomain_unique` (`subdomain`);

ALTER TABLE `rules`
  ADD UNIQUE KEY `idx_proxy_rules_hash_unique` (`hash`);

ALTER TABLE `settings`
  ADD UNIQUE KEY `idx_proxy_settings_name_unique` (`name`);
```
