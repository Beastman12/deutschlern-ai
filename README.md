# DeutschLern AI

An AI-powered German learning platform for CEFR levels **A1–C2**, built with vanilla HTML5, CSS3 and ES modules on the frontend, and Node.js + Express on the server.

> **Status: Release 1.0.0 — all 9 milestones complete.** The full curriculum, 17-section lesson engine, grammar drills, flashcards, 1,995-question practice bank, timed mock papers, server-side AI proxy, AI tutor, 35 curriculum-linked role-plays, browser speech recognition, optional Azure Speech fallback, Speaking Practice, Pronunciation Trainer, accounts, cross-device sync and graded reading/listening/writing with local-first analytics are implemented. Milestone 9 **hardens the platform for production**: one bounded per-IP sliding-window limiter covers every writable API, a `/api/health/ready` probe fails closed when the server is misconfigured, state normalization is tested against hostile input, and Docker, Compose, a rotated backup script and a deployment guide make self-hosting reproducible. The app remains local-first: guests work entirely in `localStorage`, authenticated learners opt in to sync, stale devices receive a revision conflict, and no credential, key or progress score is invented. AI replies still require a server-side provider key; without one, `/api/ai/status` reports `configured: false` and `/api/ai/chat` returns `503 ai_not_configured`. Browser recognition and speech playback work without any key whenever the device supports them. There is still **no phonetic or accent score** unless a real assessment service provides one.

---

## What works today

| Area | Current behaviour (Milestones 1–9) |
| --- | --- |
| Dashboard | Personal greeting, current level, next lesson, streak, weekly activity, skill overview, level path, word of the day and recommendations — all derived from real curriculum and locally recorded data. |
| German Courses | Six level pages (A1–C2), 24 modules and 72 lesson plans with objectives, key phrases, vocabulary, duration, skills and assessment metadata. |
| Lesson engine | Every one of the 72 lessons opens a 17-section body: warm-up, objectives, explanation, rules, vocabulary, examples, pronunciation, culture, dialogue, grammar, practice (multiple choice, gap-fill, word order), listening, speaking, common mistakes and a scored assessment. |
| Lesson gating | The first lesson of each level is open. Each following lesson stays locked until the previous lesson’s assessment is passed; completed lessons remain open for revision. Retakes are unlimited. |
| Grammar Academy | 30 searchable grammar topics with explanations and bilingual examples, plus 90 authored per-topic drills with a local accuracy report and reusable mistake review. |
| Vocabulary Builder | 48 searchable entries with article, plural, pronunciation, part of speech, topic and bilingual example. Favourites and German speech playback work. |
| Flashcards | A 369-card deck (curated and lesson-sourced), SM-2-style scheduling, four grade buttons, due/new filtering and a learned-word list that only `v-*` cards can populate. |
| Practice Exercises | A 1,995-question authored bank with level, skill, question-type and source filters, deep links, seeded sampling, instant feedback, a saved mistake queue and one-click targeted retry. |
| Mock Examinations | Timed 14-question papers for A1–C2 (25–45 minutes) with a countdown, autosubmit, resume after reload, section/skill scores and a readiness report. Results never reveal correct answers. |
| Writing & speaking in exams | Authored prompts and checklists on the exam result, clearly labelled **unscored self-practice**. No AI score is invented for them. |
| AI German Tutor | Text conversation at A1–C2. Replies, corrections and English explanations come only from the configured server-side provider. Optional English translation, Stop, Retry, saved local history and explicit unavailable state. |
| Real-Life Conversations | All 35 authored A1–C2 scenarios (7/6/6/6/5/5 by level) with level and scenario selectors, in-character German, corrections and explanations. |
| Talk with Partner | A dedicated spoken two-way conversation: browser German recognition with a live transcript, short natural replies from the configured AI provider spoken aloud, optional English translation, text fallback, replay and a separate voice-chat history. No transcript or reply is simulated. |
| Speaking Practice | A1–C2 authored prompts, browser Web Speech recognition, optional server-side Azure fallback, editable transcript, model audio at normal/slow speed and a real spoken AI reply. Every unavailable capability is explained instead of simulated. |
| Pronunciation Trainer | Authored model lines, real microphone recognition, normal/slow model audio, transcript comparison against target words in order, provider confidence labelled as recognition confidence, and bounded practice history. It never invents an accent or phonetic score. |
| Reading Practice | 12 authored A1–C2 passages with a glossary, English translation, German speech playback and three explained comprehension questions each. Answers are checked against authored keys; retakes are unlimited and every result is saved locally. |
| Listening Practice | 12 authored A1–C2 scripts played by the browser's German speech voice at normal or slow speed, with a transcript, translation, glossary, three comprehension questions and exact-word dictation. No audio file or score is invented. |
| Writing Practice | 12 authored A1–C2 prompts with word-range, phrase/term and sentence checks, useful phrases, an authored model answer and autosaved local drafts. Feedback is explicitly labelled as a deterministic checklist, not an AI grammar score or exam grade. |
| My Progress | A local report: completed lessons, passed assessments, attempt counts, saved words, study time, streak, weekly chart, skill bars and a new graded-skill analytics section. Writing figures count checklist rules met; speaking and pronunciation history stays separate and never changes the skill bars. |
| My Profile | Editable local profile: name, native language, goal and target level. Real account panel for sign-in, registration, password reset, logout, deletion and explicit sync controls. |
| Accounts & sync | Salted scrypt passwords, opaque signed server-side sessions, two-week session lifetime, atomic JSON persistence, password reset tokens (dev only unless email is configured), revision-checked cross-device sync and honest 503 states when disabled. |
| Settings | Light / dark / system theme, reduced motion, large text, daily goal, speech rate, demo-data preview, export/reset, AI/speaking/pronunciation counts and data-specific clear actions. |
| Navigation | All 17 navigation modules are present and live, plus the Roadmap route — 18 routes in total and no planned pages. Every control works. |
| Search | `Ctrl/Cmd + K` or the topbar search opens a command palette that searches lessons, grammar, words, quick actions, AI routes and voice routes. |
| Responsive layout | Sidebar on desktop, off-canvas drawer and bottom navigation on tablet/phone, tested from 390px to 1440px. |
| Accessibility | Skip link, landmarks, focus-visible styles, keyboard-trapped dialogs, live regions, reduced-motion support, high-contrast and print styles. Verified with axe-core across live, speech, skill-practice and account states. |

### Deliberately not built yet

- Email-delivered password reset links and production secret rotation (require provider configuration).
- A validated phonetic/accent scoring service. Pronunciation feedback is word-presence comparison only.
- AI grammar correction or an exam-grade writing score. Writing Practice reports only the authored rules it can actually check.

Milestone 9 added hardening and deployment, not another practice screen. There are no fake AI replies, no fake sign-in, no invented progress and no fabricated speech score.

---

## Quick start

Requirements: **Node.js 20+** and npm.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) while `npm start` is running.

For development with automatic server restarts:

```bash
npm run dev
```

### Temporary public preview

A Cloudflare quick tunnel can expose the local server without a Cloudflare account:

```bash
npx -y cloudflared tunnel --url http://127.0.0.1:3000
```

It prints a random `*.trycloudflare.com` URL. That URL changes whenever the tunnel restarts and stops working when the command ends. Keep `TRUST_PROXY=127.0.0.1,::1` in `.env` while it runs so per-IP limits use Cloudflare's `CF-Connecting-IP` instead of one shared loopback bucket, while forwarded headers from other peers stay untrusted. The AI proxy stays anonymous with per-IP caps, so watch provider quota while the preview is public.

