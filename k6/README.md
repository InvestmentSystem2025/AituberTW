# k6 load testing (staging)

This folder contains small k6 scripts intended for **staging**.

## Prerequisites

- k6 installed on your machine/runner
- Staging is protected by Caddy Basic Auth (frontend only)

## Quick start

```bash
k6 run ^
  -e BASE_URL=https://stg.ai-interview.tw ^
  -e BASIC_USER=stg ^
  -e BASIC_PASS=YOUR_PASSWORD ^
  k6/stg_http_smoke.js
```

Notes:

- If you use a hashed password in Caddy (`BASIC_AUTH_PASS_HASH`), k6 still needs the **plaintext** password for the `Authorization: Basic ...` header.
- If you later decide to protect only certain routes, adjust the script accordingly.

