# Voxera MVP demo

A mobile-first programme management MVP styled around the supplied Voxera UI references. It implements local accounts and roles, organiser programme/session management, participant applications and waitlists, attendance, follow-up cases, messaging, reports, consent, and completion certificates with QR verification.

Multiple organisations can create accounts on the same Voxera installation. Each organisation has its own workspace and access to organiser features; programme, participant, messaging, attendance, and reporting access is scoped to the relevant organisation and programme.

## Platform owner console

The separate **Platform owner access** sign-in is for the server owner, not organisers or participants. Create an owner account locally from the project root with `.\.venv\Scripts\python.exe -m backend.manage_owner`; the command prompts for the account name, email, and a 12-character-minimum password without echoing the password. Do not provision this account through participant or organisation registration. Owner sessions expire after one hour, and permanent participant deletion requires the owner password again plus typing the participant email.

The owner console shows account email addresses, registration and successful sign-in activity, organisation accounts, programme status, live-session counts, and the application audit trail. It can block/unblock participant or organiser accounts, permanently delete a participant after confirmation, archive/restore an organisation while preserving its records, and block/unblock a programme. Moderation actions require a reason and are audit logged. Archiving or blocking is refused while a related class is live; end live classes through the normal organiser workflow first. Programme blocking hides it from public discovery and prevents new applications but does not erase history or revoke existing enrolment access. The read-only owner assistant answers aggregate operational questions locally; it does not inspect private message contents, call an external AI service, or perform changes. If a local Ollama model is installed, set `VOXERA_OWNER_OLLAMA_MODEL` on the server to enable local model-generated answers from aggregate counts only; without that setting, Voxera uses deterministic local answers.

The owner console does not provide hidden access to live classes or bypass participant enrolment checks. Owner credentials and the Voxera data directory should be protected by the server operator; use HTTPS for any network-accessible deployment.

Organisers create programme details separately from sessions. The programme form has topic categories and field-by-field help. On the organisation's Programmes page, select a programme card to open its Classes page, which lists all sessions, live recordings, and uploaded class videos. Programme cards also provide distinct actions for editing programme details and managing sessions; sessions can be added or deleted from the session manager. Programme applications in approval mode must be accepted before participants can see session schedules or recordings. Participants can see schedules only for programmes in which they are enrolled or completed. Participant schedule data refreshes while they are browsing Home, Discover, or My Programmes. Programmes can include an optional PNG, JPEG, or WebP cover image (up to 5 MB).

Applying to a programme now creates its private participant–organisation conversation automatically, so the organiser and participant can reply without first setting up a separate chat.

Organisers have a separate **Follow-Up** workspace for enabling the single-worker background scheduler, selecting missed-attendance, recording-deadline, attendance-threshold, and post-programme triggers, choosing the message cap and check-in interval, and reviewing automated deliveries. Post-programme check-ins stop after the configured limit (three by default). Voxera infers missed attendance only after a session and any recording grace period have elapsed; valid attendance resets a consecutive-miss streak. Automated messages are in-app only, require participant follow-up consent, and respect opt-out. Replies stay in the AI-labelled support thread; known topics get a Voxera response, while safety, complaints, requests for staff, uncertain messages, or disabled follow-up consent are routed to the organisation’s staff inbox. These support threads and their delivery history are kept out of ordinary Conversations.

Participant Discover has separate programme and organisation views. Programme search can be narrowed by category, format, location, and availability. Organisation pages list their open and ongoing programmes along with completed programme history; completed programmes no longer appear in the general programme results. Organisers can end a programme from its card in Programmes; ending it preserves enrolment and attendance records and makes it visible in that organisation's history. When a participant asks Voxera to contact staff without an explicitly selected programme conversation, Voxera asks which applied-to or joined programme the request concerns and displays the owning organisation before sending anything.

The participant assistant accepts typed questions and, where available, reviewed voice transcripts. It answers greetings and uses programme titles, categories, descriptions, participant ratings, and review comments to find grounded open or ongoing programme recommendations. Hosted AI remains opt-in; no recommendation depends on external AI consent. Participants can rate a programme and optionally leave a comment after enrolling or completing it. Each participant has one editable review per programme; average ratings and comments are visible to participants.

