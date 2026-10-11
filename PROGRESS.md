# Voxera redesign and broadening progress

## Audit

- The audit found a FastAPI backend in `backend/main.py`, with `backend/database.py` adapting SQL for SQLite/PostgreSQL and additive schema setup in the backend. Bearer-token auth resolves participant, organiser, and platform-owner roles; organisation/programme endpoints enforce tenant ownership where required.
- The frontend is a plain JavaScript PWA loaded from `index.html`; `app.js`, `features.js`, and `real-ui.js` expose shared globals and render existing screens. The CSS palette starts with a small set of variables but includes many literal colours and a bespoke dark-mode override section.
- Public discovery now includes unauthenticated, read-only activity Explore and organisation profile pages addressed by stable slugs. Follows, age-range analytics, and owner moderation queues remain unimplemented.
- Current reports already provide useful totals for participants/enrolments, applications, waitlists, completion, valid attendance by modality, certificates, programme-level status/attendance, follow-up cases, and outcome check-ins.
- Baseline regression: `.venv\\Scripts\\python.exe -m unittest backend.test_core` passed all 62 tests before implementation.

## Milestones

- [x] Milestone 1 — Audit and plan.
- [x] Milestone 2 — Safety net code complete: server-side rate limits and encrypted nightly backup workflow/path are implemented and locally validated. GitHub secret configuration and a restore test remain pending.
- [x] Milestone 3 — Stage Glow tokens, light/dark system, reviewable UI kit, reduced motion, and contrast docs implemented. Needs browser review on low-end devices.
- [x] Milestone 4 — Additive activity types, broader organisation types and topic categories; old records retain the `programme` default and existing API updates preserve stored types when omitted.
- [x] Milestone 5 — Added a public guest entry and read-only Explore shell with sign-in/apply calls to action.
- [x] Milestone 6 — Added a rate-limited, paginated public activity endpoint with server-side type/category/search filters and no participant-level data.
- [x] Milestone 7 — Added stable organisation slugs, a public profile API, and read-only public pages with published activity summaries.
- [x] Landing experience — Added an image-led first-visit story page, platform/vision/mission and AI information, clear participant and organisation calls to action, and 3D depth motion with reduced-motion support.
- [x] Landing experience — Browser smoke-tested desktop/mobile layouts, the mobile menu, reduced-motion behavior, stock image loading, guest activity discovery, and participant/organisation registration paths.
- [ ] Release hardening — Review on physical low-end devices and complete full accessibility/performance regression.
- [x] Milestone 9 — Added organisation-scoped outcome response counts/rates to reports and a report view for post-programme participant reflections.
- [x] Milestone 8 — Added a text-only public organisation page builder with up to eight ordered sections, a legacy-safe settings API, and anonymous/public plus participant-profile rendering.
- [ ] Milestone 9 — Outcomes and track record.
- [ ] Milestone 10 — Audience analytics.
- [ ] Milestone 11 — Trust, moderation, and media safety.
- [ ] Milestone 12 — Participant journeys and delight.
- [ ] Milestone 13 — Accessibility, performance, release hardening, and regression.

## Decisions and known setup requirements

- Existing deployment context already uses Neon PostgreSQL, so no database cutover is planned. Cloud staging and encrypted backup require operator-provided repository secrets; this code does not inspect or modify live credentials/data.
- Cloudflare R2 requires checkout to activate. The official setup page does not say whether a payment card is required, so do not activate R2 until that is confirmed. Existing B2 storage remains the current media setup.
- Render Free sleeps after 15 minutes, loses local filesystem changes, blocks outbound SMTP ports, and may suspend services if included bandwidth/build limits are exceeded. Do not rely on its local disk or direct SMTP.
- Neon Free currently lists 1 GB storage, 100 compute-hours/project, 5 GB public transfer and up to 10 branches; Cloudflare Pages Free lists 500 builds/month and 20,000 files/site. Provider details and caveats are recorded in `docs/DATABASE_MIGRATION.md`; recheck before activation.
- The frontend is plain JavaScript with no framework or Vite dependency. Stay framework-free unless a targeted change proves unsafe.
- Tabby was reviewed as a potential Voxera assistant provider. It is a self-hosted coding assistant/server with optional chat models, not a managed general-purpose AI API. Tabby exposes `/v1/chat/completions` as server-sent events (SSE); Voxera's existing provider client expects a single JSON response and sends JSON-mode output settings, so Tabby is not a drop-in endpoint today. Making it work would require a provider adapter and a separately hosted Tabby/model service. Render Free is not a suitable host for that persistent inference service. Do not make Tabby a dependency or enable external processing by default.

## Existing app capabilities to preserve

- Responsive programme-first app with organiser, participant, and admin views, following the warm cream/coral style of the supplied Voxera UI references.
- FastAPI service with SQLite/PostgreSQL persistence, password hashing, signed sessions, and role-checked routes.
- Programme/session setup, applications, capacity/waitlist handling, participant records, attendance tracking, and organizer reports/CSV export.
- Live-session signaling/presence, recording upload, participant messaging and receipts, follow-up automation controls, triage cases, and local safety-aware intent handling.
- Consent/preferences, account data removal, demo reset/clock tools, recording watch progress and quiz gating, certificate issuance, and QR verification.
- Installable PWA shell, HTTPS-capable local startup, deployment configuration, and backend unit tests.

## Not yet production-ready

- Local ASR, translation, and LLM model weights are optional and not included. Native-language templates need review by fluent local speakers.
- Browser camera/microphone permissions, live WebRTC sessions, recording playback, Android HTTPS, real QR scans, and end-to-end participant journeys require device/manual rehearsal.
- Tests cover selected backend rules, not every API route or full multi-device workflow. Authentication, deployment, backups, retention, and audit controls need a security review before real data or production use.
- The attached public-site, page-builder, analytics, moderation, and broadening scope is not implemented yet.

## Validation

- Current landing-page pass: `npm.cmd run build`, JavaScript syntax checks for `real-ui.js`, `app.js`, and `sw.js`, `git diff --check`, and `.venv\\Scripts\\python.exe -m unittest backend.test_core` passed (70 tests). A local browser smoke test verified desktop/mobile rendering, mobile navigation, reduced motion, stock image loading, public Explore navigation, and participant/organisation account creation routes. Contrast values in `docs/DESIGN_TOKENS.md` were recalculated for the current palette. Physical-device and full accessibility/performance review remain outstanding.
- Organisation page builder: 70 backend tests passed, including additive migration, section size/blank validation, preservation when older clients omit page sections, and public API output. Browser-tested adding/saving a section and viewing it on a public profile alongside an activity. Text remains escaped by the existing frontend renderer.
- Programme outcomes: report API now returns tenant-scoped sent/replied counts and response rates; report UI lists submitted reflections with their programme/check-in context. Regression tests verify responses from other organisations are not exposed.
- Milestone 4–7: `.venv\\Scripts\\python.exe -m unittest backend.test_core` passed 70 tests, including existing-schema migration, slug collision handling, old-client update behavior, activity type validation, and anonymous public-list/profile data checks.
- Milestone 4–7: `npm.cmd run build`, `node --check real-ui.js`, `node --check app.js`, and `git diff --check` passed. A browser smoke test verified guest Explore with both empty and populated results, the sign-in/join actions, in-app profile navigation, a direct `/organisations/{slug}` deep link, and Stage Glow stylesheet delivery.
