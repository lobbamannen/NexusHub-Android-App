import { queuedEditMatches } from '@/lib/draft-scope.mjs';
import { sameIdea } from '@/lib/ideas.mjs';
import { durableGet, durableSet, durableDelete, durableEntries } from './local-store';
import { catalogReconciledReceipt } from '@/lib/economy-catalog.mjs';

export type WriteStatus = 'pending' | 'conflict' | 'failed';
type StoredBody = { kind: 'json'; text: string } | { kind: 'form'; entries: [string, string | File][] };
export interface PendingWrite {
  id: string; path: string; method: string; createdAt: string; updatedAt: string;
  status: WriteStatus; attempts: number; error: string; uncertain: boolean;
  body: StoredBody; contentType: string;
}
type Receipt = { status: number; completedAt: string };
type Dispatcher = (request: Request) => Promise<Response>;
const PREFIX = 'outbox:v1:';
let dispatch: Dispatcher;
let chain: Promise<unknown> = Promise.resolve();
let networkFailure = false;
let observing = false;
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nexus-outbox-changed')); }
function completed(item: PendingWrite) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('nexus-write-completed', { detail: { id: item.id, path: item.path } })); }
export function noteGithubFailure() { if (observing) networkFailure = true; }
export function configureOutbox(handler: Dispatcher) { dispatch = handler; }
export function isQueuedMutation(request: Request) {
  return request.method === 'POST' && /^\/api\/(ideas|films|series|media-register|story-register|story-status|document-bookmarks|economy|files(?:\/[^/]+\/github)?)\/?$/.test(new URL(request.url).pathname);
}
async function locked<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request('nexushub-github-outbox', work);
    return work();
  };
  const result = chain.then(run, run); chain = result.catch(() => {}); return result;
}
export async function pendingWrites(): Promise<PendingWrite[]> {
  return (await durableEntries<PendingWrite>(PREFIX)).map(([, value]) => value).sort((a,b) => a.createdAt.localeCompare(b.createdAt));
}
export async function discardPendingWrite(id: string): Promise<void> {
  await locked(async () => { await durableDelete(PREFIX + id); changed(); });
}
export type DraftScope = 'media' | 'film' | 'stories' | 'economy' | 'all-drafts';
/** Cancel only explicit editor drafts. Direct saved/read flags and uploads are retained. */
export async function cancelQueuedEdits(scope: DraftScope, target: { path: string; id: string; kind?: string } | null = null): Promise<void> {
  await locked(async () => {
    let removed = false;
    for (const item of await pendingWrites()) {
      const matchesScope = queuedEditMatches(item, scope, target);
      if (matchesScope) { await durableDelete(PREFIX + item.id); removed = true; }
    }
    if (removed) changed();
  });
}
function queued(item: PendingWrite, status = item.status === 'conflict' ? 409 : 503) {
  return Response.json({ saved: false, queued: true, pendingWriteId: item.id, status: item.status,
    error: item.error || 'Ändringen väntar lokalt och är inte bekräftad i GitHub. Dina utkast finns kvar. Hantera väntande ändringar i Inställningar.' }, { status });
}
async function serialize(request: Request): Promise<Omit<PendingWrite, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'attempts' | 'error' | 'uncertain'>> {
  const path = new URL(request.url).pathname + new URL(request.url).search;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const form = await request.clone().formData();
    if (!form.get('uploadId')) form.set('uploadId', crypto.randomUUID());
    return { path, method: request.method, contentType: '', body: { kind: 'form', entries: Array.from(form.entries()) } };
  }
  const text = await request.clone().text();
  // Credentials belong only in the platform token store, never in a replayable request.
  if (/"(?:authorization|token|github[_-]?token|access[_-]?token|password)"\s*:/i.test(text)) throw Error('Inloggningsuppgifter får inte lagras i väntande ändringar.');
  return { path, method: request.method, contentType, body: { kind: 'json', text } };
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function fingerprint(value: Awaited<ReturnType<typeof serialize>>) {
  let normalizedBody: unknown = value.body;
  if (value.body.kind === 'json') { try { normalizedBody = canonical(JSON.parse(value.body.text)); } catch { /* Invalid input is handled by the unchanged route. */ } }
  const bytes: Uint8Array[] = [new TextEncoder().encode(JSON.stringify({ path: value.path, method: value.method, body: value.body.kind === 'json' ? normalizedBody : value.body.entries.map(([key, val]) => [key, typeof val === 'string' ? val : [val.name, val.size, val.type]]) }))];
  if (value.body.kind === 'form') for (const [, part] of value.body.entries) if (typeof part !== 'string') bytes.push(new Uint8Array(await part.arrayBuffer()));
  const length = bytes.reduce((n, part) => n + part.length, 0), data = new Uint8Array(length);
  let offset = 0; for (const part of bytes) { data.set(part, offset); offset += part.length; }
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(v => v.toString(16).padStart(2, '0')).join('');
}
function restore(item: PendingWrite) {
  let body: BodyInit, headers: HeadersInit = {};
  if (item.body.kind === 'json') { body = item.body.text; if (item.contentType) headers = { 'Content-Type': item.contentType }; }
  else { const form = new FormData(); for (const [key,value] of item.body.entries) form.append(key,value); body = form; }
  return new Request(new URL(item.path, location.origin), { method: item.method, headers, body });
}
function same(value: any, expected: any): boolean { return JSON.stringify(value) === JSON.stringify(expected); }
function matches(row: any, patch: any) { return !!row && Object.keys(patch).every(key => same(row[key], patch[key])); }
// A lost response may follow a committed PUT. Verify the requested fields before retrying;
// never substitute a new expectedSha into an old user's request.
async function reconcile(item: PendingWrite): Promise<Response | null> {
  if (item.body.kind !== 'json' || item.path.startsWith('/api/files')) return null;
  let input: any; try { input = JSON.parse(item.body.text); } catch { return null; }
  if (item.path === '/api/ideas') {
    const response = await dispatch(new Request(new URL('/api/ideas?id=' + encodeURIComponent(input.idea?.id || ''), location.origin)));
    if (!response.ok) return null;
    const data = await response.json();
    return sameIdea(data.idea, input.idea) ? Response.json({ ...data, saved: true, reconciled: true, source: 'github' }) : null;
  }
  const endpoint = item.path === '/api/media-register' ? '/api/' + input.kind : item.path;
  const response = await dispatch(new Request(new URL(endpoint, location.origin)));
  if (!response.ok) return null;
  const data: any = await response.clone().json(), register = data.register;
  if (item.path === '/api/economy') {
    if (input.action === 'upsert' && /^Ekonomi\/Katalog\/(?:kategorier|produkter)\.json$/.test(input.path || '')) {
      const receipt = catalogReconciledReceipt(data, input);
      return receipt ? Response.json(receipt) : null;
    }
    const file = data.files?.find((f: any) => f.path === input.path);
    const rows = file?.data?.entries || file?.data?.purchases;
    const hits = rows?.filter((row: any) => row.id === input.id);
    const confirmed = file?.sha !== input.expectedSha && hits?.length === 1 &&
      matches(hits[0], input.changes);
    return confirmed ? Response.json({ saved: true, reconciled: true, source: 'github', path: input.path, sha: file.sha, data: file.data }) : null;
  }
  if (!register) return null;
  let complete = false;
  if (item.path === '/api/media-register') {
    const rows = register[input.kind];
    complete = Array.isArray(input.edits) && input.edits.length > 0 && input.edits.every((edit: any) => {
      const hits = rows?.filter((row: any) => input.kind === 'films' ? row.imdbId === edit.target : row.title === edit.target?.title && row.startYear === edit.target?.startYear && (row.imdbId || null) === (edit.target?.imdbId || null));
      return hits?.length === 1 && matches(hits[0], edit.changes);
    });
  } else if (item.path === '/api/films') {
    const hits = register.films?.filter((row: any) => row.imdbId === input.film?.imdbId);
    complete = hits?.length === 1 && matches(hits[0], input.film);
  } else if (item.path === '/api/series') {
    const hits = register.series?.filter((row: any) => row.title === input.target?.title && row.startYear === input.target?.startYear && (row.imdbId || null) === (input.target?.imdbId || null));
    complete = hits?.length === 1 && (input.action === 'set-watchlist' ? (hits[0].wantToWatch === true || (hits[0].wantToWatch !== false && hits[0].status === 'Vill se')) === input.wantToWatch : input.action === 'set-watched-seasons' && same([...(hits[0].watchedSeasons || [])].sort((a: number,b: number) => a-b), [...input.watchedSeasons].sort((a: number,b: number) => a-b)));
  } else if (item.path === '/api/story-register') {
    complete = Array.isArray(input.edits) && input.edits.length > 0 && input.edits.every((edit: any) => matches(register.entries?.[edit.path], edit.changes));
  } else if (item.path === '/api/story-status') {
    if (input.action === 'batch') complete = input.edits?.length > 0 && input.edits.every((edit: any) => register.entries?.[edit.path]?.read === edit.value);
    if (input.action === 'set') complete = register.entries?.[input.path]?.[input.field] === input.value;
    if (input.action === 'migrate') complete = input.paths?.every((entry: any) => (!entry.read || register.entries?.[entry.path]?.read) && (!entry.saved || register.entries?.[entry.path]?.saved));
  } else if (item.path === '/api/document-bookmarks') {
    const key = (entry: any) => entry.copyId ? 'copy:' + entry.copyId : 'github:' + (entry.repoKey || 'databas') + ':' + entry.path;
    if (input.action === 'set') complete = register.entries?.[key(input.entry)]?.saved === input.value;
    if (input.action === 'migrate') complete = input.entries?.every((entry: any) => !!register.entries?.[key(entry)]);
  }
  return complete ? Response.json({ ...data, saved: true, reconciled: true, source: 'github' }) : null;
}
async function finish(item: PendingWrite, response: Response) {
  // Retain a credential-free receipt to prevent duplicate delivery after a render/restart.
  const receipt: Receipt = { status: response.status, completedAt: new Date().toISOString() };
  await durableSet('outbox-receipt:v1:' + item.id, receipt);
  await durableDelete(PREFIX + item.id);
  changed(); completed(item);
  return response;
}
async function execute(item: PendingWrite): Promise<Response> {
  if (item.uncertain) {
    try { const checked = await reconcile(item); if (checked) return finish(item, checked); } catch { /* original request below retains its SHA */ }
  }
  item.attempts++; item.updatedAt = new Date().toISOString(); item.uncertain = true;
  await durableSet(PREFIX + item.id, item); // Persist uncertainty before any remote side effect.
  let response: Response;
  networkFailure = false; observing = true;
  try {
    response = await dispatch(restore(item));
    let data: any = null; try { data = await response.clone().json(); } catch { /* non-JSON errors */ }
    const uploadPending = item.path.startsWith('/api/files') && (data?.github?.state === 'pending' || data?.state === 'pending');
    if (response.ok && !uploadPending) return await finish(item, response);
    item.status = response.status === 409 ? 'conflict' : networkFailure || response.status >= 500 || response.status === 429 || uploadPending ? 'pending' : 'failed';
    item.error = data?.error || data?.github?.error || 'Ändringen kunde inte bekräftas i GitHub.';
    // Upload has a local receipt but still needs explicit GitHub delivery on replay.
    if (uploadPending && data?.id && item.body.kind === 'form') {
      item.path = '/api/files/' + encodeURIComponent(data.id) + '/github';
      item.body = { kind: 'json', text: '{}' }; item.contentType = 'application/json';
    }
  } catch (error) {
    item.status = 'pending'; item.error = error instanceof Error ? error.message : String(error);
  } finally { observing = false; }
  item.error += item.status === 'conflict' ? ' Konflikten väntar på ditt beslut i Inställningar; ingen automatisk omskrivning görs.' : ' Inte bekräftat i GitHub. Dina utkast finns kvar; hantera väntande ändringar i Inställningar.';
  await durableSet(PREFIX + item.id, item);
  changed();
  return queued(item, item.status === 'failed' ? response!?.status || 400 : undefined);
}
export async function enqueueMutation(request: Request): Promise<Response> {
  return locked(async () => {
    try {
      const serialized = await serialize(request), id = await fingerprint(serialized);
      const receipt = await durableGet<Receipt>('outbox-receipt:v1:' + id);
      // A→B→A is a new intent even if its bytes match an old completed request.
      // A historical receipt alone never proves that the desired state is current.
      const existing = await durableGet<PendingWrite>(PREFIX + id);
      if (existing) return existing.status === 'pending' ? execute(existing) : queued(existing); // Explicit Spara may resume pending; conflicts require Settings review.
      const at = new Date().toISOString();
      const item: PendingWrite = { ...serialized, id, createdAt: at, updatedAt: at, status: 'pending', attempts: 0, error: '', uncertain: !!receipt };
      await durableSet(PREFIX + id, item);
      changed();
      return execute(item);
    } catch (error) {
      return Response.json({ saved: false, error: 'Ändringen kunde inte säkras lokalt. Inget nytt nätverksförsök startades. ' + (error instanceof Error ? error.message : String(error)) }, { status: 503 });
    }
  });
}
export async function retryPendingWrites(id?: string): Promise<PendingWrite[]> {
  return locked(async () => {
    for (const item of await pendingWrites()) {
      if (id ? item.id !== id : item.status !== 'pending') continue;
      await execute(item);
    }
    return pendingWrites();
  });
}

/** A new explicit save replaces older pending edits to this same economy entry.
 * An identical retry retains uncertainty and its original SHA for reconciliation. */
export async function cancelSupersededEconomyWrites(input: any): Promise<void> {
  const target = { path: input.path, id: input.entry?.id || input.id, ...(input.kind ? { kind: input.kind } : {}) };
  await locked(async () => {
    for (const item of await pendingWrites()) {
      if (!queuedEditMatches(item, 'economy', target) || item.body.kind !== 'json') continue;
      if (JSON.stringify(canonical(JSON.parse(item.body.text))) !== JSON.stringify(canonical(input))) {
        await durableDelete(PREFIX + item.id); changed();
      }
    }
  });
}
