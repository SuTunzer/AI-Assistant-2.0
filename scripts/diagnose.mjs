// Reads the live Firestore state and prints why briefings and captures failed.
// Run: node scripts/diagnose.mjs [--json] [--limit=20]
// Auth: uses your gcloud login. No secret values are ever printed.
import { readFile } from 'node:fs/promises';
import { GoogleAuth } from 'google-auth-library';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const limit = Number(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || 20);

const config = JSON.parse(
  await readFile(new URL('../infra/cloud.config.json', import.meta.url), 'utf8'),
);
const project = config.project;
const owner = config.ownerUid;
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/owners/${owner}`;

// Prefer an explicit token so the script runs on a machine that has the gcloud
// CLI but no application default credentials.
const token = process.env.GOOGLE_ACCESS_TOKEN;
let request;
if (token) {
  request = async ({ url }) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      const error = new Error(await r.text());
      error.response = { status: r.status };
      throw error;
    }
    return { data: await r.json() };
  };
} else {
  try {
    const client = await new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/datastore'],
    }).getClient();
    request = (options) => client.request({ ...options, retry: false });
  } catch {
    console.error(
      'No credentials. Run one of these first:\n' +
        '  gcloud auth application-default login\n' +
        '  $env:GOOGLE_ACCESS_TOKEN = (gcloud auth print-access-token)',
    );
    process.exit(1);
  }
}
const client = { request };

// Firestore's REST shape wraps every value in a type tag; unwrap it so the
// output reads like the domain object the application actually stores.
function plain(value) {
  if (value === undefined || value === null) return null;
  const [kind, inner] = Object.entries(value)[0] ?? [];
  if (kind === 'nullValue') return null;
  if (kind === 'integerValue') return Number(inner);
  if (kind === 'doubleValue') return Number(inner);
  if (kind === 'booleanValue') return inner;
  if (kind === 'arrayValue') return (inner.values || []).map(plain);
  if (kind === 'mapValue') return fields(inner.fields || {});
  return inner;
}
function fields(f) {
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, plain(v)]));
}

async function collection(name) {
  try {
    const r = await client.request({
      url: `${base}/${name}?pageSize=${limit}`,
      retry: false,
    });
    return (r.data.documents || []).map((d) => ({
      id: d.name.split('/').pop(),
      updatedAt: d.updateTime,
      ...fields(d.fields || {}),
    }));
  } catch (e) {
    const status = e.response?.status;
    if (status === 404) return [];
    throw new Error(`Cannot read ${name}: ${status || ''} ${e.message}`);
  }
}

function recent(rows) {
  return [...rows]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, limit);
}

const [jobs, captures, episodes, memories, settingsDocs, budgets, connections] = await Promise.all([
  collection('jobs'),
  collection('captures'),
  collection('episodes'),
  collection('memories'),
  collection('settings'),
  collection('budget'),
  collection('connections'),
]);

const settings = settingsDocs.find((s) => s.id === 'main') || {};

// A connection document holds an encrypted key. Report only that it exists.
const connected = connections.map((c) => c.id);

const report = {
  checkedAt: new Date().toISOString(),
  project,
  settings: {
    adviceProvider: settings.adviceProvider,
    adviceModel: settings.adviceModel,
    extractionModel: settings.extractionModel,
    transcriptionModel: settings.transcriptionModel,
    voiceProvider: settings.voiceProvider,
    voiceModel: settings.voiceModel,
    voice: settings.voice,
    accent: settings.accent,
    defaultMinutes: settings.defaultMinutes,
    monthlyBudgetAud: settings.monthlyBudgetAud,
  },
  connectedProviders: connected,
  budget: budgets.map((b) => ({ month: b.id, spentAud: b.spentAud, reservedAud: b.reservedAud })),
  counts: {
    jobs: jobs.length,
    captures: captures.length,
    episodes: episodes.length,
    memories: memories.length,
  },
  jobs: recent(jobs).map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    stage: j.stage,
    attempts: j.attempts,
    dispatchPending: j.dispatchPending,
    leaseUntil: j.leaseUntil,
    error: j.error,
    updatedAt: j.updatedAt,
  })),
  captures: recent(captures).map((c) => ({
    id: c.id,
    state: c.state,
    mode: c.mode,
    hasAudio: Boolean(c.audioPath),
    mimeType: c.mimeType,
    textLength: c.text ? c.text.length : 0,
    memoryIds: (c.memoryIds || []).length,
    error: c.error,
    updatedAt: c.updatedAt,
  })),
  episodes: recent(episodes).map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    minutes: e.minutes,
    durationSeconds: e.durationSeconds,
    scriptLength: e.script ? e.script.length : 0,
    hasAudio: Boolean(e.audioPath),
    audioBytes: e.audioBytes,
    model: e.model,
    voice: e.voice,
    costAud: e.costAud,
    error: e.error,
    updatedAt: e.updatedAt,
  })),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const line = (label, value) => console.log('  ' + label.padEnd(20) + (value ?? '(unset)'));
console.log('\nSTEADIER DIAGNOSTIC  ' + report.checkedAt);
console.log('Project ' + project + '\n');

console.log('SETTINGS');
for (const [k, v] of Object.entries(report.settings)) line(k, v);
line('connected', connected.length ? connected.join(', ') : 'none');
for (const b of report.budget)
  line('budget ' + b.month, `spent ${b.spentAud} reserved ${b.reservedAud}`);

const section = (name, rows, format) => {
  console.log('\n' + name.toUpperCase() + '  (' + rows.length + ')');
  if (!rows.length) return console.log('  none stored');
  for (const r of rows) {
    console.log('  ' + format(r));
    if (r.error) console.log('      error: ' + r.error);
  }
};

section(
  'jobs',
  report.jobs,
  (j) => `${j.id}  ${j.kind}  ${j.status}  attempts=${j.attempts}  stage="${j.stage}"`,
);
section(
  'captures',
  report.captures,
  (c) =>
    `${c.id}  ${c.state}  ${c.mode}  audio=${c.hasAudio}  ${c.mimeType || 'no mime'}  text=${c.textLength}c  memories=${c.memoryIds}`,
);
section(
  'episodes',
  report.episodes,
  (e) =>
    `${e.id}  ${e.status}  ${e.minutes}min  script=${e.scriptLength}c  audio=${e.hasAudio} ${e.audioBytes || 0}b  ${e.model || '?'}  A$${e.costAud ?? 0}`,
);

const failures = [
  ...report.jobs.filter((j) => j.status === 'failed'),
  ...report.captures.filter((c) => c.state === 'failed'),
  ...report.episodes.filter((e) => e.status === 'failed'),
];
console.log('\nFAILURES  (' + failures.length + ')');
if (!failures.length) console.log('  none recorded');
for (const f of failures) console.log('  ' + f.id + ': ' + (f.error || 'no error text stored'));
console.log('');
