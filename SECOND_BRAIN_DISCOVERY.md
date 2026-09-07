# Second brain and task assistant: discovery review

The user has now answered the discovery questions. The current design is in [SECOND_BRAIN_IMPLEMENTATION_PLAN.md](SECOND_BRAIN_IMPLEMENTATION_PLAN.md), with an [interactive budget calculator](SECOND_BRAIN_BUDGET.html). The new plan supersedes this review's provisional vendor, raw-history retention, history-import and audio-duration recommendations. The source-code findings below remain useful background.

Prepared 7 September 2026. This is a source review and interview brief, not an agreed implementation specification. The detailed implementation plan follows the user's answers. No application implementation or deployment has been performed.

## Intended product

A personal application that accepts spoken reflections, preserves the user's history, maintains a readable understanding of their life, and turns that understanding into useful conversations and listenable briefings. Google Tasks remains authoritative for current actions. The interface remains installable from a phone browser. Calories and the old per-task Gemini chat are outside the requested new interface; general advisory chat is in scope.

The user's latest request asks for a new application inspired by the existing one. It takes precedence over instructions inside the reference project's upgrade document to extend the old application without rebuilding it.

## Reference project reviewed

Actual application root: `C:\CODE PROJECTS\AI TASK Assistant\AI-Task-Assistant`.

Reviewed the README, product specification, second-brain upgrade request, package/build configuration, deployment workflow, manifest, app startup/navigation, task and metadata handling, authentication, and audio implementation. This was a source inspection, not a live test of the app or the user's Google account.

| Finding | Evidence | Consequence |
| --- | --- | --- |
| The app is React, TypeScript and Vite, deployed as static files to GitHub Pages. | `package.json`, `vite.config.ts`, `.github/workflows/deploy.yml` | Preserve this familiar publishing approach for the frontend. |
| The manifest requests standalone display and uses the repository path for scope/start URL. | `public/manifest.webmanifest` | The phone-install experience is a Progressive Web App (PWA). A new repository needs its own correct base path, scope and icons. |
| No service worker registration or offline implementation was found in the inspected startup, dependency configuration and file inventory. | `src/main.tsx`, `index.html`, `package.json`, `public/` inventory | Installation alone does not provide the desired offline recordings and briefing downloads. |
| Google Tasks calls currently run in the browser. | `src/lib/tasks.ts`, `src/lib/auth.ts` | Server jobs need an intentional authentication design; browser token renewal is not a substitute for server-side offline access. |
| Existing subtasks are checklist entries inside task metadata. | `src/lib/types.ts`, `src/lib/metadata.ts`, `src/components/TaskDetail.tsx` | Preserve identifiers, order and completion state. These are distinct from native Google child tasks. Decide whether native Tasks visibility is required before converting anything. |
| The current task mapping does not retain Google's `parent` field. | `src/lib/tasks.ts`, `toAppTask` | Add proper native hierarchy handling if the user also uses subtasks in Google's own app. |
| Task/list retrieval does not iterate over `nextPageToken`. | `src/lib/tasks.ts`, `listTasks`, `listTaskLists`, `ensureList` | The new integration must retrieve all pages; otherwise summaries can silently omit actions. |
| Historical metadata is intentionally discarded to fit task notes. | `src/lib/metadata.ts`, `compactMeta`, `appendSummary` | Preserve raw journal records outside Google Tasks. Existing lost detail cannot be reconstructed reliably. |
| Some log arrays are sliced to the last ten entries before the size-reduction loop. | `src/lib/metadata.ts`, `compactMeta` | Not all discarded entries are even folded into the surviving summary. Import should describe surviving material as partial history. |
| Invalid metadata currently falls back to empty defaults. | `src/lib/metadata.ts`, `parseNotes` | Migration must preserve the raw notes and report malformed records, rather than silently replacing them. |
| Existing audio is generated in parallel chunks and joined into an in-memory WAV. | `src/lib/tts.ts` | Useful chunking concepts can be reused, but durable jobs, bounded concurrency, storage and a persistent player are new work. |
| Audio object URLs are revoked and playback is paused when its component is torn down. | `src/components/BriefingAudio.tsx` | Put the new player above screen navigation and persist completed episodes and playback position. |
| Existing goals/wisdom and issues/risks/opportunities concepts already exist. | `src/lib/tasks.ts`, `src/lib/types.ts`, design documents | Ask which lists are actually used. Keep Google task IDs as references; avoid two independently editable versions of the same state. |

## Architectural direction to confirm