Organiser reports refresh every few seconds while the organiser is viewing the workspace. Reported enrolments count only approved or completed participants; applications and waitlists are reported separately, and completion rate is based on completed versus approved programme enrolments. Participant CSV exports are restricted to the signed-in organisation. Both organiser and participant accounts can edit their personal details, upload a private profile photo up to 10 MB, remove it to return to initials, and choose a saved light or dark theme. Organisers can also update their organisation details, profile picture, and banner, configure follow-up rules, and replay a first-time guided tour that links directly to each role's main workflows.

The organiser workspace keeps its main navigation to Dashboard, Programmes, People & attendance, Messages, Reports, and Settings. Attendance is a tab within People; live-class controls and a one-click Groups link are available from programme Classes. Messages has separate Private chats and Groups tabs. A programme group is available only to that organisation and participants with approved or completed enrolments. Organisers appoint participant group admins; group admins can switch posting to admin-only, while everyone in the group can still read. Group posts identify their author; selecting an approved member opens their name, profile photo, area, programme counts, and attendance summary. Participant names and avatars in organiser participant and attendance records open a tenant-scoped profile with programme status, attendance, and video progress. Participants can discover and privately message peers only when both have approved or completed enrolment in the same programme; these threads are polled for updates and are hidden when that shared approval is revoked.

Organisers can upload or remove an organisation profile picture and banner up to 10 MB, and edit the public description, website and social links, contact email, phone, and location from Settings. They can choose whether Voxera AI is the first contact; participants can still start a direct organisation chat either way. Participants can message any public organisation from Discover or Messages without first applying to a programme, and the private organisation conversation is visible only to that participant and the organisation's staff. Asking Voxera to open a named organisation chat takes the participant to that direct conversation; unmatched names are not guessed. The participant-facing organisation profile displays public details below the banner and separates active from completed programmes. Human-support escalation remains limited to programmes the participant has applied to or joined under that organisation.

Class video upload is available near the top of the Classes page in an expandable quick-upload card, rather than below the full video list. Both the organiser Classes page and the participant's programme page can search that programme's sessions by title, date, live status, or video availability. Ending a programme requires confirmation and is blocked while one of its live sessions is running. Ended programmes remain viewable in history with existing sessions and videos, but organisers cannot add sessions, start live classes, or upload videos. Existing programme details can still be edited, but an ended programme cannot be reopened. These restrictions are enforced by the API as well as the interface. Organisers can delete a recording without deleting its session; that also removes its captions, saved watch position, and recording-based attendance. Video playback uses the browser's native controls (including volume) and retains the source video's audio track; saved live recordings include microphone audio when the organiser grants microphone permission.

Organisation staff now handle participant chats and human-support escalations from one **Messages** workspace. Requests are attached to the programme the participant applied to or joined; case replies are sent into that same support thread. Participants can also ask Voxera about account help, applications, schedules, attendance, recordings, QR check-in, and certificates. A deployment-configured hosted AI can answer broader questions using the participant's own enrolments, sessions, attendance, and recording progress; participants must separately opt in before confirmed text and this limited context are sent to that provider. Safety concerns, complaints, requests for a person, staff decisions, and unsupported private facts still go to the programme team. Local rules and the optional local Ollama model remain available as fallbacks. Voice audio is transcribed locally or by the explicitly chosen browser speech provider; only the reviewed, confirmed transcript can be sent to hosted AI, never the audio itself.

## Attendance, recordings, and live classes

Each participant has one signed personal check-in QR in Profile; it identifies the person, not a programme. For an in-person class, the organiser opens that physical session's **Check attendance** action (or Attendance → **Mark physical attendance**), selects the exact programme session/date, and scans each enrolled participant's QR. The check-in is saved once against that session; scanning again updates the same participant/session record rather than creating duplicates. Alternatively, the organiser can display that session's QR for participants to scan or use the manual enrolled-participant fallback. A QR check-in cannot be applied to an online/live session or to a participant who is not enrolled. Groups are automatically available per programme under Messages → Groups; no separate group-creation form is needed. Camera scanning requires a browser with `BarcodeDetector` support and HTTPS (localhost is also considered secure). Live and recording attendance are only recorded by their respective verified workflows.

