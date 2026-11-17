# Security & privacy notes — NutriSnap AI

## What this app contains

- No API keys, tokens, passwords, or credentials of any kind. Verified by scanning the working tree and the full git history for key patterns (GitHub tokens, Google/AWS/OpenAI/HF key formats, private keys, local usernames) — nothing found.
- The only network calls the app makes are:
  - `world.openfoodfacts.org` — a public, keyless open database (read-only search/lookup).
  - Nothing else. The AI model runs locally in the browser (ONNX Runtime WASM + a public Apache-2.0 MobileNetV2/Food-101 model bundled in `assets/`).
- No backend, no database, no accounts. All user data (profile, food diary, weight) is stored only in the visitor's own browser `localStorage` and never leaves their device. Photos are processed on-device and never uploaded.
