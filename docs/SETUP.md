# Set up your private Steadier

The static website is deployable immediately in preview mode. Personalised advice needs a private server, your Google account and paid API credentials. Do not put provider keys, refresh tokens or the server encryption key into `VITE_*` variables, GitHub Pages, a public repository or a chat message.

## 1. A live workspace on your computer

1. Install Node 24. Run `npm.cmd install` in the project.
2. Run `node scripts/setup-local.mjs`. This creates `.env` with random local access/encryption keys and matching frontend/backend modes. It refuses to overwrite an existing `.env`.
3. Install FFmpeg if necessary: `winget install --id Gyan.FFmpeg --exact`. Reopen the terminal after installation. `ffmpeg -version` must work; alternatively set `FFMPEG_PATH` to its full executable path in `.env`.
4. In your Google Cloud project, enable the **Google Tasks API** and configure the OAuth consent screen. Create a **new Web application OAuth client** for Steadier, separate from the old task app. Add `http://127.0.0.1:8787/api/google/callback` as an authorised redirect URI. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
5. Run `npm.cmd run dev`; open `http://127.0.0.1:5173`. In Settings, connect Google Tasks, select the lists you use, and save preferences.
6. Add Anthropic and Gemini API keys in Settings. They are encrypted in the local server store. If you instead set a provider key in `.env`, it is managed there; the UI will ask you to update the environment rather than pretend to replace it.
7. Try a short typed mind dump, review its extracted memories, then create a one-minute priorities briefing. Check its transcript and audio before trying a longer run mix.

Local mode is bound to loopback. It cannot provide a phone-accessible private service, and the build refuses to publish local authentication. Never expose port 8787 through a public tunnel with local mode enabled. Use cloud mode for your phone.

The backend's local `.data/store.json` is a single-process development store. Do not run two local backend processes against it. Your personal data is not committed to Git. Keep the computer account and drive protected.

## 2. Accounts for phone access

You need a GitHub repository and a Google Cloud/Firebase project with billing enabled. Use a project dedicated to this app so IAM grants and cost monitoring stay easy to understand. APIs have their own billing, usually in USD; the AUD meter is an estimate.

1. Create the Cloud project and attach billing. Install Google Cloud CLI; run `gcloud auth login` with an account allowed to configure the project.
2. Add Firebase to this same project. In **Authentication → Sign-in method**, enable Google.
3. Register a Firebase **Web app**. Copy its public `apiKey`, `authDomain`, `projectId` and `appId` for the frontend variables below. These identify the app; they are not provider secret keys.
4. In **Authentication → Users**, create or sign in once as yourself and copy your **UID**. The server admits only that UID. Signing in as another Google user does not give access.
5. In **Authentication → Settings → Authorised domains**, add `YOUR-USERNAME.github.io` and any custom website domain. Use the default Firebase auth domain for popup sign-in. Allow popups for the app.
6. Create a separate **Google Tasks Web OAuth client**, enable the Tasks API and add yourself as a consent-screen test user while testing. The Firebase sign-in client and the Tasks integration client have separate roles.

Google's testing consent state can limit refresh-token lifetime. For reliable personal use, review the current publication/verification requirements in [Google's OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server). A reconnect prompt is handled in the app. Do not revoke the old app's grant as part of setting up this client.

## 3. Private secrets

Run:

```powershell
node scripts/prepare-cloud.mjs
gcloud services enable secretmanager.googleapis.com --project=YOUR_PROJECT
gcloud secrets create steadier-encryption-key --replication-policy=automatic --data-file=.data/cloud-secrets/encryption-key.txt --project=YOUR_PROJECT
gcloud secrets create steadier-vapid-private-key --replication-policy=automatic --data-file=.data/cloud-secrets/vapid-private-key.txt --project=YOUR_PROJECT
```

Put your **Google Tasks client secret only** in `.data/cloud-secrets/google-client-secret.txt`, then upload it:

```powershell
gcloud secrets create steadier-google-client-secret --replication-policy=automatic --data-file=.data/cloud-secrets/google-client-secret.txt --project=YOUR_PROJECT
```

If a secret already exists, use `gcloud secrets versions add SECRET_NAME --data-file=FILE --project=YOUR_PROJECT`. Do not regenerate the encryption key when updating the deployment: existing OAuth tokens and backups depend on it. Keep a secure recovery copy, then remove the plaintext `.data/cloud-secrets` files when you have verified the upload and recorded the public VAPID key. This directory is ignored by Git and excluded from the container.