Change the port with the `PORT` environment variable:

```powershell
# PowerShell
$env:PORT = "4000"; npm start
```

```bash
# macOS / Linux / Git Bash
PORT=4000 npm start
```

The app runs without any credentials:

- Without an AI key, `/api/ai/status` reports `configured: false`, AI composers are disabled and `/api/ai/chat` returns `503 ai_not_configured`. No canned or locally generated reply is substituted.
- Browser speech recognition needs no key. If the browser or device does not support it, the UI says so and keeps a manual transcript path.
- Without `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION`, `/api/speech/status` reports `configured: false` and `/api/speech/transcribe` returns `503 speech_not_configured`.
- Accounts work locally by default: in development a random persistent `SESSION_SECRET` is generated under `DATA_DIR`. In production, set `SESSION_SECRET` yourself or `/api/auth/status` reports `configured: false` and account routes return `503 auth_unavailable` — no fake sign-in is offered.

Node does **not** load `.env` automatically. `.env.example` documents the variables; export them in your shell or process manager before starting the server. Never commit real keys or expose them to frontend code.

---

## AI setup (Milestone 5)

All provider calls go through `server/ai-router.js`. The browser only calls same-origin `/api/ai/status` and `/api/ai/chat`; keys, provider URLs and raw provider error bodies never reach the page.

### OpenAI

```powershell
$env:AI_PROVIDER = "openai"
$env:OPENAI_API_KEY = "your-server-side-key"
$env:OPENAI_MODEL = "gpt-4o-mini"   # optional; this is the default
npm start
```

```bash
AI_PROVIDER=openai OPENAI_API_KEY=your-server-side-key OPENAI_MODEL=gpt-4o-mini npm start
```

### OpenAI-compatible endpoint

```powershell
$env:AI_PROVIDER = "compatible"
$env:AI_BASE_URL = "https://api.example.com/v1"
$env:AI_API_KEY = "your-server-side-key"
$env:AI_MODEL = "your-model-name"
npm start
```

```bash
AI_PROVIDER=compatible AI_BASE_URL=https://api.example.com/v1 AI_API_KEY=your-server-side-key AI_MODEL=your-model-name npm start
```

Confirm configuration with:

```bash
curl http://localhost:3000/api/ai/status
```

A configured server returns `"configured": true` with the provider and model. An unconfigured server returns `configured: false` plus a real reason such as `OPENAI_API_KEY is not set on the server.` — the variable name in that message is not a key value.

---

## Speech setup (Milestone 6)

There are two real recognition paths:

1. **Browser Web Speech API** — used automatically in Chrome/Edge and compatible browsers. No server key is needed. Microphone permission is requested only when you press a speak/record button.
2. **Azure Speech fallback** — optional. The browser records a short PCM WAV clip, posts it to this server, and `server/speech-router.js` forwards it to Azure. The subscription key is read only on the server and is never returned by `/api/speech/status`.

Configure the fallback only if you need a provider-backed transcript:

```powershell
$env:AZURE_SPEECH_KEY = "your-server-side-key"
$env:AZURE_SPEECH_REGION = "westeurope"
npm start
```

```bash
AZURE_SPEECH_KEY=your-server-side-key AZURE_SPEECH_REGION=westeurope npm start
```

Check it with:

```bash
curl http://localhost:3000/api/speech/status
```

A configured server returns `configured: true`, `provider: "azure-speech"` and the region. An unconfigured server returns `configured: false` and a real reason such as `AZURE_SPEECH_KEY is not set on the server.` The status response never contains a key field or value.

The AI provider is still needed for the spoken reply in Speaking Practice. Recognition and reply availability are shown separately in the UI.

---

## Accounts & sync (Milestone 7)

Accounts are real and local-first. Guests work entirely in this browser; signing in is optional, and no progress is uploaded without the learner taking that action.

### Development (zero configuration)

```bash
npm start
```

The first start creates:

- `data/deutschlern-db.json` — atomic JSON store for users, sessions, reset tokens and progress revisions.
- `data/dev-session-secret` — a persistent random cookie-signing secret (development only).

Open **My Profile** → **Create account**. Passwords must be at least 10 characters and include a letter and a number. After registration, local progress is saved to the account automatically.

### Production

Set secrets in the environment before starting. Never put them in frontend code or commit them:

```powershell
$env:NODE_ENV = "production"
$env:SESSION_SECRET = "a-long-random-string-of-your-own"
$env:DATA_DIR = "C:\\deutschlern\\data"
npm start
```

```bash
NODE_ENV=production SESSION_SECRET=a-long-random-string-of-your-own DATA_DIR=/var/lib/deutschlern npm start
```

- `SESSION_SECRET` is required in production. Without it, accounts are disabled and the UI explains why.
- `JWT_SECRET` is optional/reserved. Sessions are opaque server-side records with a signed cookie; JWTs are not used.
- `ALLOW_DEV_RESET_TOKENS=true` exposes a reset token in the API response for local development. Never enable it in production. Without it, password reset requests return a generic message and require an email provider to deliver the token (not included).
- `DATA_DIR` relocates the database and generated dev secret.

### Honest states

- `/api/auth/status` and `/api/sync/status` are public, key-free and status-only. They never return secrets, hashes, tokens or session IDs.
- Protected routes return `401 auth_required` when not signed in.
- If accounts are disabled, registration/login/password routes return `503 auth_unavailable` with the real reason, and no sign-in form is rendered.
- Sync uploads use a revision guard. If another device changed the server copy, the learner sees a conflict dialog with both versions and chooses which one to keep — the app never silently overwrites either.
- Downloading a server copy always requires an explicit click. Local lesson gates and skill scores are never fabricated by sync.

### API contract (added in Milestone 7)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/auth/status` | Browser-safe account state: `configured`, `provider`, `storage`, `authenticated`, `user`, `reason`, `passwordReset`, `sessionMaxAgeSeconds`. |
| `GET /api/auth/me` | Current public user, or `401 auth_required`. |
| `POST /api/auth/register` | Create a real account and session. Body: `name`, `email`, `password`. |
| `POST /api/auth/login` | Sign in with `email` and `password`. |
| `POST /api/auth/logout` | Delete the server-side session and clear the HttpOnly cookie. |
| `POST /api/auth/password/request` | Start a reset; returns a token only with `ALLOW_DEV_RESET_TOKENS=true`. |
| `POST /api/auth/password/reset` | Consume a reset token and set a new password; invalidates existing sessions. |
| `DELETE /api/auth/account` | Delete the account, sessions and server-side progress. |
| `GET /api/sync/status` | Public sync availability and whether the request has a session. |
| `GET /api/sync/state` | Download the signed-in learner's saved state and revision. |
| `PUT /api/sync/state` | Save state with `expectedRevision`; returns `409 revision_conflict` when stale. |
| `DELETE /api/sync/state` | Delete only the server-side progress copy. |

### API contract (existing)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Liveness: version `1.0.0`, milestone `9`, auth/storage summary, uptime and timestamp. Always 200 while the process is up; never includes secrets. |
| `GET /api/health/ready` | Readiness: 200 with `status: ready` only when storage is initialized and accounts are configured; 503 `not_ready` with a real reason otherwise. Point orchestrator probes here. |
| `GET /api/ai/status` | Browser-safe AI configuration: `configured`, `provider`, `model`, `reason`, `modes`, `maxMessageChars`, `maxHistory`. Never includes a key field or value. |
| `POST /api/ai/chat` | Proxies one bounded conversation to the configured provider. Body: `mode` (`tutor` or `roleplay`), `level`, optional `scenario`, `messages`, optional `showTranslation`. Returns `reply`, `correction`, `explanation`, `mode`, `level` and `model`. |
| `GET /api/speech/status` | Browser-safe speech configuration: `configured`, `provider`, `region`, `reason`, `capabilities`, `maxAudioBytes`. Never includes a key field or value. |
| `POST /api/speech/transcribe` | Optional Azure fallback. Body: base64 `audio` (16-bit PCM WAV), `sampleRate`, `language`. Returns `transcript`, `confidence`, `words`, `reason`, `provider` and `model`. Requires configured Azure credentials. |

