# Voxera MVP status

## Implemented

- Responsive programme-first app with organiser, participant, and admin views, following the warm cream/coral style of the supplied screen reference.
- FastAPI service with SQLite persistence, demo accounts, password hashing, signed sessions, and role-checked routes.
- Programme/session setup, applications, capacity/waitlist handling, participant records, attendance tracking, and organizer reports/CSV export.
- Live-session signaling/presence, recording upload, participant messaging and receipts, follow-up automation controls, triage cases, and local safety-aware intent handling.
- Consent/preferences, account data removal, demo reset/clock tools, recording watch progress and quiz gating, certificate issuance, and QR verification.
- Installable PWA shell, HTTPS-capable local startup, seed data, scripts, runbook, and focused backend unit tests.

## Not yet production-ready

- Local ASR, translation, and LLM model weights are optional and not included. Install/download them before demonstrating model-powered speech/translation; native-language templates need review by fluent local speakers.
- Browser camera/microphone permissions, live WebRTC sessions, recording playback, Android HTTPS, real QR scans, and end-to-end participant journeys require device/manual rehearsal.
- The included tests cover selected backend rules, not every API route or full multi-device workflow. Authentication, secret management, rate limiting, deployment, backups, retention, and audit controls need a security review before real data or production use.
- The visual reference includes civic poll/news/report screens; the supplied earlier brief defines the current programme MVP, so those conflicting civic flows are intentionally not part of this build.

## Validation

`backend.test_core` passes five focused unit tests. Python compilation and JavaScript syntax checks pass. The organiser demo login and dashboard were verified in the local browser preview.