The deployment creates four empty provider secret containers. You can add the Anthropic, Gemini, OpenAI and Brave keys in the app after signing in. The server can read and add versions to those containers; it cannot create arbitrary new secrets. Old secret versions remain in Secret Manager until you disable/destroy them there.

## 4. Deploy the private server

Copy `infra/cloud.config.example.json` to `infra/cloud.config.json`. Fill in:

| Setting | Example / purpose |
| --- | --- |
| `project` | Your Cloud project ID |
| `region` | `australia-southeast1` |
| `ownerUid` | Your exact Firebase Authentication UID |
| `webOrigin` | `https://YOUR-USERNAME.github.io` — no repository path |
| `webAppUrl` | `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/` — includes path and trailing slash |
| `googleClientId` | The new Google Tasks OAuth web client ID |
| `vapidPublicKey` | Printed by `prepare-cloud.mjs` |
| `vapidSubject` | Your contact email as `mailto:you@example.com` |
| `newsStorageRightsConfirmed` | Leave false until you verify the search subscription's permissions |

Run from PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File infra/deploy.ps1
```

This is a **real deployment command that creates billable resources**. Review the script first. It enables APIs, creates the runtime and job service accounts, a native Firestore database, an Artifact Registry repository, private audio/temp/backup buckets, a Cloud Tasks queue, two Cloud Run services and a five-minute maintenance job. It builds the backend container through Cloud Build. The Docker image includes FFmpeg.

Both Cloud Run services scale to zero. The API is publicly reachable at the network layer but requires the owner's Firebase token. The worker additionally requires Cloud Run IAM and verifies the job service account's OIDC token. Signed audio links expire after 15 minutes. Storage buckets enforce private access and disable soft deletion so expired raw recordings are not silently retained as recoverable bucket versions.

The script prints:

- The backend URL to use as `VITE_API_URL`, including `/api`.
- The **exact Google Tasks redirect URI**, ending in `/api/google/callback`. Add it to the Tasks OAuth web client before connecting Google in the app.

In Firebase, publish the deny-all client rules from `infra/firestore.rules`. The application uses the server Admin SDK with IAM; browsers do not read Firestore directly. If you enable Firebase Storage client access separately, publish `infra/storage.rules` as well. The three app buckets already use IAM/private access.

For vector retrieval at larger memory counts, create the index if Firestore reports that it is missing:

```powershell
gcloud firestore indexes composite create --collection-group=vectors --query-scope=COLLECTION --field-config=field-path=embedding,vector-config='{"dimension":768,"flat":{}}' --project=YOUR_PROJECT
```

Until that index is available, the app falls back to lexical relevance, pinned memories and recency. Memory storage does not depend on embeddings succeeding. Cloud Firestore setup and indexing are described in [the official vector-search documentation](https://cloud.google.com/firestore/native/docs/vector-search).

The initial Cloud Build identity must be allowed to build/push to this project's Artifact Registry. If organisational policy blocks public Cloud Run invokers, that policy needs an approved architecture adjustment; do not remove Firebase authentication to work around it. The deployment script was syntax-checked and exercised with a fake CLI, but has not been executed against your accounts.

## 5. Publish the frontend to GitHub Pages

Create a new repository for this project and push the files. Keep `.env`, `.data`, `node_modules`, cloud config and credentials out of Git. The reference app belongs in its existing repository.

In the new repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. Under **Settings → Secrets and variables → Actions → Variables**, add:

| Variable | Value |
| --- | --- |
| `VITE_APP_MODE` | `cloud` for private use; `demo` for the public sample |
| `VITE_API_URL` | The Cloud Run API URL including `/api` |
| `VITE_BASE_PATH` | `/YOUR-REPOSITORY/`; `/` for a user site or custom domain |
| `VITE_FIREBASE_API_KEY` | Firebase Web app public API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Usually `YOUR_PROJECT.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Firebase Web app ID |

Run **Actions → Deploy Pages → Run workflow**, or push to `main`. The workflow defaults to a clearly marked demo if `VITE_APP_MODE` has not been set. It does not deploy the private backend or upload personal data. Use the repository's real name in the path, including case.

