import { useCallback, useEffect, useRef, useState } from 'react';
import { durableGet, durableSet } from '@/platform/local-store';
import { pendingWrites, discardPendingWrite, type PendingWrite } from '@/platform/outbox';
import { sameIdea, validateIdea } from '@/lib/ideas.mjs';
export type IdeaStatus = 'new' | 'investigating' | 'completed' | 'dismissed';
export type Idea = { schemaVersion: 1; id: string; text: string; status: IdeaStatus; createdAt: string; updatedAt: string };
export type IdeaRow = { idea: Idea; sha: string | null };
export type IdeaDraft = IdeaRow & { error?: string };
const KEY = 'ideas:drafts:v1';

export function useIdeas() {
    const [rows, setRows] = useState<IdeaRow[]>([]), [drafts, setDrafts] = useState<Record<string, IdeaDraft>>({});
    const draftsRef = useRef<Record<string, IdeaDraft>>({}), persistence = useRef(Promise.resolve());
    const [pending, setPending] = useState<Record<string, PendingWrite>>({}), [selected, setSelected] = useState<string | null>(null);
    const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
    const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
    const [stale, setStale] = useState(false), [busy, setBusy] = useState(false), busyRef = useRef(false), sequence = useRef(0);
    const [remote, setRemote] = useState<IdeaRow | null>(null);
    const commitDrafts = useCallback((next: Record<string, IdeaDraft>) => {
        draftsRef.current = next; setDrafts(next);
        const work = persistence.current.catch(() => {}).then(() => durableSet(KEY, next));
        persistence.current = work;
        void work.catch(() => setError('Utkastet kunde inte sparas på telefonen. Håll texten öppen och försök igen.'));
        return work;
    }, []);
    const refreshPending = useCallback(async () => {
        const writes = await pendingWrites(), result: Record<string, PendingWrite> = {};
        for (const write of writes) if (write.path === '/api/ideas' && write.body.kind === 'json') {
            try { const { idea } = JSON.parse(write.body.text); validateIdea(idea); result[idea.id] = write; } catch { /* Settings still exposes malformed queue items. */ }
        }
        setPending(result); return result;
    }, []);
    const reload = useCallback(async () => {
        if (busyRef.current) return;
        const own = ++sequence.current; setLoading(true);
        try {
            const response = await fetch('/api/ideas', { cache: 'no-store' }), data = await response.json();
            if (!response.ok) throw Error(data.error || 'Idéerna kunde inte hämtas.');
            if (own !== sequence.current) return;
            setRows(data.items); setConfirmedIds([]); setStale(response.headers.get('X-Nexus-Offline') === 'true'); setError('');
            const queued = await refreshPending();
            // Remove a draft only after a verified live read proves its exact content saved.
            if (!response.headers.get('X-Nexus-Offline')) {
                const next = { ...draftsRef.current }; let changed = false;
                for (const row of data.items as IdeaRow[]) if (!queued[row.idea.id] && next[row.idea.id] && sameIdea(next[row.idea.id].idea, row.idea)) { delete next[row.idea.id]; changed = true; }
                if (changed) await commitDrafts(next);
            }
        } catch (e: any) { if (own === sequence.current) { setError(e.message); setStale(true); } }
        finally { if (own === sequence.current) setLoading(false); }
    }, [commitDrafts, refreshPending]);
    useEffect(() => {
        let mounted = true;
        void (async () => {
            try {
                const saved = await durableGet<Record<string, IdeaDraft>>(KEY) || {};
                const writes = await refreshPending();
                for (const [id, item] of Object.entries(writes)) if (!saved[id] && item.body.kind === 'json') {
                    const input = JSON.parse(item.body.text); saved[id] = { idea: input.idea, sha: input.expectedSha };
                }
                if (!mounted) return;
                draftsRef.current = saved; setDrafts(saved); setReady(true); await reload();
            } catch (e: any) { if (mounted) { setError('Lokala idéer kunde inte öppnas. ' + e.message); setLoading(false); } }
        })();
        const completed = (event: Event) => { if ((event as CustomEvent).detail?.path === '/api/ideas') void reload(); };
        const queueChanged = () => { void refreshPending().catch((e: any) => setError(e.message)); };
        window.addEventListener('nexus-write-completed', completed); window.addEventListener('nexus-outbox-changed', queueChanged);
        return () => { mounted = false; sequence.current++; window.removeEventListener('nexus-write-completed', completed); window.removeEventListener('nexus-outbox-changed', queueChanged); };
    }, [reload, refreshPending]);
    function create() {
        if (!ready || busyRef.current) return;
        const at = new Date().toISOString(), id = crypto.randomUUID();
        void commitDrafts({ ...draftsRef.current, [id]: { sha: null, idea: { schemaVersion: 1, id, text: '', status: 'new', createdAt: at, updatedAt: at } } });
        setRemote(null); setSelected(id);
    }
    function open(id: string) { if (!busyRef.current) { setRemote(null); setSelected(id); } }
    function close() { if (!busyRef.current) { setRemote(null); setSelected(null); } }
    function edit(id: string, patch: Partial<Pick<Idea, 'text' | 'status'>>) {
        if (busyRef.current || pending[id]) return;
        const base = draftsRef.current[id] || rows.find(row => row.idea.id === id);
        if (!base) return;
        void commitDrafts({ ...draftsRef.current, [id]: { ...base, error: '', idea: { ...base.idea, ...patch, updatedAt: new Date().toISOString() } } });
    }
    async function save(id: string) {
        if (busyRef.current) return;
        const draft = draftsRef.current[id]; if (!draft || !draft.idea.text.trim()) return;
        busyRef.current = true; setBusy(true); sequence.current++; setLoading(false);
        try {
            await persistence.current; validateIdea(draft.idea);
            const response = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idea: draft.idea, expectedSha: draft.sha }) });
            const data = await response.json();
            if (!response.ok || !data.saved) throw Error(data.error || 'Idén väntar på synk.');
            setConfirmedIds(current => [...current.filter(value => value !== id), id]);
            setRows(current => [data, ...current.filter(row => row.idea.id !== id)]);
            const next = { ...draftsRef.current }; delete next[id]; await commitDrafts(next); setRemote(null);
            // Do not let a GET started before this PUT replace the just-confirmed row.
            sequence.current++; setLoading(false);
        } catch (e: any) {
            const current = draftsRef.current[id];
            if (current) await commitDrafts({ ...draftsRef.current, [id]: { ...current, error: e.message } }).catch(() => {});
        } finally { await refreshPending().catch(() => {}); busyRef.current = false; setBusy(false); }
    }
    async function discard(id: string) {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true);
        try {
            // Fresh queue enumeration avoids racing the delayed outbox-changed render.
            const queued = await refreshPending(); if (queued[id]) await discardPendingWrite(queued[id].id);
            const next = { ...draftsRef.current }; delete next[id]; await commitDrafts(next); setSelected(null); setRemote(null); return true;
        } catch (e: any) { setError(e.message); return false; }
        finally { busyRef.current = false; setBusy(false); void reload(); }
    }
    async function continueEditing(id: string) {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true);
        try {
            const queued = await refreshPending(); if (queued[id]) await discardPendingWrite(queued[id].id);
            const current = draftsRef.current[id];
            if (current) await commitDrafts({ ...draftsRef.current, [id]: { ...current, error: '' } });
            await refreshPending();
        } catch (e: any) { setError(e.message); }
        finally { busyRef.current = false; setBusy(false); }
    }
    async function fetchRemote(id: string) {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true);
        try {
            const response = await fetch('/api/ideas?id=' + encodeURIComponent(id), { cache: 'no-store' }), data = await response.json();
            if (!response.ok || response.headers.get('X-Nexus-Offline')) throw Error(data.error || 'En aktuell GitHub-version kunde inte verifieras.');
            setRemote(data);
        } catch (e: any) { setError(e.message); }
        finally { busyRef.current = false; setBusy(false); }
    }
    async function useRemote() {
        if (!remote || busyRef.current) return;
        const replacement = remote;
        if (!await discard(replacement.idea.id)) return;
        setRows(current => [replacement, ...current.filter(row => row.idea.id !== replacement.idea.id)]); setSelected(replacement.idea.id);
    }
    const merged = new Map(rows.map(row => [row.idea.id, row]));
    for (const [id, draft] of Object.entries(drafts)) merged.set(id, draft);
    const items = [...merged.values()].sort((a, b) => b.idea.updatedAt.localeCompare(a.idea.updatedAt));
    const current = selected ? merged.get(selected) : undefined;
    return { items, current, drafts, pending, selected, ready, loading, error, stale, confirmedIds, busy, remote, create, open, close, edit, save, discard, continueEditing, fetchRemote, useRemote, reload };
}
export type IdeasController = ReturnType<typeof useIdeas>;
