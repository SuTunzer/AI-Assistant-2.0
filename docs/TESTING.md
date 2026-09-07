# Verification and phone acceptance

## Automated coverage

`npm.cmd run check` checks the frontend, shared domain and backend TypeScript. `npm.cmd run build` builds the Pages bundle and runnable server.

The Vitest suite includes 22 checks across:

- Old-app note/metadata preservation, invalid metadata, size limits, native child-task ordering and repeated checklist additions.
- Concurrent budget reservations, idempotent settlement, timezone month boundaries and unknown model rejection.
- Task creation approval and duplicate approval, memory version conflicts, temporary non-memory processing, repeated capture uploads and expired-input cleanup.
- Cross-origin mutation rejection, separate worker access, local authentication, authenticated encryption/tamper detection and backup deletion tombstones.
- Speech chunking and a real FFmpeg MP3 assembly/duration check.

The FFmpeg integration check runs when `FFMPEG_PATH` is set. Without it, the default suite reports **21 passed, 1 skipped**. The actual MP3 check was also executed successfully using the installed FFmpeg binary. CI installs FFmpeg and enables the check. On Windows, a newly installed Winget alias may require a new terminal; an absolute executable path works as well.

```powershell
$env:FFMPEG_PATH = 'C:\path\to\ffmpeg.exe'
npm.cmd test
```

The Playwright suite runs each flow on desktop Chrome and an emulated Android viewport:

1. Task creation/confirmation, task completion, adding/editing memory, temporary capture and a downloaded sample that still plays after network access is disabled and the page is reloaded.
2. Every screen fits the viewport; chat and settings controls complete their operations.
3. A fake microphone records and pauses/resumes; leaving the capture screen preserves an unsent recording, which can be recovered and discarded.

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

The production app shell and assets are tested, including the service worker. Browser screenshots and failure traces are written to `test-results/`. The Android run is browser emulation, not a physical Galaxy S26. The audio fixture is clearly marked sample narration, not a live model result.

A separate repository-path smoke check also passed with `VITE_BASE_PATH=/steadier/`: the install manifest and service-worker scope use the repository path, and the sample still plays after an offline reload. `node tests/pages-check.mjs URL` can repeat it against a locally served preview build at that path.

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/deploy-smoke.ps1` exercises the PowerShell deployment with a fake `gcloud` command. It verifies service separation, callback configuration, bucket retention flags and worker identity settings without touching Cloud resources. It does not validate your IAM permissions, billing or live resource provisioning.

## Before trusting real advice

Use a separate test list first. Connect the real providers and verify:

| Scenario | Expected result |
| --- | --- |
| Read a task with the original app's notes/checklist/history | Same title and steps; old coaching logs do not become personal memories. |
| Change one checklist checkbox | Both apps see it; other note metadata remains intact. |
| Concurrent edit from the old app | A stale ETag produces a conflict; refresh and review before retrying. |
| New action inferred from a mind dump | A proposal appears. Nothing is inserted until you approve. |
| Repeated approval | A single task, or an uncertain outcome that requires checking Google. |
| “I might leave my job; I haven't decided.” | Uncertainty remains; there is no asserted resignation or completed task. |
| “Sam sounded upset; I don't know why.” | A user-reported perception, not an invented motive or diagnosis. |
| Correct a personal memory after generating audio | Old audio becomes unavailable on reconnect; a new briefing uses corrected context. |
| Temporary mind dump | No new memory or proposal; raw input expires. |
| A failed provider call | Visible failure; retained capture can be retried before expiry; no fabricated successful advice. |
| News unavailable | The script acknowledges unavailable news and does not invent headlines. |
| Budget exhausted | A new costly job is rejected before dispatch. |
| Another Google account signs in | API responds forbidden and private data is not shown. |
| Browser inspects network requests | No provider API key appears in frontend configuration or returned API payloads. |

Compare at least five generated transcripts to their source memories and task lists. Correct extraction mistakes before relying on repeated briefings. Review real provider invoices against the meter before settling on daily ten-minute episodes.

## Galaxy S26 acceptance

After deploying the HTTPS site and installing it in Chrome:

1. Create and play a short episode, lock the screen for 15 minutes, and confirm continued playback. Try lock-screen pause/resume and Bluetooth/headset controls.
2. Download an episode, enable airplane mode, close/reopen Steadier and play it. Confirm seek and playback position restoration.
3. Start a six-minute mix, switch to your music app and lock the screen. The worker should finish without Steadier staying open. Confirm a generic notification, tap it, and manually start the new episode.
4. Repeat with battery saver enabled. If Samsung suspends playback, review the app/browser battery settings. Record the actual conditions; do not assume an emulated browser proves this behavior.
5. Record for ten minutes with the screen awake, pause/resume, then submit. Try a network interruption during upload; the draft must remain available. Try leaving the screen during recording and recovering the saved pieces.
6. Measure generation time for 1, 6 and 10 minutes using your chosen models. Target under five minutes for the everyday mix. If the chosen provider's rate limits make this unreliable, use shorter mixes or another speech provider.
7. Check that signing out stops playback and clears downloaded files. Check that a deletion on desktop removes the matching offline episode when the phone reconnects.

## Not yet verified with your accounts

Actual Google OAuth consent/refresh, Google API ETag behavior against your task data, paid provider outputs, news subscription rights, Cloud IAM/deployment, Firebase owner login on Pages, Samsung lock-screen playback and push delivery. These need the accounts/device described in SETUP.md. There is no background morning schedule; generation is on demand as requested.