Details:

- AI: the last 12 messages are sent as context; each message is capped at 1,200 characters. Requests time out after 15 seconds; the browser client times out after 20 seconds and supports Stop.
- AI rate limit: 20 chat requests per client IP per minute. Milestone 9 uses one shared, bounded sliding-window limiter for AI, speech, registration, login, password reset, account deletion and sync writes; every throttled response includes `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `Retry-After` headers. Limits are tunable through the documented `RATE_*` variables and the tracked-key map is hard-capped against spoofed-IP floods.
- AI replies are parsed as JSON with `reply`, `correction` and `explanation`; plain text is accepted as a reply. Missing corrections stay empty — they are never invented. A requested `\nEN:` marker is preserved as a separate translation card.
- AI errors: `400 invalid_request`, `429 rate_limited`, `503 ai_not_configured`, `502 provider_auth_failed` / `provider_busy` / `provider_error` / `provider_unavailable`, and `504 provider_timeout`.
- Speech: recordings are capped at 1.8 MB and 30 seconds; the sample rate must be 8–48 kHz and the language tag must be valid. The provider is called only after the WAV header is validated.
- Speech rate limit: 12 transcriptions per client IP per minute (same shared limiter as the other writable routes).
- Speech errors: `400 invalid_audio`, `429 rate_limited`, `503 speech_not_configured`, `502 speech_auth_failed` / `speech_busy` / `speech_provider_error` / `speech_unavailable`, and `504 speech_timeout`.
- Azure confidence is returned as recognition confidence. It is **not** a pronunciation score.

`dl:state:v1` schema version 7 stores up to 20 AI conversations (60 messages each), 60 speaking attempts, 100 pronunciation entries, 80 graded skill attempts and 24 bounded writing drafts (capped both when saved and when loaded from storage or sync). Only real provider replies, real transcripts and real checklist results are saved. Speaking and pronunciation entries never change `skills.speaking` or lesson gates; skill practice records stay separate from `practiceAttempts` and `practiceMistakes`. **Settings → Clear speaking**, **Clear pronunciation**, **Clear AI chats** and the per-skill Clear buttons remove only their own data. `dl:sync:v1` stores non-sensitive sync metadata (revision, timestamp, account ID and last error) separately, so clearing local app data always removes it too.

---

## Deployment (Milestone 9)

A production deploy is a single Node process with a writable `DATA_DIR` and a strong `SESSION_SECRET`. There is no build step. The committed artifacts are:

- `Dockerfile` — a runtime-only image running as the unprivileged `node` user on Node 20 Alpine, with a liveness healthcheck.
- `.dockerignore` — keeps credentials, local data, tests and tooling out of the image.
- `docker-compose.yml` — one service with a persistent `data` volume, fail-closed `SESSION_SECRET` requirement and readiness-based healthcheck.
- `scripts/backup.mjs` (`npm run backup`) — timestamped, permission-restricted snapshots of `DATA_DIR` with configurable rotation.
- `docs/deployment.md` — full configuration, Node/systemd and Docker instructions, health probing, backup/restore, security posture and limitations.

```bash
cp .env.example .env        # set SESSION_SECRET; optional provider keys stay empty
docker compose up -d --build
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/health/ready
```

In production, omitting `SESSION_SECRET` keeps accounts disabled and makes `/api/health/ready` return `503`. The app is single-instance by design: rate counters are process-local and the JSON store serializes writes, so scaling out requires a shared limiter and database adapter first. See `docs/deployment.md` for the full guide.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Express server on port 3000 (or `PORT`). |
| `npm run dev` | Start with Node's watch mode. |
| `npm test` | Run the full automated curriculum, skill-content, writing-checklist, analytics, exam, lesson, speech, server, rate-limit, state-normalization, AI, account and sync test suite. |
| `npm run test:coverage` | Run the same suite with Node's built-in coverage report (no extra dependency). |
| `npm run test:content` | Validate levels, courses, lessons, grammar, vocabulary and the exercise bank. |
| `npm run test:server` | Exercise HTTP routes, AI/speech/auth/sync status, static assets, SPA fallback and security headers. |
| `npm run verify` | One-command audit: curriculum, frontend wiring, icons, navigation contract, AI/speech/auth/sync status and live HTTP checks. |
| `npm run test:ui` | Optional headless-browser audit: 26 routes × 4 viewports plus theme, navigation, drills, flashcards, lessons, AI views, a real role-play send with stubbed provider, voice views, spoken-partner interaction, practice, exam and account interactions. |
| `npm run test:a11y` | Optional axe-core WCAG A/AA audit across light, dark, desktop and phone layouts, including AI, speech, exam and account dialog states. |
| `npm run validate:lesson <path>` | Validate one lesson body file, or a directory of bodies, against the 17-section contract. |
| `npm run build:deck` | Rebuild the derived 369-card vocabulary deck from curated and lesson words. |
| `npm run build:exercises` | Rebuild the derived exercise bank (1,995 questions, 144 prompts) from lesson bodies and grammar drills. |
| `npm run build:skills` | Rebuild the graded skill-practice file (36 tasks, 72 questions, 24 dictation lines, 12 writing prompts) from the authored source. |
| `npm run backup` | Create a rotated, permission-restricted snapshot of `DATA_DIR` (see `docs/deployment.md`). |

### Verified result for this milestone

- `npm test`: **139 passed, 0 failed** (the M9 suite plus the post-review, final-sweep, public-tunnel and spoken-partner regression tests for sync, state hardening, routing, exams, AI, speech, auth and rate limits).
- `npm run test:coverage`: same 139 tests with Node's built-in report (all-files ~58.92% lines; `rate-limit.js` 100% lines). The all-files figure is lower because browser coordinator modules are exercised by focused tests and the UI audit rather than by the Node suite alone.
- `npm run verify`: **18 checks passed** — 6 levels · 24 modules · 72 lessons · 30 grammar · 48 words · 90 drills · 369 cards · 1,995 exercises · 35 scenarios · 36 skill tasks; 18 live / 0 planned routes; health `v1.0.0 · milestone 9`; AI, speech and auth status honest and key-free; protected routes reject anonymous access.
- `npm run test:ui`: **26 routes × 4 viewport widths** with no console errors, failed requests or horizontal overflow, and all interaction checks passed, including real registration/sign-in dialogs, browser recognition, the spoken-partner transcript, an end-to-end role-play turn (scenario, request payload and saved reply), saved attempts, word comparison, AI status, Clear actions and the graded reading/listening/writing checks plus skill analytics.
- `npm run test:a11y`: **62 runs, 0 WCAG A/AA violations**, including voice recognition, recognised transcript, word-comparison, skill-practice and account-dialog states.
- `npm run validate:lesson content/lessons`: **72/72 lesson bodies present** and schema-valid.
- `npm run build:exercises`: **1,995 questions and 144 prompts** rebuilt deterministically (reading 664 · vocabulary 619 · grammar 545 · listening 167).
- `npm run build:skills`: **36 authored tasks** (12 reading · 12 listening · 12 writing) rebuilt deterministically.
- `npm run backup`: created a timestamped, `0600` snapshot of `DATA_DIR` with a manifest and rotation.
- `npm audit --audit-level=high`: **0 vulnerabilities**.

### Post-M9 deep review (bug-fix pass)

After M9 approval, a four-part audit covered server security, state/sync correctness, frontend views and AI/content data. Verified fixes include:

- **Server:** atomic sync revision compare-and-set; per-IP limits keyed on the socket peer with `TRUST_PROXY` opt-in only; env-driven readiness rejection handler; real per-router body caps; 32-character production secret minimum; atomic password reset; malformed-cookie handling; reset tokens no longer invalidated across users.
- **State/sync:** whole-state progress detection on sign-in; one serialized sync queue with retry and mid-flight change detection; account ownership that prevents another account's local data from being uploaded; bounded, validated state normalization including `quizAttempts`; safe sync revisions; honest 409 metadata; forced session refresh.
- **Views:** malformed URL hashes no longer blank the app; lesson audio and AI chat requests stop on navigation; exam countdowns use monotonic time and pause on exit; honest empty-state, toast, confidence and sentence-count behaviour.
- **AI/content:** scenario text is quoted as untrusted data; malformed provider fields no longer become visible fake text; five dictation answers now match their spoken lines and six authored German/translation errors were corrected.

No new credentials were added. `TRUST_PROXY` is deployment configuration, not a secret. All final automated checks above were re-run after these fixes.

### Final module-and-milestone sweep (bug-fix pass)

A second four-part audit rechecked every route, all nine milestones, live-key security and frontend/server lifecycle. Verified fixes include:

- **Navigation:** Writing Practice no longer throws `ReferenceError: host is not defined` on exit; the router isolates cleanup failures, always clears `aria-busy` and refreshes the current hash rather than a stale route.
- **Rate limits:** validated proxy hops (`TRUST_PROXY`) now key on Express's hop-aware `req.ip`; boolean `true` is still rejected so XFF cannot rotate buckets. A trusted loopback Cloudflare Tunnel additionally keys on `CF-Connecting-IP`, so public visitors do not share one socket bucket. A key flood no longer evicts active counters — new keys are refused until a window expires. Logout is limited, and anonymous account-delete attempts no longer consume the shared budget.
- **Auth/API:** unknown-email login now performs an equivalent scrypt check; API responses send `Cache-Control: no-store` and `Vary: Cookie`; provider error bodies are cancelled; WAV duration is enforced server-side at 30 seconds.
- **Views:** sign-in sync is deduplicated into one conflict choice; late microphone permission grants are cancelled when the view is gone; Reduce Motion is respected for in-page scrolling; storage write failures surface a visible warning; dead/stale settings, course, lesson and sidebar copy was corrected.

All nine milestones remain complete; this was a hardening pass, not Milestone 10. Every automated check above was re-run after these fixes.

### Manual test checklist

1. Open each sidebar module. All 17 modules render live pages; the Roadmap page shows all nine milestones as delivered with no planned screens remaining.
2. Open **German Courses → A1**, start the first lesson and step through all 17 sections. Practice questions give immediate feedback and explanations.
3. Complete the assessment. 70% or more passes and unlocks the next lesson; below 70% offers a retake without revoking earlier completion.
4. Try to open a locked lesson directly by URL — the lock screen explains why.
5. Open **Grammar Academy**, switch to the practice tab, answer drills, and check the mistake review and Clear button on a word-order drill.
6. Open **Vocabulary → Flashcards**, grade cards, and confirm learned-word counts only change for `v-*` cards.
7. Open **Practice Exercises**. Change filters, confirm the count updates, answer wrongly on purpose, then use **Practise these again** in the mistake review.
8. Try a deep link such as `#/exercises?level=a1&skill=grammar`.
9. Open **Mock Examinations**, start a paper, answer a question, use **Save & exit**, reopen and resume. Confirm the answer is still there.
10. Submit a paper and confirm the result shows section/skill scores but **no correct answers or explanations**. Check the unscored writing and speaking prompts.
11. Let a paper run out of time to confirm automatic submission. Changing the system clock while the paper is open must **not** change the countdown.
12. Press `Ctrl/Cmd + K`, search for `Apfel`, `sein`, `AI tutor` or `speaking`, and open a result.
13. Toggle the theme in **Settings**, enable reduced motion or large text, and export your data.
14. Toggle **Demo data** on the dashboard or progress page and confirm the **Demo data** badge appears.
15. Resize to tablet and phone widths: the sidebar becomes a drawer, the bottom navigation appears, and no page scrolls sideways.
16. Open a modal, then press browser Back: the dialog must close and the previous route must be visible.
17. **Without an AI key**, open **AI German Tutor**. The status panel must say AI is unavailable and give the real reason; the composer must be disabled; no message may appear. **Recheck** must refresh the status.
18. **With a server-side AI key**, restart, open `#/tutor`, confirm the status says connected, and send `Ich heiße Anna.`. A real German reply must appear; a correction/explanation card appears only when the provider returns one.
19. Tick **Show English translation**, send another sentence, and confirm the `EN:` portion of the provider reply renders in its own card. Use **Stop** during a reply and **Retry** on an error.
20. Open **Real-Life Conversations**. Select A1, A2, B1, B2, C1 and C2 and confirm 7, 6, 6, 6, 5 and 5 scenarios. Choose a scenario and send one line in German.
21. Start a new conversation, reopen a saved one from the sidebar, then use **Clear all** in the chat and **Clear AI chats** in Settings. Confirm transcripts disappear while lessons and progress remain.
22. Send more than 20 AI messages in a minute and confirm the honest rate-limit message, then wait and retry.
23. Open **Speaking Practice** in a browser that supports Web Speech. Confirm the recognition panel says ready, press **Speak with browser**, allow the microphone, say the model line and confirm the real transcript appears. Edit a word, then press **Hear it**.
24. Without an AI key, confirm **Ask tutor to reply** is disabled and explains why. With a key, press it and confirm a real German reply appears and can be played at normal or slow speed.
25. Press **Save attempt**, then reopen the page and confirm the attempt is still listed. Use **New prompt** and **Clear** in the view, then **Clear speaking** in Settings.
26. Open **Pronunciation Trainer**. Press **Hear model** and **Slow**, then **Speak with browser**. Confirm the recognised transcript is shown and **Compare words** reports only matched/missed target words.
27. Confirm the result explicitly says it is not a phonetic score, accent rating or exam result. No skill bar or lesson gate may change.
28. If you configured Azure, **Record for server** becomes enabled when microphone capture is available. Record a short line and confirm the transcript comes from the configured provider; its confidence is labelled as recognition confidence.
29. In a browser without the Web Speech API, confirm the status says recognition is unavailable, browser speak/record buttons are disabled with an explanatory title, and a transcript can still be typed or pasted for comparison.
30. Deny microphone permission once and confirm the UI gives a permission-denied message rather than a fake transcript.
31. Open **My Profile**. As a guest, confirm the account panel explains that work stays local. Create an account with an email and a password of at least 10 characters including a number.
32. Confirm the top bar shows your account email, the profile says **Signed in**, and the sync panel becomes **Up to date / Progress saved to your account**. Check `GET /api/auth/status`: it is authenticated but contains no secret, hash, token or session id.
33. Save a favourite word or complete a lesson, wait briefly, then reload on a second browser profile/device and sign in. Use **Download server copy** to apply the saved state explicitly.
34. On a device with older local progress, sign in to trigger a conflict: choose a copy in the dialog and confirm the other copy is replaced only after that choice.
35. Sign out from the top-bar menu or profile; confirm the menu says **Sign in**, protected API routes return `401`, and local progress remains.
36. Sign in again, use **Reset password**, request a token, set a new password, and confirm the old password fails while existing sessions are invalidated. In production, the reset response has no token and explains that email delivery is not configured.
37. Use **Delete saved progress only** and confirm the server revision returns to 0 while local data stays. Finally use **Delete account** with the typed `DELETE` confirmation and confirm the account disappears.
38. Set `NODE_ENV=production` without `SESSION_SECRET`, restart, and confirm `/api/auth/status` reports `configured: false` with a real reason, account routes return `503 auth_unavailable`, and the UI shows no sign-in form.
39. Open **Reading Practice**. Choose each CEFR level and confirm two authored passages per level. Open the glossary and translation, play the text with the browser's German voice, answer all three questions and **Check answers**. Confirm the explanation appears and the saved result shows up in Recent results. Retake with **Try again**.
40. Open **Listening Practice**. Press **Play** (and **Slow**) and confirm real browser speech audio. Try **Stop**, reveal the transcript, complete both dictation lines, answer the questions and **Check answers**. Confirm exact-word feedback and the saved result; try a deliberately misspelled dictation line to see it fail.
41. Open **Writing Practice**. Choose a prompt, write an answer and watch the word counter and autosave status. Press **Check checklist** and confirm every row is either met or unmet with a concrete reason and the label "Checklist result · deterministic, not an AI grammar score". Confirm no grammar or exam score is shown, then reveal the authored model answer.
42. Change writing level or prompt and confirm the saved draft is restored; clear the draft and confirm only that text is removed. Retake a task with a revised answer and confirm a second saved check appears.
43. Open **My Progress** and find **Graded skill practice**. Confirm it shows real attempts, tasks used, met/evaluated counts and recent checks derived only from the checks you saved. Turn on demo data and confirm this section still shows your real local figures, not demo ones.
44. Use the per-skill **Clear** buttons in Reading, Listening and Writing and confirm only that skill's history is removed. Sign in and sync, then confirm the bounded skill history and writing drafts are included in the opaque state upload and restored on another device after an explicit download.
45. Request `GET /api/health` and `GET /api/health/ready`; both return JSON with `v1.0.0 · milestone 9` (readiness is 200 when configured). Confirm neither response contains a secret, key, hash or token field.
46. With accounts configured in development, send more than 30 logins, 20 registrations, 10 password requests or 60 sync writes from one IP in a minute and confirm each returns `429` with `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `Retry-After` headers.
47. POST an oversized JSON body to an API route and confirm a JSON `413` rather than an HTML error page; request a dotfile such as `/.env` and a traversal path and confirm no server source or env template is returned.
48. In a production shell without `SESSION_SECRET`, restart and confirm `/api/health/ready` returns `503 not_ready` with a real reason while `/api/health` stays 200.
49. Run `npm run backup`, confirm a timestamped snapshot appears under `backups/` with a manifest, then run it again with a low `BACKUP_RETAIN` to confirm old snapshots are rotated.
50. Run `npm run test:coverage` and confirm the built-in coverage report completes with `rate-limit.js` near full coverage and no extra dependency installed.
51. Open `http://localhost:3000/#/%` and `http://localhost:3000/#/courses/%ZZ`. The app must render a not-found or safe route, not a blank screen.
52. Send 31 login requests from one IP with a different `X-Forwarded-For` header each time. The 31st must still return `429` with `RateLimit-*` headers; forwarded headers cannot rotate the bucket. Leave `TRUST_PROXY` unset in a direct-exposure deployment.
53. POST more than 64 KB of JSON to `/api/auth/login` and more than 3 MB to `/api/ai/chat`. Both must return a JSON `413`, while a normal body is still accepted.
54. Sign in as account A, sign out, then sign in as account B that has no server progress. If this device still holds A's work, a conflict choice must appear; B must not silently receive A's local state.
55. Change a profile field or favourite word while a sync request is in flight, then wait for "Progress saved". The next server copy must include that later change.
56. Start a timed paper, answer one question, use **Save & exit**, wait past the paper duration, then **Resume**. The remaining time must be restored rather than the paper instantly expiring.
57. In **Listening Practice**, open `listen-a2-2` and type the full second spoken sentence in the dictation. It must be accepted exactly as spoken.
58. Open **Writing Practice**, edit a draft, then navigate to several other modules and back. Navigation must never show the error screen, and the draft must still be restored.
59. Enable **Reduce Motion** in Settings, then step through a lesson and start a paper. Scrolling must jump immediately instead of animating.
60. Fill browser localStorage near its quota (or disable it) and finish a lesson. A visible warning must explain that changes could not be saved instead of silently losing them on reload.
61. On **Speaking Practice** or **Pronunciation Trainer**, start **Record for server**, navigate away while the permission prompt is open, then allow it. The microphone must not keep recording on the abandoned page.
62. Send more than 20 AI chats from one IP, then send 1,000 requests from unique source keys/addresses. Earlier throttled clients must stay throttled; new keys must be refused with `429` rather than resetting existing counters.
63. With `TRUST_PROXY=1` behind one validated proxy, confirm two clients behind that proxy get independent AI budgets. With `TRUST_PROXY` unset, confirm rotated `X-Forwarded-For` headers still cannot rotate a bucket.
64. Check `GET /api/health` and `GET /api/ai/status` in the browser network tab. They must include `Cache-Control: no-store` and `Vary: Cookie`, and contain no key field or value.
65. With a Cloudflare quick tunnel active and `TRUST_PROXY=1`, send a limited request directly to `127.0.0.1:3000` and one through the public URL. Their `RateLimit-Remaining` headers must start independently; repeated public requests must decrement the public bucket only.
66. Open **Talk with Partner** in a browser with Web Speech. Confirm the mic status says ready, press **Speak**, allow the microphone and say a short German sentence. The interim words must appear while you speak, then the final transcript must appear as your turn in the thread.
67. With a configured AI key, confirm the partner's short German reply is appended and spoken aloud automatically. Press **Hear reply** and **Slow** on a partner turn and confirm replay works. Tick **Show English translation**, speak again, and confirm the translation appears in its own card while only German is spoken.
68. Untick **Partner speaks replies aloud** and confirm the next reply appears as text without audio. In a browser without speech playback, the toggle must be disabled and explained; the text conversation must still work.
69. Without an AI key, press **Speak** and confirm the real transcript is shown with an explicit "no reply was generated" message. No partner message, correction or score may appear. Type a sentence instead and confirm **Send** stays disabled with the same honest reason.
70. Deny microphone permission on **Talk with Partner** and confirm the real permission message. Reopen the screen, start a new conversation, reopen a saved voice chat, then use **Clear voice chats** and confirm tutor and role-play histories remain untouched.
71. In **Real-Life Conversations**, switch to A1 and confirm an authored scenario stays selected. Send `Hallo, ich heiße Anna.` and confirm a real provider reply is saved in the transcript, the browser network request includes that scenario, **New conversation** clears the thread, and the saved chat can be reopened from the sidebar.