Organisers can choose whether to save a live session; saving is off by default and the choice remains visible while the session is live. Saved WebM live recordings upload when the organiser ends the session, refresh into the programme's Classes library, and appear on that session's video card. The Classes page has a direct live-class launcher below the upload panel: choose a scheduled online session there to open its live controls without using a video card's Live controls button. Enrolled participants can join the live WebRTC room while it is running and watch its saved recording from My Programmes. Organisers can also upload WebM, MP4, or Ogg videos for a selected session from the Classes page. Recording uploads are limited to 500 MB and are available to enrolled or completed participants in that programme. The organiser can keep each recording available without an expiry date, or use its session recording deadline; availability can be changed later without re-uploading. Playback progress and position are saved per participant and resume on the next visit. Browser video controls provide seeking and captions when a WebVTT track is available.

My Programmes opens a programme detail page with session cards, recording thumbnails or “video coming soon” placeholders, live-join actions, and recording playback. Active live sessions include a persistent group chat shared by the organiser and enrolled participants. Uploaded recordings include a comment thread shared with the programme team and enrolled participants.

Automatic live captions are an opt-in browser speech-recognition feature, separate from the recording choice. Browser speech providers may process audio outside Voxera; captions appear to live participants and are included in a saved recording's WebVTT track when available. Uploaded videos can include a WebVTT sidecar file, or staff can generate English captions locally when FFmpeg, the optional `faster-whisper` dependency, and the `models/faster-whisper-small` model are installed. Caption generation does not send media to a hosted service.

Live classes use browser WebRTC. By default, no ICE servers are configured, which is suitable only for connectivity paths that do not need NAT traversal. Configure `VOXERA_ICE_SERVERS` as a JSON array of ICE server objects to enable STUN/TURN, for example:

```json
[{"urls":"stun:stun.example.com:3478"},{"urls":"turn:turn.example.com:3478","username":"service-user","credential":"provided-by-your-TURN-service"}]
```

Supply this value through the deployment's environment/secret manager, not committed source. For internet-facing sessions, configure and test a TURN service; STUN alone does not guarantee connections through restrictive networks. The application forwards ICE server configuration only to authorised session users. Browser camera and microphone access requires HTTPS outside localhost.

## Run locally

Requires Python 3.11+. On Windows, run `start.ps1`; on macOS/Linux, run `./start.sh`. The first run creates `.venv` and installs the API dependencies. Open `http://localhost:4173`. Set `VOXERA_PORT` to use another port.

The local database path defaults to `data/voxera-live.db` and can be changed with `VOXERA_DB`. The app does not automatically seed demo accounts on startup. Existing local databases may contain demo records; do not use those records as production data.

## Production deployment guardrails

The API now refuses to start with `VOXERA_ENV=production` unless a strong `VOXERA_SECRET`, an absolute `VOXERA_DB` path, and an absolute `VOXERA_DATA_DIR` path are configured. Both database and file storage must be durable, private, backed up, and writable by the service account. Keep the secret stable across restarts and provide it through the deployment's secret manager; do not commit it or generate a new value on each restart. If the browser and API use different origins, configure `VOXERA_ALLOWED_ORIGINS` as a comma-separated list of HTTPS origins. Same-origin deployments can leave it unset.

For the current single-host FastAPI design, mount a persistent volume (for example at `/var/lib/voxera`), set `VOXERA_DB=/var/lib/voxera/voxera.sqlite` and `VOXERA_DATA_DIR=/var/lib/voxera`, and start one application process with `uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-4173}" --workers 1`. The in-memory WebSocket room registry requires a single instance and worker; configure the reverse proxy to preserve WebSocket upgrades for `/api/ws`. Do not scale this service horizontally until messaging/signaling use shared infrastructure.