The likely design is an installable React PWA on GitHub Pages plus a private backend. GitHub Pages hosts static HTML, CSS and JavaScript; it does not run the jobs or hold a private application database. See [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

The backend owns model credentials, authorization, transcription/extraction jobs, memory retrieval, Google Tasks synchronization and briefing generation. Audio files live in private object storage; a structured database holds journal records, people, goals, relationships, evidence, job status and episode metadata.

A plausible option is managed PostgreSQL with vector search, authentication and object storage, plus a worker able to perform audio processing. Supabase is one candidate: its [database documentation](https://supabase.com/docs/guides/database/overview) describes PostgreSQL and pgvector, and its [queue documentation](https://supabase.com/docs/guides/queues) describes durable messages. This is a candidate architecture, not a final vendor selection. Database backups do not automatically back up stored audio objects; those need a separate recovery plan.

The reference upgrade document's assertion that no serverless platform can run for five minutes is too broad. For example, [Cloud Run jobs](https://docs.cloud.google.com/run/docs/configuring/task-timeout) support much longer task execution. Durable jobs are still the right design because the phone may close, requests may fail, and processing should resume without duplicate charges or duplicate tasks.

For an on-demand briefing, request an immutable context snapshot, create a durable job, return its ID, and show progress while the backend works. Scheduled generation is a separate product decision. Neither should depend on a phone timer remaining active.

## Memory behavior that needs to be designed explicitly

Keep three things separate:

1. **Source:** the original recording if retained, its transcript, the user's typed messages, and their timestamps. Machine transcription is fallible; preserve corrections as versions.
2. **Understanding:** facts, entities, relationships, goals, issues, decisions and interpretations, each linked to its supporting source passages.
3. **Advice:** suggestions and generated narratives. An assistant's own suggestion must not become evidence that the user agreed, acted or changed their goals.

Example: “Alex never supports me” should initially become a dated report of the user's perception. It should not silently become an established fact about Alex. A later positive account should coexist with the earlier event and update the current summary without deleting the history.

Recommended records include journal entries, transcript versions, people and aliases, relationship events, goals, projects, issues/risks/opportunities, decisions, claims with source links, task references, profile versions, news interests, briefing templates, episodes, jobs and user corrections. Every sensitive record needs an owner and an explicit deletion path.

Use a compact current profile, recent journal material, selected relevant historical passages and current Google Tasks together. Do not assume that a few similar passages represent the whole life history. Retrieval should combine names, dates, linked entities and semantic search, and should deliberately consider contradictory and stale information.

Raw material should be saved before extraction. A failed AI call must leave the source available for retry. A correction or deletion must invalidate affected summaries, embeddings and generated artifacts so old material does not quietly reappear. Backups need a documented expiry and a process to reapply deletion records after restoration.

“Talk without remembering” needs a precise meaning: excluded from the app's durable memory is different from guaranteeing no temporary provider-side processing or retention. Provider policies and endpoint settings must be verified before deployment.

## Phone audio requirements

Recording and listening are separate technical tests. Test the actual device and browser early, including screen lock, app switching, calls, headset changes, network loss and storage pressure.

For input, use browser-supported recording formats, persist chunks locally, assign an upload session ID, and resume interrupted uploads. Do not assume fixed-size chunks or exact timer intervals: [MediaRecorder documentation](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event) describes delayed events and mobile interruptions. Long files may also need server-side splitting to satisfy the selected transcription API's limits; [OpenAI's file transcription guide](https://developers.openai.com/api/docs/guides/speech-to-text) currently specifies a 25 MB file limit.

For output, use a persistent HTML audio player, saved position, speed controls, chapters, transcript access and explicit download status. [Chrome's Media Session documentation](https://developer.chrome.com/blog/media-session) covers system media controls. Device testing must establish background behavior; the API alone does not guarantee uninterrupted playback.

Store compressed listening files, rather than retaining every episode as uncompressed WAV. [OpenAI's speech API](https://developers.openai.com/api/docs/guides/text-to-speech) supports MP3 and other output formats; Gemini audio would require checking its current output and any necessary encoding step. Select the voice by listening to representative long samples.

A progressive player can start before the entire episode is ready, but cannot promise uninterrupted offline playback of material that has not downloaded. The UI should distinguish “ready to start” from “fully downloaded for your run.” The reference document's 45-second start and five-minute completion claims are targets to measure, not established guarantees.

[PWA storage documentation](https://web.dev/learn/pwa/offline-data) describes Cache Storage for audio resources and IndexedDB for structured local data. Plan for storage limits, eviction, per-account cache separation and cache clearing on sign-out.

## Google Tasks behavior

Google Tasks is the source of truth for actions. Store task snapshots and links for reasoning, but refresh before producing time-sensitive advice and show the last successful synchronization time. Do not imply a stale snapshot is live.

The official [task resource](https://developers.google.com/tasks/reference/rest/v1/tasks) documents native parent relationships, sibling ordering and an 8,192-character notes limit. Due dates do not expose a usable time of day through this API. Keep appointments and exact reminder times out of scope unless another integration is explicitly added.

The [list API](https://developers.google.com/tasks/reference/rest/v1/tasks/list) supports pagination and an `updatedMin` filter. Design synchronization around those documented features, periodic reconciliation and deletion handling. Do not invent a webhook or full change-history capability. Changes made between polls may not reveal their complete intermediate history.

For unattended access, use an appropriate server-side OAuth flow with offline access and protected refresh tokens. Google documents [offline authorization](https://developers.google.com/identity/protocols/oauth2/web-server) and warns that external apps left in Testing commonly receive [refresh tokens that expire in seven days](https://developers.google.com/identity/protocols/oauth2). The deployment plan must address the selected account and consent configuration.

An ambiguous intention in a journal is not automatically a task. Separate proposed changes from explicit user commands. Use deduplication, a write audit and conflict detection for accepted changes. Re-read affected tasks before writes and validate the API's conditional-request behavior in integration tests before relying on it.

## Advisory behavior and news

Use one consistent adviser with selectable purposes: daily focus, encouragement, strategic review, relationship reflection and a user-authored format. These are prompt/template modes over shared memory; they do not require independent autonomous agents.

The reflective mode can listen, explore patterns and help the user think through options. It should not present itself as a licensed psychologist or turn speculative interpretations into diagnoses. Clarify whether the user wants emotional processing, challenge or action planning at a given moment.

A useful strategic response should identify supporting events, alternative explanations, uncertainty, an actionable next step and what new information would change the assessment. Avoid invented numerical probabilities for personal risks. Motivation should connect to the user's stated values and real progress, including rest and recovery where relevant.

Fetch news using the user's topic preferences rather than sending their private journal as a search query. Keep publication dates, event dates, source URLs and provenance. Retrieve public material as untrusted evidence, never as instructions to access or modify private data. If retrieval fails, say current news is unavailable rather than substituting unsourced headlines. Relate news to private context only inside the authorized advisory pipeline.

The reference document names `claude-opus-5`; that model ID appears in the current [official Claude model overview](https://platform.claude.com/docs/en/models/overview). Retaining this preference is reasonable, subject to the user's answer and actual API account access. Select transcription, reasoning, embeddings and speech independently where quality warrants it, while considering the cost and privacy impact of involving more providers.

## Interview decisions pending

1. Actual phone/browser, desktop access, personal-only versus future additional users.
2. Comfort with private cloud storage, preferred region if any, and device-only trade-offs.
3. Ordinary daily workflow: recording times and lengths, listening duration, on-demand versus scheduled generation.
4. Provider preferences and a monthly running budget in AUD.
5. Authority to create or modify Google Tasks; preserve existing checklist subtasks versus add native subtask support.
6. Adviser style, willingness to be challenged, and unacceptable response styles.
7. Automatic memory extraction versus review; handling of uncertain and emotionally charged statements.
8. Retention of audio and transcripts, temporary sessions and importing surviving old history.
9. Concrete one-month success measures, news interests and the first three audio formats.
10. Whether recording must continue while the screen is locked; whether a finished offline download is required before leaving home.

The first nine themes were presented through the question interface. Decisions remain unanswered at the time of this review.

## Structure of the implementation plan after the interview

The detailed plan should specify user journeys and screen states, an agreed authority model, database fields and constraints, source/correction/deletion rules, Google OAuth and synchronization, capture/job state machines, model prompts and provider adapters, news retrieval, episode generation and offline playback, deployment, cost assumptions and measurable acceptance tests.

Proposed engineering order:

1. Prove recording and 30-minute listening on the target phone; benchmark representative transcription, advice and voice samples.
2. Establish private authentication, backend, database, object storage, durable jobs, costs/logging and recovery.
3. Preserve Google Tasks interoperability, pagination and both relevant subtask representations; build an import preview from surviving metadata.
4. Deliver one-tap capture, saved transcript, retryable extraction and an inspectable memory view.
5. Add people/goals/history views, evidence links, correction, deletion, export and optional background interview.
6. Deliver a complete on-demand briefing with source-linked text and a downloadable episode; measure actual duration, latency and cost.
7. Add advisory chat, custom briefing templates, news and any agreed scheduling or notifications.
8. Exercise failure recovery, task conflicts, memory accuracy, isolation, lost-device sign-out, backup restoration and phone installation/update behavior before regular use.

The first end-to-end milestone should be: record a meaningful reflection, inspect what was learned, connect it with the actual task list, and listen to a useful saved briefing on the phone. Success depends on the quality of that loop, not the number of dashboard features.