---

## Project structure

```text
Website/
├── package.json              # Express dependency, test, backup and verification scripts (v1.0.0)
├── package-lock.json         # Locked dependency tree
├── .env.example              # Documented environment variables incl. RATE_* (server-side only)
├── Dockerfile                # Runtime-only production image (Node 20 Alpine)
├── .dockerignore             # Keeps secrets, data, tests and tooling out of the image
├── docker-compose.yml        # Single service with persistent data volume and readiness probe
├── content/
│   ├── levels.json           # Six CEFR level definitions
│   ├── grammar.json          # 30 grammar topics
│   ├── vocabulary.json       # 48 vocabulary entries
│   ├── grammar-drills.json   # 90 authored drills across 30 topics
│   ├── vocabulary-deck.json  # 369 derived flashcards
│   ├── exercise-bank.json    # 1,995 derived questions + 144 prompts
│   ├── skill-practice.json   # 36 authored graded tasks (reading/listening/writing)
│   ├── lessons/              # 72 lesson bodies, one validated JSON file each
│   └── a1 … c2/course.json   # Four modules, three lessons and real scenarios per level
├── docs/
│   ├── lesson-content.md     # 17-section content contract and authoring rules
│   └── deployment.md         # Production config, Docker, health, backup/restore and security notes
├── data/                     # Runtime DB + generated dev secret (gitignored in real projects)
│   ├── deutschlern-db.json   # Atomic users/sessions/resets/progress store
│   └── dev-session-secret    # Development-only persistent cookie-signing secret
├── server/
│   ├── index.js              # Security headers, liveness/readiness, AI/speech/auth/sync mounts, static hosting, SPA fallback
│   ├── rate-limit.js         # Shared bounded sliding-window limiter, headers and RATE_* parsing
│   ├── ai.js                 # AI config, validation, prompt construction, response parsing
│   ├── ai-router.js          # /api/ai/status, /api/ai/chat, rate limit, timeout, honest errors
│   ├── speech.js             # Speech config, WAV validation, Azure proxy, honest parsing
│   ├── speech-router.js      # /api/speech/status, /api/speech/transcribe, rate limit
│   ├── auth.js               # Password hashing, signed sessions, config and public status
│   ├── auth-router.js        # /api/auth/status, register, login, logout, reset, delete, /me
│   ├── db.js                 # Atomic file DB with revisioned progress records
│   └── sync-router.js        # /api/sync/status and authenticated state get/put/delete
├── frontend/
│   ├── index.html            # Shell, icon sprite, boot skeleton, font preloads
│   ├── assets/
│   │   ├── fonts/            # Locally bundled Inter + Instrument Serif
│   │   └── favicon.svg
│   ├── css/
│   │   ├── style.css         # Design tokens, base, shell, forms, modals
│   │   ├── components.css    # Screen components, lesson player, practice, exams, AI chat, voice views
│   │   └── responsive.css    # Breakpoints, drawer, mobile navigation, print
│   └── js/
│       ├── app.js            # Bootstrap, view contract, router integration, view cleanup
│       ├── router.js         # Hash routing
│       ├── routes.js         # Navigation source of truth, live status and quick actions
│       ├── navigation.js     # Sidebar, topbar, drawer, palette, account menu
│       ├── content.js        # Curriculum/bank loading, validation and indexes
│       ├── api.js            # Shared JSON fetch wrapper, ApiError codes, auth/sync clients
│       ├── session.js        # Cached public session state
│       ├── sync-client.js    # Local-first sync, revision conflicts and explicit downloads
│       ├── auth-ui.js        # Real sign-in, register, reset, logout, deletion and conflict dialogs
│       ├── ai.js             # Browser client for /api/ai/status and /api/ai/chat
│       ├── ai-chat.js        # Shared transcript, composer, status and history shell
│       ├── tutor.js          # AI German Tutor view
│       ├── talk.js           # Spoken partner view (recognise, reply aloud, replay)
│       ├── conversations.js  # Real-Life Conversations view
│       ├── speech.js         # Capability detection, Web Speech recognition, WAV recording/encoding
│       ├── speech-client.js  # Browser client for /api/speech/status and /api/speech/transcribe
│       ├── speaking.js       # Speaking Practice view
│       ├── pronunciation.js  # Pronunciation Trainer and word comparison
│       ├── skill-content.js  # Pure validator and index for authored skill tasks
│       ├── reading.js        # Graded reading view
│       ├── listening.js      # Graded listening view with browser speech and dictation
│       ├── writing.js        # Graded writing view with local drafts
│       ├── writing-feedback.js # Deterministic checklist evaluator
│       ├── analytics.js      # Pure local-first skill analytics report
│       ├── store.js          # localStorage schema v7, including AI/speech/skill history
│       ├── stats.js          # Derived stats, streaks and demo preview
│       ├── srs.js            # Flashcard scheduling and learned-word helpers
│       ├── theme.js          # Theme and accessibility application
│       ├── ui.js             # Icons, dialogs, toasts, rings, speech synthesis
│       ├── charts.js         # Dependency-free skill bars and week chart
│       ├── lesson-schema.js  # Canonical 17-section validator and count rules
│       ├── gating.js         # Sequential lesson unlock logic
│       ├── lesson.js         # Lesson player, exercises, assessment and lock screen
│       ├── grammar.js        # Grammar Academy and drills
│       ├── vocabulary.js     # Vocabulary Builder and flashcards
│       ├── flashcards.js     # Flashcard session UI
│       ├── practice.js       # Shared exercise renderer and single-question session
│       ├── exercises.js      # Practice Exercises view
│       ├── exam.js           # Pure exam sampling, scoring, readiness and text normalisation
│       ├── exams.js          # Mock Examinations view
│       ├── dashboard.js      # Dashboard view
│       ├── courses.js        # Catalogue, course detail and lesson plan
│       ├── progress.js       # Progress report
│       ├── profile.js        # Local profile plus real account and sync controls
│       ├── settings.js       # Preferences and data controls
│       ├── roadmap.js        # Honest milestone and module pages
│       └── notfound.js       # 404 screen
├── tools/
│   ├── build-vocabulary-deck.mjs  # Rebuild the derived flashcard deck
│   ├── build-exercise-bank.mjs    # Rebuild the derived exercise bank
│   └── build-skill-practice.mjs   # Rebuild the authored graded skill tasks
├── scripts/
│   └── backup.mjs            # Rotated, permission-restricted DATA_DIR snapshots
└── tests/
    ├── ai.test.js            # AI config, prompts, parsing, proxy and error mapping
    ├── speech.test.js        # Speech config, WAV validation, parsing and provider proxy
    ├── content.test.js       # Curriculum + bank invariants
    ├── skill-content.test.js # Skill task contract, checklist and analytics invariants
    ├── exam.test.js          # Exam sampling, scoring and readiness
    ├── lesson-content.test.js # All 72 lesson bodies against the 17-section contract
    ├── server.test.js        # HTTP, AI/speech/auth/sync status and security tests
    ├── auth.test.js          # Hashing, signed sessions, account/reset/sync/revision tests
    ├── ratelimit.test.js     # Sliding window, headers, env parsing and router 429 checks
    ├── store.test.js         # Hostile/corrupt state normalization and bounded-list checks
    ├── validate-lesson.mjs   # Per-file/directory lesson validator CLI
    ├── ui-audit.mjs          # Browser routes, responsive layout and interactions
    ├── a11y-audit.mjs        # axe-core WCAG A/AA audit
    ├── verify.mjs            # One-command verifier
    └── checks/               # Shared verifier and lesson-schema helpers
```