Production mode disables demo time controls and adds basic browser security headers, but these safeguards do not make this MVP production-ready by themselves. Live video still requires a configured and validated TURN service for reliable connections across typical internet/NAT/firewall boundaries. Rate limiting, operational monitoring, restore-tested backups, retention controls, independent security/privacy review, and real multi-device testing are still required before storing real participant data. The local `start.ps1`/`start.sh` scripts are for development and should not be used as an internet-facing production process.

### Render deployment starter

The repository includes a Render Blueprint (`render.yaml`), Docker image definition (`Dockerfile`), and `.dockerignore`. The Blueprint uses Render's free web-service plan; it does not include a persistent disk. Configure a hosted PostgreSQL `VOXERA_DATABASE_URL`, private S3-compatible bucket settings, SMTP settings for email verification, and optional Redis settings in Render before relying on the deployment. Free web services may sleep while idle, so the first request and WebSocket reconnects can be delayed; free quotas and plan behavior can change.

After the first deploy, open the service's Shell in Render and run `python -m backend.manage_owner` to create the platform-owner account on the deployed database. Set `VOXERA_API_URL` as a GitHub repository variable and `VOXERA_SCHEDULED_JOB_SECRET` as a GitHub Actions secret to enable the included scheduled follow-up workflow. The service's public `onrender.com` URL appears in the dashboard. Do not use real participant records for a public trial; operational backups, retention controls, monitoring, and independent security/privacy review are still required before handling sensitive real-world data.

## Optional local AI and mobile access

The app runs without downloading AI models or configuring a hosted provider. For hosted, OpenAI-compatible chat completions, set `VOXERA_AI_API_KEY` (or `OPENAI_API_KEY`) in the server's secret manager; optionally set `VOXERA_AI_BASE_URL` (defaults to `https://api.openai.com/v1`) and `VOXERA_AI_MODEL` (defaults to `gpt-4.1`). Never put API keys in source code or browser configuration. Hosted processing is used only for participants who enable **Allow external AI for text answers** in Profile. Existing accounts default to off, and voice-storage consent is separate. With consent, the assistant can answer general knowledge and maths questions as well as questions grounded in the participant's programme data. Without hosted consent/configuration, a locally installed Ollama model can answer general questions; Voxera's local rules continue to answer common programme and account questions.

Local speech transcription and translation require the optional packages and model files described in `backend/requirements-ai.txt` and `scripts/download_models.py`; review their download size and storage requirements before using the downloader. The optional Ollama fallback requires a locally installed and running model (by default `qwen2.5:3b-instruct`). Voxera is prompted to handle small talk, general questions, and maths, but this is not model fine-tuning and answer quality depends on the configured model. If no AI model is available, Voxera says so rather than pretending to answer or routing an unrelated general question to programme support. Uncertain programme/account facts, safety concerns, staff decisions, complaints, and explicit human requests continue to be escalated.

When local voice models are unavailable, a supported browser may offer **Use browser speech recognition** as an explicit alternative. Audio is handled by the browser's speech-recognition provider and may be processed outside the Voxera server; Voxera receives only the transcript after the participant reviews and confirms it. Typing remains available, and this browser fallback does not require enabling voice-recording storage consent.

For camera/microphone access from Android, browsers require HTTPS. Create trusted local certificates in `certs/` as described under **Local network and HTTPS** in `PRIVACY_NOTES.md`; then run the server on the same trusted network. Do not expose this demo server to the public internet.

## Checks

Run `.venv/Scripts/python.exe -m unittest backend.test_core` on Windows, or `.venv/bin/python -m unittest backend.test_core` on macOS/Linux. `scripts/doctor.py` checks the local model/runtime setup.

Session descriptions can be added while creating sessions and are shown on participant schedules and in programme-group message views. Participant programme cards open their session details, including ended-programme history when the participant has approved access. Organisation social links are grouped in a collapsible settings section and displayed with compact platform marks on public profiles.

## Deploying the frontend to Vercel

Voxera can serve its static frontend and a small runtime-configuration function from Vercel while keeping the FastAPI service on Render. Keep the API on a long-lived web service: live classes use WebSockets, and large media is served by FastAPI rather than serverless function uploads.

