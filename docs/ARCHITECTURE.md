# Implementation notes

## Boundaries

The React frontend is a static, installable PWA. It has no provider credentials. `VITE_APP_MODE` selects an isolated fictional browser preview, a loopback development API, or the authenticated cloud API. Local authentication is deliberately rejected by the production build. Hash-based navigation supports GitHub Pages repository paths without rewrite rules.

The Express API and worker use the same container with separate Cloud Run services. API routes require a Firebase token whose UID matches the configured owner. Internal job routes verify an OIDC token from the configured job service account. The worker also has Cloud Run IAM protection. This is a single-owner application, not a multi-tenant service.

```mermaid
flowchart LR
  Phone[Android PWA / desktop web] --> Pages[GitHub Pages shell]
  Phone --> Auth[Firebase Authentication]
  Phone --> API[Private owner API]
  API --> Tasks[Google Tasks]
  API --> DB[Firestore memory and jobs]
  API --> Queue[Cloud Tasks]
  Queue --> Worker[Private worker]
  Worker --> Models[Claude / Gemini / OpenAI]
  Worker --> News[Brave news search]
  Worker --> Audio[Private Cloud Storage MP3]
  Worker --> Push[Web Push notification]
  Audio --> Phone
```

## Data model

The shared TypeScript types are in `packages/domain/src/types.ts`; input schemas are in `schemas.ts`. Cloud documents live under `owners/{OWNER_UID}/{collection}/{id}`. The local adapter uses one atomic JSON file and serialises writes within a process.

| Collection | Content and lifecycle |
| --- | --- |
| `memories` | Goals, people, relationships, issues, decisions, preferences and events. Text, certainty, status, tags, links, source ID, review state and optimistic version. Kept until deleted. |
| `vectors` | Optional 768-dimensional Gemini embeddings. Deleted with their memory. |
| `snapshots` | Selected Google Tasks and list metadata from the last successful sync. Old app coaching logs are excluded from the normalised context. |
| `proposals` | Suggested/new actions. Pending → creating → accepted, dismissed or uncertain. |
| `captures` | Temporary typed input or recording pointer, processing state, learned IDs and response. Raw audio removed after processing; default transcript removal is immediate. |
| `episodes` | Mix, script, provenance, task sync time, memory revision, status, audio pointer/checksum and expiry. |
| `jobs`, `job_inputs`, `job_steps` | Durable work, leases, dispatch intent, temporary inputs and completed speech chunks. No recording data in the Cloud Tasks request itself. |
| `budget` | One ledger per owner month, containing spend, reservations and settled request IDs. |
| `connections`, `oauth` | Encrypted Google refresh token and short-lived one-use OAuth state/PKCE verifier. |
| `devices` | Push subscription endpoints and keys. Notification contents remain generic. |
| `backups`, `deletions` | Encrypted snapshot metadata and deletion tombstones. |
| `templates`, `settings`, `feedback`, `meta` | Reusable audio mixes, preferences, recent coaching feedback and revision/retention counters. |

This implementation targets a personal workspace. The Firestore adapter lists collections with pagination; snapshots and budget ledgers still use single documents. Very large task lists or years of dense use need partitioned snapshots and an archival strategy before approaching Firestore document limits. Briefing context is deliberately bounded (up to 18 memories and 60 open tasks); the model is told its task coverage. There is no claim that every memory or task appears in every briefing.

## Remembering and correcting

1. The browser records compressed audio in two-second pieces in IndexedDB. A navigation interruption stops the recorder and leaves recoverable pieces. The original is removed from the browser after the server accepts it; failed uploads remain locally available.
2. The worker transcribes with Gemini. Extraction separates personal claims from assistant hypotheses and requires verbatim supporting evidence in the current input. Unsupported candidate memories are dropped. Exact repeats are deduplicated against retrieved memories.
3. New understanding is stored as memories. It does not automatically rewrite older user-corrected facts. Ambiguous changes can coexist until reviewed; certainty and time remain visible. The “What I learned” card lets you inspect and edit them.
4. A direct edit must carry the current version. A conflicting edit is rejected. Correcting or deleting supporting memories invalidates existing audio; deletion also removes derived transcripts and files. Offline devices receive that change on their next successful reconnect.
5. Temporary chat does not extract memories or create task proposals. Its conversation history lives in React state and disappears on leaving the screen. Temporary audio has short-lived processing storage and a reply, which expires; no memory extraction occurs.