---

## Architecture

### Frontend

- **No framework and no build step.** ES modules are served directly. Fonts are bundled locally, so the app does not call a third-party CDN.
- **Hash routing.** `#/dashboard`, `#/courses/a1`, `#/courses/a1/a1-m1-l1`, `#/tutor`, `#/speaking`, `#/pronunciation`, `#/listening`, `#/reading`, `#/writing`, `#/conversations`, `#/grammar?topic=…`, `#/exercises?level=a1&skill=grammar` and `#/exams?level=a1` all work. Deep links receive the SPA shell.
- **View contract.** Every view returns `{ title, crumbs, html, mount(root), destroy?() }`. `app.js` owns rendering, document title, breadcrumbs, navigation state, focus and error handling. `destroy()` releases microphones, recorders and speech synthesis before navigation.
- **Single navigation source.** `routes.js` defines every module, its icon, path, status (`live` or `planned`) and description. Planned modules are rendered from data rather than duplicated pages.
- **Curriculum index.** `content.js` fetches and validates the JSON, rejects duplicate ids and builds indexes. It also validates scenario data and exposes `getScenarios(levelId)` and `getPromptsForLevel(levelId, skill)`.
- **State.** `store.js` uses schema version 7 under `dl:state:v1`. It persists profile, lesson completion, drill stats, flashcards, practice and exam data, plus `progress.aiConversations`, `progress.speakingAttempts`, `progress.pronunciationLog`, `progress.skillAttempts` and `progress.writingDrafts`. Older data is normalized on load. No displayed figure is hard-coded. Separate `dl:sync:v1` metadata records only revision, timestamp, account ID and last error.
- **AI client.** `ai.js` calls only same-origin endpoints and normalizes errors into `ApiError` codes. `ai-chat.js` gates the composer on `/api/ai/status`, renders the transcript with `role="log"` and saves only messages actually sent to or received from the server.
- **Accounts & sync client.** `api.js` owns all same-origin JSON requests with same-origin credentials; `session.js` caches the public account status without reading cookies; `auth-ui.js` renders real forms; `sync-client.js` debounces uploads, checks revisions, surfaces conflicts and never applies a remote copy without an explicit learner action. `app.js` refreshes the current view when the signed-in identity changes from the top-bar menu.
- **Speech client.** `speech-client.js` calls only same-origin `/api/speech` endpoints. `speech.js` detects browser capabilities, starts Web Speech recognition, records bounded microphone audio and encodes 16-bit PCM WAV for the optional Azure fallback. `speaking.js` gates voice and reply controls on real capability/status checks. `pronunciation.js` compares recognised words against authored targets and labels the result as practice feedback.
- **Lesson engine.** `lesson.js` loads one body lazily from `content/lessons/<lessonId>.json`, validates it with `lesson-schema.js`, then renders the 17 sections in a fixed order. `gating.js` keeps the unlock rule in one place.
- **Practice.** `practice.js` renders authored mcq/gap/order questions and scores them with the authored explanation. `exercises.js` filters and samples the bank, records attempts and maintains a mistake queue that clears an item once it is answered correctly.
- **Exam integrity.** `exam.js` is a pure module: `buildExam` samples 14 authored questions (4 reading, 4 listening, 3 vocabulary, 3 grammar), and `scoreExam` returns counts and percentages only. The result object contains **no** correct answers or explanations. `readinessReport` uses only submitted papers plus real lesson/drill/flashcard evidence; writing and speaking are never scored.
- **Graded skills.** `skill-content.js` validates and indexes 36 authored tasks, separate from the exercise bank. `reading.js` and `listening.js` check authored multiple-choice keys and exact dictation text; `listening.js` plays the authored script through `ui.js` speech synthesis. `writing-feedback.js` is a deterministic rule checker that reports only word count, required phrases/terms and sentence count — never grammar or an exam grade. `analytics.js` derives the My Progress section from saved attempts only and returns zeroes/nulls for unused tasks.
- **Dialogs.** `ui.js` provides focus trapping, Escape/backdrop closing, focus restoration and route-change cleanup. Modals cannot survive navigation and block the next screen.