For a custom domain, update `VITE_BASE_PATH`, the API's `webOrigin`/`webAppUrl`, Firebase authorised domains and GitHub Pages settings together. Never place server credentials in GitHub variables prefixed with `VITE_`.

## 6. Finish the connections

1. Open the published HTTPS URL. Sign in as the configured owner.
2. In Settings, connect Google Tasks. Choose your lists and save preferences. Verify an existing checklist from the old app before editing it.
3. Connect **Anthropic** for Claude advice and **Gemini** for extraction, transcription, factual checks and the default voice. A successful saved key means the key was stored, not that a paid provider call has passed. Start with a short note and one-minute audio.
4. Default voice: `Kore`, `British English`, Gemini Flash TTS. You can select other listed voices, providers and advice models. OpenAI remains optional. Gemini is still needed for extraction/transcription/checking if OpenAI provides advice.
5. For news, connect Brave Search and verify the subscription permits saved source snippets and derived narrated briefings. Then set `newsStorageRightsConfirmed` true and redeploy. See [Brave's API terms](https://api-dashboard.search.brave.com/terms-of-service). A paid plan may add costs outside the per-request estimate. News sends interest queries, not your personal memories, to the search provider.
6. Tap **Enable notifications** in Listen or Settings. Chrome's permission prompt must be accepted on each device. The lock-screen notification is generic; it does not reveal your task titles or relationship details.

## 7. Install on your Galaxy

Open the HTTPS Pages URL in Android Chrome. Use Chrome's menu → **Install app / Add to Home screen**, or the in-app install option when Chrome offers it. Open Steadier from its new icon.

Before your run, update Google Tasks, choose your mix and tap **Create my briefing**. The cloud worker continues while you listen to music. When it is ready, the notification opens the listening shelf. Tap play; the app deliberately does not interrupt music or start speaking by itself. Use **Download** before an unreliable connection.

The player uses one completed audio file and Media Session play/pause/seek controls. Test locking the phone, headset controls and Samsung battery management using [TESTING.md](TESTING.md). A web app cannot guarantee that Android will keep it alive under every battery restriction. Recording requires the app to stay in the foreground.

## 8. Costs, retention and recovery

The starting budget is **A$20/month**, with an infrastructure allowance and a configurable USD/AUD conversion/buffer. Each job reserves estimated spend before starting. Text chat settles reported token usage. Audio/capture jobs charge the reservation conservatively when final provider billing is unavailable. Failed calls may still cost money; there is no automatic blind retry of a task creation that may have succeeded. External subscriptions, taxes, Cloud Build/registry costs, network egress and provider-side adjustments are not controlled by this meter. Set billing alerts in Google Cloud and spend limits where your providers support them.

Raw recordings are deleted after processing; failed or interrupted uploads expire after one hour. The default deletes source transcripts after extraction. Optional transcript retention is 24 hours. Maintenance runs every five minutes; the temp bucket also has a one-day lifecycle backstop. Local unsent recordings stay on your device until sent/discarded; temporary drafts expire after an hour when the app next examines them.

Unpinned episodes expire after seven days by default. Pinned episodes stay until unpinned/deleted or their supporting memories change. Downloaded copies live in browser storage and are checked on reconnect; an offline device cannot learn about a remote deletion until it reconnects. Browser storage can be evicted by the OS.

Encrypted memory backups run daily via maintenance and expire after seven days. They contain distilled memories and templates, not recordings, chats, provider keys or Google refresh tokens. A memory deletion purges existing application backups; subsequent backups reflect the deletion. Restore skips deletion tombstones and existing memories, so it does not overwrite newer corrections. Keep manual exports somewhere private; the app cannot recall a downloaded export.

Re-running `infra/deploy.ps1` rebuilds the backend and updates the services; it does not recreate secret keys. Frontend updates wait until existing tabs close before the new service worker activates. Close all Steadier windows and reopen to get an update. To restore a previous release, redeploy that source version without replacing the encryption key.

For account/provider outages, existing downloaded audio remains playable. New personalised work needs the server and providers. The owner's Google Tasks remain authoritative; refresh the task screen after editing in the old app. Concurrent edits by the old app are not made transactional by this new app; Steadier uses fresh reads, ETags and minimal patches, and rejects conflicts rather than deliberately replacing history.