1. Push this repository to GitHub and deploy its existing `render.yaml` Blueprint on Render. Before the first app request, configure PostgreSQL, object storage, and the scheduled-job secret in the Render environment. Note the deployed service's HTTPS origin, for example `https://your-voxera-service.onrender.com`.
2. Import the same repository into Vercel. Use the repository root as the project root and the default static build settings; `vercel.json` configures the runtime configuration function.
3. In the Vercel project's Environment Variables, set `VOXERA_API_ORIGIN` to the Render service origin only (scheme and host, no path). Make it available in each Vercel environment you deploy.
4. Deploy on Vercel and note the public production origin, for example `https://your-project.vercel.app`.
5. In the Render service environment, set `VOXERA_ALLOWED_ORIGINS` to the exact Vercel origin(s), comma-separated if using a custom domain too. Set `VOXERA_PUBLIC_URL` to the primary public Vercel origin. Save and redeploy/restart the Render service.
6. Open the Vercel production URL and test account creation/sign-in, programme and message screens, media uploads/playback, live sessions, and follow-up settings. For Vercel preview deployments, add each preview origin that needs API access to `VOXERA_ALLOWED_ORIGINS`; production deployment URLs are preferable for real user data.

### Email verification, Google sign-in, and password recovery

The Render Blueprint enables email verification for new password-based participant and organisation accounts. Configure these backend environment variables before the first deployment:

- `VOXERA_SMTP_HOST`, `VOXERA_SMTP_PORT`, `VOXERA_SMTP_USERNAME`, and `VOXERA_SMTP_PASSWORD` for an SMTP provider that permits authenticated STARTTLS (or implicit TLS on port `465`).
- `VOXERA_EMAIL_FROM` as the sender address authorized by that provider.
- `VOXERA_PUBLIC_URL` as the exact HTTPS Vercel/custom-domain origin, without a trailing path.
- `VOXERA_EMAIL_VERIFICATION=true` to require verification for new password-based accounts. When enabled, the backend refuses to start unless the SMTP host, sender, and public app URL are configured. Local development leaves verification off unless explicitly enabled.

The same mail settings power expiring password-reset links. Google sign-in is optional: create an OAuth 2.0 **Web application** client, then set `VOXERA_GOOGLE_CLIENT_ID` and `VOXERA_GOOGLE_CLIENT_SECRET` in the backend's secret environment. Add this exact authorized redirect URI in Google Cloud Console: `https://<backend-origin>/api/auth/google/callback`; set `VOXERA_API_PUBLIC_URL` to that backend HTTPS origin and keep `VOXERA_PUBLIC_URL` set to the frontend origin. Google confirms the email before Voxera links it to an existing account or creates a new participant/organisation account. Do not expose SMTP or OAuth secrets in Vercel frontend variables or source code.

Verification and reset tokens are single-use, stored as hashes, and expire; Google OAuth uses short-lived, single-use state and completion codes. Password sign-in remains available, and the sign-in/registration forms include show/hide controls for passwords. Set `VOXERA_EMAIL_VERIFICATION=false` to disable email verification where appropriate; Google sign-in only appears when both Google OAuth credentials and the public API origin are configured.

The frontend reads its API origin from `/api/runtime-config`; this value is public and must contain no credentials or secrets. If `VOXERA_API_ORIGIN` is missing or invalid, the Vercel frontend still loads and displays a configuration error when an API action is attempted. API requests, large media transfers, and WebSocket live-room connections go directly to Render rather than through Vercel Function request-body limits. Keep `VOXERA_SECRET`, database and storage credentials only in Render's secret environment. Do not use Vercel's filesystem for application data.

## Deploying the full app to Render

For a single-origin deployment, deploy the repository root to Render using the included `render.yaml` Blueprint. It builds the existing `Dockerfile`, installs the Python backend dependencies, and starts FastAPI on Render's assigned `PORT`. The included free web-service Blueprint has no persistent disk and therefore requires the external PostgreSQL and object storage configuration.