### Server

- Express 5 serves the frontend, curriculum JSON, `/api/health` (liveness) with version `1.0.0` and milestone `9`, `/api/health/ready` (fail-closed readiness), and the mounted `/api/ai`, `/api/speech`, `/api/auth` and `/api/sync` routers.
- Security headers include a strict CSP (`default-src 'self'`, `script-src 'self'`, `connect-src 'self'`, `media-src 'self' blob:`), frame denial, `nosniff`, a referrer policy and a permissions policy that allows microphone only from this origin.
- `server/ai.js` reads the environment, builds level/scenario-aware prompts, bounds input and parses provider output. `publicStatus()` is the only configuration shape sent to the browser.
- `server/speech.js` reads Azure credentials, validates bounded WAV envelopes, proxies to the configured region and returns only browser-safe transcript fields. `publicSpeechStatus()` never includes a key.
- `server/rate-limit.js` owns one bounded sliding window shared by `ai-router.js`, `speech-router.js`, `auth-router.js` and `sync-router.js`; it emits standard rate-limit headers and caps its key map. Provider keys and raw errors never leave the server.
- `server/ai-router.js` and `server/speech-router.js` own provider timeouts, error mapping and proxying. `server/auth-router.js` also limits password reset and account deletion; `server/sync-router.js` limits state writes.
- `server/db.js` persists accounts, opaque sessions, single-use reset hashes and revisioned progress in one atomically replaced JSON file. A different database adapter can replace it without changing the client contract.
- `server/auth.js` hashes passwords with scrypt and a per-user salt, signs session IDs with a server-only secret, and publishes only browser-safe account fields. `server/auth-router.js` issues an HttpOnly, SameSite=Lax cookie and rate-limits registration/login.
- `server/sync-router.js` validates and bounds state uploads, rejects stale revisions with `409`, and authorizes every read/write/delete through the real session middleware.
- Unknown `/api` routes return JSON 404s; unknown documents and deep links return the SPA shell; missing content files return a real 404.

