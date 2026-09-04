# Backend configuration

`env.ts` is the only schema for backend runtime configuration. It validates
environment values before production clients are constructed and exposes typed,
grouped configuration through `runtime.ts`.

Copy `../.env.example` to `../.env` for local backend execution. Do not use an
example file as a Docker runtime env file, and never use the former predictable
Rocket.Chat token fallback. `CIPHER_KEY` must be generated as `openssl rand
-base64 32`.

Production requires a Rocket.Chat integration token and at least one trusted
callback origin. It also requires either `OPENAI_API_KEY` or both OpenRouter
keys. Optional feature values are documented in `../.env.example`.
