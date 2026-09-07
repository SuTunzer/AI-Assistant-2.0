# Steadier

A personal second brain, Google Tasks companion and audio coach, built for Android Chrome and the web. The design and implementation follow your interview in [the detailed plan](SECOND_BRAIN_IMPLEMENTATION_PLAN.md). The reference task app has been left untouched.

## Try it on this computer

Requires Node.js 22.12 or later (Node 24 recommended).

```powershell
cd 'C:\CODE PROJECTS\BLANK'
npm.cmd install
npm.cmd run dev
```

Open **http://127.0.0.1:5173**. The default is a clearly labelled preview, with fictional memories and tasks. It includes a real, downloadable sample narration. Your preview edits stay in this browser. Recordings work locally; live transcription and personalised generation require your private backend and provider connections.

For the installable production preview:

```powershell
npm.cmd run build
npm.cmd run preview
```

Open **http://127.0.0.1:4173**. Service workers are enabled in production builds. The project is ready to publish on GitHub Pages; account setup and actual publishing are still required.

## What is implemented

- **Today:** Google Tasks lists, complete/reopen, dates, task edits, native child-task display and the old app's embedded checklist subtasks. New actions stay as proposals until you explicitly approve them.
- **Mind dump:** microphone recording with pause/resume, local recovery of recorded pieces, typed notes, temporary mode, transcription and structured memory extraction. A review card links to editable memories.
- **Memory:** search, categories, pinning, review, corrections, source certainty, related people/memories/tasks, deletion and import/export. Corrections invalidate affected episodes.
- **Listen:** seven selectable subjects, custom questions, 1–30 minute target lengths, reusable mixes, fresh task context, sourced news, factual checking, background generation, private MP3 files, download, resume, playback speed, Media Session controls and ready notifications.
- **Adviser:** a contextual conversation with action, reflection, strategy and challenge styles. Useful details can be remembered; temporary mode does not create memories or tasks. Feedback informs subsequent advice.
- **Settings:** server-held provider keys, selectable priced models, voice/accent, Google connection, news interests, privacy, retention and an AUD spending allowance.
- **Backend:** Firebase owner authentication, encrypted Google refresh tokens, Secret Manager integration, Firestore, private Cloud Storage, Cloud Tasks, encrypted daily memory backups, maintenance, job checkpoints and budget reservations.

## Connect your real life

Follow **[docs/SETUP.md](docs/SETUP.md)** for local live use and the complete GitHub Pages + Google Cloud deployment. It covers Firebase, Google Tasks OAuth, provider keys, news permissions, notifications and installation on your Galaxy.

Only the static frontend goes on Pages. The private server keeps the API keys and personal data out of the public website. A separate OAuth client lets this app coexist with your original Google Tasks app.

## Checks and practical limits

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd run test:e2e
```

See [docs/TESTING.md](docs/TESTING.md) for the test scope and the real-phone acceptance checklist. Automated browser tests use installed Chrome on Windows; CI installs Chromium.

Live provider calls, your Google account, cloud deployment, lock-screen playback and push delivery on your actual Galaxy require the configured accounts/device. They cannot be certified by the preview. Five minutes is a generation target, not a guarantee. The spending meter uses estimates for audio and uncertain provider outcomes; it is not a cap on external invoices. No paid accounts have been provisioned by this project.

## Project map

| Location | Purpose |
| --- | --- |
| `apps/web` | React application and installable PWA |
| `apps/api` | Private API, integrations and background worker |
| `packages/domain` | Shared data contracts, pricing and old-task compatibility |
| `infra` | Cloud deployment and access rules |
| `tests` | Domain, API, audio and browser tests |
| `docs` | Setup, architecture and verification |

Fonts are bundled locally under their Fontsource/OFL licenses. The sample narration was generated using the installed Windows voice; it is an example, not advice from an AI provider.