### Security notes

- Inline styles are allowed only because charts, progress rings and score bars set dynamic CSS values. Inline scripts are not allowed; the pre-paint theme script is an external file.
- `npm audit --audit-level=high` reports **0 vulnerabilities**.
- Milestones 1–6 had no authentication; Milestone 7 adds real accounts and Milestone 8 adds graded skill history, but the app remains local-first. Guest progress, AI transcripts, speech history, skill attempts and writing drafts stay in the current browser until the learner explicitly creates an account and syncs.
- Passwords are stored only as scrypt hashes with per-user salts. The browser never sees password hashes, session IDs, reset tokens or the signing secret. Cookies are HttpOnly + SameSite=Lax; no JWT is used.
- API keys are read only in `server/ai.js` and `server/speech.js`. They are never written to `frontend/`, committed, logged or returned by status endpoints. `SESSION_SECRET` is read only in `server/auth.js`.
- Without credentials the AI and transcription endpoints fail closed with `503 ai_not_configured` and `503 speech_not_configured`. The frontend cannot be tricked into generating a local imitation or transcript.
- Without `SESSION_SECRET` in production, accounts fail closed with `503 auth_unavailable`; no form is shown that could pretend to sign someone in. Dev reset tokens are opt-in and disabled by default.
- Milestone 9 adds bounded per-IP rate limits on all writable routes (using validated proxy hops when `TRUST_PROXY` is configured), per-route JSON body caps (64 kb auth, 1 mb sync, 3 mb AI/speech) with JSON `413` responses, `Cache-Control: no-store` on API responses, dotfile/traversal-resistant static serving, a readiness probe that fails closed, and tested normalization that bounds and sanitizes all persisted state before it is trusted.

---

## Curriculum and progress model