The root `package.json` also provides `npm run build` for a Python syntax/build check and `npm start` for starting FastAPI in a local Node-enabled environment. The Render Blueprint uses Docker directly rather than depending on Node or npm; its Docker command also reads `PORT` dynamically. Deploy the repository, not a static-only `dist` export, so the backend, Python dependencies, and persistent-storage configuration remain available.

### Optional S3-compatible media storage

The backend can keep uploaded programme images, profile photos, organisation photos and banners, recordings, captions, and consented voice notes in a private S3-compatible bucket such as Cloudflare R2. Create a private bucket and configure these backend environment variables in the host's secret manager:

- `VOXERA_S3_ENDPOINT_URL`: the provider's HTTPS S3 endpoint (for R2, the account endpoint).
- `VOXERA_S3_BUCKET`: the bucket name.
- `VOXERA_S3_ACCESS_KEY_ID` and `VOXERA_S3_SECRET_ACCESS_KEY`: credentials scoped to that bucket.
- `VOXERA_S3_REGION`: optional; defaults to `auto`, as used by R2.

Set all four required values together. If none are set, the app keeps using local files. A partial or non-HTTPS configuration fails during startup instead of silently falling back to local storage. Voxera serves the objects through its existing authorization-checked API routes; do not make the bucket public or put its credentials in frontend/Vercel variables. Existing local uploads are not migrated automatically: copy them to the matching `uploads/` and `profile-photos/` object prefixes before relying on the bucket.

Object storage persists media only. Programme covers and photos are fetched into the service's local cache; class recordings can be streamed from the bucket with byte-range support, avoiding a full local copy for playback. Media generation/processing workflows may still need temporary disk space. PostgreSQL persists accounts, programmes, enrolments, conversations, and settings. Free-tier quotas and retention/pricing can change, so check the provider's current limits before storing data there.

### PostgreSQL and migration

Set `VOXERA_DATABASE_URL` to a PostgreSQL connection URL. This is required in production when using the free Blueprint; the local environment continues using SQLite when it is absent. Schema setup is automatic and health reports identify the active database. To migrate existing data, first create a **new empty** PostgreSQL database, back up the SQLite file, stop writes to the old app, then set the storage variables and run:

```powershell
$env:VOXERA_DATABASE_URL = "postgresql://..."
$env:VOXERA_SQLITE_SOURCE = "C:\path\to\voxera-live.db"
.\.venv\Scripts\python.exe scripts\migrate_sqlite_to_postgres.py --confirm-empty-target
```

The migration command refuses non-empty destination application tables; it does not delete existing data. Keep the original SQLite file as a backup and verify user sign-in, programme creation, chat, attendance, and reports on the PostgreSQL deployment before switching traffic.

Redis is optional for the app's ordinary user-message notifications, but set `VOXERA_REDIS_URL` to enable shared WebSocket message and live-room signalling across multiple service instances. Without Redis, health reports `single-instance`; do not scale the API horizontally. Redis does not replace a TURN server for reliable video calling.

Production defaults to `VOXERA_FOLLOWUP_SCHEDULER=external`, so follow-ups do not depend on the web process staying awake. A protected endpoint is called by the included GitHub Actions workflow every 15 minutes. Configure the same random, high-entropy secret as `VOXERA_SCHEDULED_JOB_SECRET` in Render and as the GitHub repository secret; set the deployed HTTPS origin as GitHub's `VOXERA_API_URL` variable. PostgreSQL advisory locking prevents overlapping scheduled runs. `inline` is available for local development; `disabled` turns off automatic scheduled delivery.

## Main folders

- `backend/`: FastAPI API, SQLite schema, role checks, local AI and safety logic.
- `api/`: Vercel runtime configuration endpoint for the frontend.
- `data/`: local database and generated uploads/certificates (ignored by Git).
- `scripts/`: environment checks and optional model download/test helpers.
- `demo/`: facilitator run sheet and sample voice phrase guidance.
- `index.html`, `app.js`, `features.js`, `styles.css`: responsive PWA interface.

This is an MVP demo, not a hardened production service. Use fictional data until security, deployment, consent, translation quality, and operational workflows are reviewed.