These controls reduce fabricated personal claims; they do not prove semantic accuracy. The LLM can misunderstand speech, confuse an inference with a fact or overstate advice. Editable memories, visible certainty, source links, bounded context and factual checking are intentional product controls.

## Google Tasks compatibility

Native Google child tasks retain their `parent` field and are rendered separately from the original app's embedded checklist. The original delimiter is preserved exactly, including the em dash. Checklist changes round-trip user note prefixes, unknown JSON fields, checklist IDs and old history fields without truncating them. Malformed metadata and oversized notes cause an explicit refusal.

Sync follows all pagination tokens and includes completed/hidden tasks. Steadier reads a fresh task before editing, compares the displayed ETag, and sends only changed fields with `If-Match`. It then refreshes the local task snapshot. Your old app can still overwrite a concurrent edit if its own write protocol lacks equivalent checks; this cannot be fixed from the new repository.

All creations go through a proposal and an explicit approval action. The proposal is claimed atomically before the Google insert. If the response is lost, its outcome is marked uncertain and is not automatically inserted again. Check Google Tasks before creating a replacement. Old task coaching history is preserved inside Google notes but not imported as second-brain memory.

## Audio jobs

Generation reserves budget, persists the episode and dispatch intent, then submits a Cloud Task. The maintenance sweep repairs queued dispatches. A job lease prevents duplicate simultaneous work; expired work has bounded recovery attempts. The raw job request contains only its identifier.

Before writing, a personal briefing refreshes Google Tasks. Missing task access stops the job rather than pretending to have current actions. News-only briefings can run without private task context. News failures are represented as unavailable; there is no invented fallback headline.

The selected adviser writes structured sections for the requested subjects. Reference IDs must belong to the provided packet; a separate Gemini check rejects unsupported personal/news details. The verified script is checkpointed. A resumed job can reuse it if its memory revision is still valid. Speech is generated in bounded chunks with up to three concurrent requests, with content hashes protecting against reuse of mismatched chunks.

FFmpeg converts the pieces to one mono MP3, measures the encoded duration and finalises the file before publication. A SHA-256 checksum validates downloads. Context and cancellation are checked again before exposing audio. There are no fabricated chapter timestamps: chapters are currently empty because precise section boundary alignment has not been implemented.

The player uses a persistent HTML audio element, local downloaded Blobs, stored playback position and Media Session handlers. Downloads are separate from the service-worker asset cache. Playback is initiated by the user, including after a ready notification. The app cannot force Android to keep a terminated browser process alive.

## Security and deployment

- Exact frontend origin checks, authenticated mutations, schema validation, request-size limits and a per-minute API rate limit.
- Owner-only Firebase authentication; no direct browser Firestore access. Browser tokens are not provider keys.
- AES-256-GCM for Google refresh tokens and application backups. Cloud provider keys are in pre-created Secret Manager containers; local keys are encrypted in the server store.
- Private buckets, bounded signed URLs, disabled bucket soft deletion and raw-input cleanup. No API body logging in the application.
- HTTPS-only citation links and fixed provider API hosts. The news adapter does not fetch arbitrary article URLs or send memories to search.
- Generic notification content. On sign-out, downloaded audio and draft files are cleared from the browser.
- The service worker caches only versioned application assets and the non-personal sample narration. API responses never enter Cache Storage. Each build changes the worker version, and activation waits for old tabs to close.

Cloud encryption at rest is not end-to-end encryption: the worker and selected AI providers must see the context they process. Provider account retention and training policies remain external to this application.

## Budget accounting

Known model prices are versioned in the shared domain module. Settings reject unpriced advice and speech model IDs. Reservations and settlements are atomic and idempotent. The ledger uses the user's timezone; a job settles against its original reservation month even if it crosses midnight/month end.

Audio/capture jobs currently settle conservatively at their reserved estimate; text chat uses reported token counts. Interrupted provider calls can have unknown charges. Parallel jobs, provider minimums, changed prices, unexpectedly long generated speech, embedding calls and external subscriptions mean this meter cannot enforce a hard cap on invoices. Use provider billing limits and review actual invoices during the first month. The budget UI explains this limitation.

Current provider adapters use the [Anthropic Messages API](https://platform.claude.com/docs/en/api/messages), [Gemini content and speech generation](https://ai.google.dev/gemini-api/docs/speech-generation), [Google Cloud TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts), and OpenAI chat/speech endpoints. Model names and prices are checked-in policy; update them with their official documentation before adding new choices.