- **6 levels:** A1, A2, B1, B2, C1, C2.
- **24 modules:** four per level.
- **72 lessons:** three per module, each with a real 17-section body and assessment metadata.
- **30 grammar topics** and **90 grammar drills** with a local accuracy and mistake report.
- **48 vocabulary entries** and a **369-card** spaced-repetition deck.
- **1,995 practice questions** and **144 writing/speaking prompts**, all derived from the lesson bodies and grammar drills by `npm run build:exercises`.
- **35 real-life scenarios** (A1 7 · A2 6 · B1 6 · B2 6 · C1 5 · C2 5), used by the live role-play route and as the source of speaking model lines.
- **36 graded skill tasks** (12 reading · 12 listening · 12 writing; two per skill and CEFR level), with 72 comprehension questions, 24 dictation lines and 12 writing prompts. This content is authored separately from the 1,995-question bank.

Lesson gating is active. The first lesson of each CEFR level is open; every subsequent lesson unlocks only when the previous lesson’s assessment reaches 70%. Retakes are unlimited and completed lessons stay open.

Mock exams are sampled per section with a stable seed, run against a countdown, and autosubmit when time expires. An in-progress paper is stored as `examActive` and resumes after reload. Results report scores by section and by skill; they never reveal answers. Writing and speaking prompts remain unscored self-practice.

Speaking attempts and pronunciation entries are separate, bounded history lists. They are not converted into a speaking skill estimate, exam score or lesson gate. Graded skill attempts and writing drafts are bounded separately, stay opaque to the sync server, and feed only the graded-skill analytics section.

Demo data is opt-in and clearly labelled. It never writes invented progress into the real store.

---

## Milestone roadmap

| # | Milestone | Scope | State |
| --- | --- | --- | --- |
| 1 | Foundation & curriculum map | Shell, navigation, curriculum, dashboard, grammar, vocabulary, progress, settings, tests | **Complete** |
| 2 | Lesson engine | Full 17-section lessons, exercises, scored assessments, pass score and lesson gating | **Complete** |
| 3 | Grammar & vocabulary deep dive | Conjugation tables, 90 drills, 369 flashcards, spaced repetition and mistake review | **Complete** |
| 4 | Practice exercises & mock exams | 1,995-question bank, filtered practice, timed A1–C2 papers and an honest readiness report | **Complete** |
| 5 | AI tutor & real-life role-plays | Server-side proxy, text tutoring, 35 scenario role-plays, honest unavailable state | **Complete** |
| 6 | Voice, pronunciation & speaking | Browser recognition, optional server-side Azure fallback, spoken replies and word comparison | **Complete** |
| 7 | Accounts & secure progress sync | Salted scrypt passwords, signed server-side sessions, atomic JSON store, password reset, revision-checked cross-device sync | **Complete** |
| 8 | Reading, listening, writing & analytics | 36 authored graded tasks, browser speech dictation, deterministic writing checklists and local-first analytics | **Complete** |
| 9 | Hardening, testing & deployment | Shared rate limits, readiness probe, the full automated suite with coverage, Docker/Compose, backup tooling and deployment guide | **Complete** |

The **Roadmap** route (`#/roadmap`) renders this plan inside the app. Every navigation module is live and all nine milestones are complete; Milestone 9 was hardening and deployment rather than another practice screen.

---

## Credentials needed

The app starts and all non-AI features work with **no credentials**. Browser recognition also needs no key. To enable live AI replies, configure **one** of the following on the server:

| Milestone | Credential / service | Purpose |
| --- | --- | --- |
| 5 | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, optional `OPENAI_MODEL` | OpenAI-backed tutor, role-plays and spoken speaking replies. Default model: `gpt-4o-mini`. |
| 5 | `AI_PROVIDER=compatible`, `AI_BASE_URL`, `AI_API_KEY`, optional `AI_MODEL` | Any OpenAI-compatible chat-completions endpoint. |
| 6 | Optional `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` | Provider-backed transcription fallback when the browser Speech API is unavailable or insufficient. Not required for browser recognition or speech synthesis. |
| 7 | `SESSION_SECRET` | **Required in production.** Signs session cookies. Development generates a persistent random one under `DATA_DIR`. |
| 7 | `DATA_DIR` (optional) | Relocates `deutschlern-db.json` and the development secret. Default: `./data`. |
| 7 | `JWT_SECRET` (optional/reserved) | Not used by current sessions; reserved for a future token adapter. |
| 7 | `ALLOW_DEV_RESET_TOKENS=true` | Returns password-reset tokens in the API for local development only. Never enable in production. |
| 9 | Hosting/domain for HTTPS (no app credential) | Self-hosting. `RATE_*` variables tune limits but are not secrets; Docker/Compose and backups need no new key. |

**Milestones 8 and 9 add no new credentials.** Reading, listening, writing, analytics, rate limiting, readiness checks, Docker/Compose and backups use authored static content, browser speech synthesis, deterministic checks and process-local counters; no AI or speech key is needed. Accounts sync works with **no external credential** using the built-in atomic JSON store. `.env.example` lists every variable with an empty value. It is documentation only — Node does not load it automatically. Export values in the shell/process manager, never commit them, and never place them in frontend code. Optional provider-backed features remain honestly unavailable until configured; they are not simulated.

---

## Known limitations

- AI replies depend on a configured external provider and its model quality. Without credentials the tutor, role-plays and speaking replies are honestly unavailable.
- Browser speech recognition depends on the browser and device. Chrome and Edge provide the Web Speech API; other browsers may need the optional Azure fallback or manual transcript entry.
- Speech recognition may require network access even when no app key is configured, because some browsers send audio to their own service. This browser behaviour is outside this server's control.
- Azure fallback supplies transcription only. It does not generate pronunciation scores, and its confidence number is labelled as recognition confidence.
- Pronunciation feedback checks whether recognised target words appear in order. It cannot judge sounds, intonation, stress or accent quality.
- Speaking and pronunciation history is browser-local by default. It is included in account sync only after a real sign-in and an explicit sync action.
- AI conversations are browser-local by default; the 20-conversation / 60-message cap and 12-message prompt context are intentional cost and latency guards.
- Correction and explanation cards appear only when the AI provider returns those fields; empty fields are never filled with invented text.
- All progress, practice attempts, mistakes and exam history are browser-local by default; authenticated learners may explicitly push or download the same state.
- The profile is a real account identity only when signed in; otherwise it is a clearly labelled local display name.
- Password-reset email delivery is not configured. Development tokens are opt-in via `ALLOW_DEV_RESET_TOKENS=true`; production resets require an email provider adapter.
- The built-in JSON store suits a single server instance. A multi-instance deployment needs a shared database adapter and a stable `SESSION_SECRET`.
- Speech playback depends on the browser's Speech Synthesis API and available German voices. If no German voice is installed, listening tasks still show the authored transcript and can be completed by reading.
- Listening questions use authored scripts with browser speech synthesis and are self-checked; they are not a certified listening exam.
- Writing Practice checks only the visible authored rules (word range, required phrases/terms and sentence count). It does not correct grammar, spelling or style and does not produce an exam grade or AI feedback.
- Mock papers are inspired by the CEFR and use a 70% practice pass mark. They are **not** official certificates and are not affiliated with Goethe-Institut, telc or TestDaF.
- Exam results deliberately hide correct answers and explanations. Use Practice Exercises when feedback is part of the learning goal.
- Writing and speaking prompts in mock exams are unscored; no AI score is invented for them.
- The exercise bank is derived from existing authored content. Adding new lesson or drill content requires rerunning `npm run build:exercises`.
