import {resolvedIdeaDraft} from '@/lib/idea-resolution.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { durableGet, durableSet } from '@/platform/local-store';
import { pendingWrites, discardPendingWrite, type PendingWrite } from '@/platform/outbox';
import { sameIdea, validateIdea } from '@/lib/ideas.mjs';
export type IdeaStatus = 'new' | 'investigating' | 'ready' | 'completed' | 'dismissed';
export type Idea = { schemaVersion: 1; id: string; text: string; status: IdeaStatus; createdAt: string; updatedAt: string };
export type IdeaRow = { idea: Idea; sha: string | null };
export type IdeaDraft = IdeaRow & { error?: string };
type ConflictBackup={id:string;at:string;local:IdeaRow;remote:IdeaRow};
const BACKUPS='ideas:conflicts:v1:';
const KEY = 'ideas:drafts:v1';

export function useIdeas() {
    const [numbering,setNumbering]=useState<{entries:{id:string;number:number;createdAt:string}[];dailyCounts:Record<string,number>}>({entries:[],dailyCounts:{}});
    const [rows, setRows] = useState<IdeaRow[]>([]), [drafts, setDrafts] = useState<Record<string, IdeaDraft>>({});
    const draftsRef = useRef<Record<string, IdeaDraft>>({}), persistence = useRef(Promise.resolve());
    const [pending, setPending] = useState<Record<string, PendingWrite>>({}), [selected, setSelected] = useState<string | null>(null);
    const [ready, setReady] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
    const [confirmedIds, setConfirmedIds] = useState<string[]>([]);
    const [stale, setStale] = useState(false), [busy, setBusy] = useState(false), busyRef = useRef(false), sequence = useRef(0);
    const [remote, setRemote] = useState<IdeaRow | null>(null);
    const [backups,setBackups]=useState<ConflictBackup[]>([]);
    useEffect(()=>{let active=true;setBackups([]);if(selected)void durableGet<ConflictBackup[]>(BACKUPS+selected).then(value=>{if(active)setBackups(value||[]);}).catch(e=>setError('Säkerhetskopiorna kunde inte öppnas: '+e.message));return()=>{active=false;};},[selected]);
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
            setRows(data.items); setNumbering(data.numbering||{entries:[],dailyCounts:{}}); setConfirmedIds([]); setStale(response.headers.get('X-Nexus-Offline') === 'true'); setError('');
            const queued = await refreshPending();
            // Remove a draft only after a verified live read proves its exact content saved.
            if (!response.headers.get('X-Nexus-Offline')&&!response.headers.get('X-Nexus-Local')) {
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
        if (busyRef.current) return false;
        const draft = draftsRef.current[id]; if (!draft || !draft.idea.text.trim()) return false;
        busyRef.current = true; setBusy(true); sequence.current++; setLoading(false);
        try {
            await persistence.current; validateIdea(draft.idea);
            const response = await fetch('/api/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idea: draft.idea, expectedSha: draft.sha }) });
            const data = await response.json();
            if (!response.ok || !data.saved) throw Error(data.error || 'Idén väntar på synk.');
            if(data.number) setNumbering(current=>({...current,entries:[...current.entries.filter(e=>e.id!==id),{id,number:data.number,createdAt:draft.idea.createdAt}]}));
            setConfirmedIds(current => [...current.filter(value => value !== id), id]);
            setRows(current => [data, ...current.filter(row => row.idea.id !== id)]);
            const next = { ...draftsRef.current }; delete next[id]; await commitDrafts(next); setRemote(null);
            // A confirmed GitHub version is the only automatic Intelligence trigger.
            // Native work is independent of this React view. A failed optional trigger
            // never rolls back a confirmed idea save or exposes the GitHub credential.
            if (!response.headers.get('X-Nexus-Offline') &&
                !response.headers.get('X-Nexus-Local') &&
                /^[a-f0-9]{40}$/.test(data.sha || '') &&
                draft.idea.text.length <= 20000) {
                try {
                    const native=(window as any).Android;
                    native?.intelligenceQueueIdea?.(id,data.sha,draft.idea.text);
                } catch { /* Saved original remains authoritative. */ }
            }
            // Do not let a GET started before this PUT replace the just-confirmed row.
            sequence.current++; setLoading(false);
            return true;
        } catch (e: any) {
            const current = draftsRef.current[id];
            if (current) await commitDrafts({ ...draftsRef.current, [id]: { ...current, error: e.message } }).catch(() => {});
            return false;
        } finally { await refreshPending().catch(() => {}); busyRef.current = false; setBusy(false); }
    }
    async function remove(id: string) {
        if (busyRef.current) return;
        const row = rows.find(row => row.idea.id === id), draft = draftsRef.current[id];
        const sha = draft?.sha || row?.sha;
        if (!sha) return;
        busyRef.current = true; setBusy(true); sequence.current++; setLoading(false); setError('');
        try {
            const queued = await refreshPending();
            if (queued[id]) throw Error('Avsluta eller ångra det väntande sparförsöket innan du raderar idén.');
            const response = await fetch('/api/ideas', {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,expectedSha:sha})});
            const data = await response.json();
            if (!response.ok || !data.deleted) throw Error(data.error || 'Raderingen kunde inte bekräftas. Försök igen.');
            const next = {...draftsRef.current}; delete next[id]; await commitDrafts(next);
            setRows(current => current.filter(row => row.idea.id !== id)); setSelected(null); setRemote(null);
            setNumbering(current=>({...current,entries:current.entries.filter(entry=>entry.id!==id)}));
            window.dispatchEvent(new CustomEvent('nexus-write-completed',{detail:{path:'/api/ideas',method:'DELETE',id}}));
        } catch (e: any) { setError(e.message); }
        finally { busyRef.current = false; setBusy(false); }
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
            const response = await fetch('/api/ideas?id=' + encodeURIComponent(id), { cache: 'reload' }), data = await response.json();
            if (!response.ok || response.headers.get('X-Nexus-Offline')) throw Error(data.error || 'En aktuell GitHub-version kunde inte verifieras.');
            setRemote(data);
        } catch (e: any) { setError(e.message); }
        finally { busyRef.current = false; setBusy(false); }
    }
    async function preserveVersions(local:IdeaRow,github:IdeaRow) {
        const key=BACKUPS+local.idea.id;
        const previous=await durableGet<ConflictBackup[]>(key)||[];
        const backup={id:crypto.randomUUID(),at:new Date().toISOString(),local:structuredClone(local),remote:structuredClone(github)};
        const next=[backup,...previous];await durableSet(key,next);setBackups(next);
    }
    async function resolveConflict(choice:'merge'|'local'|'github') {
        if(!remote||busyRef.current)return;
        const original=draftsRef.current[remote.idea.id];if(!original)return;
        busyRef.current=true;setBusy(true);sequence.current++;setError('');
        try{
            await persistence.current;
            const response=await fetch('/api/ideas?id='+encodeURIComponent(remote.idea.id),{cache:'reload'}),latest=await response.json();
            if(!response.ok||response.headers.get('X-Nexus-Offline'))throw Error('En aktuell GitHub-version behövs. Båda texterna ligger kvar.');
            if(latest.sha!==remote.sha){setRemote(latest);throw Error('GitHub-versionen ändrades igen. Läs den nya texten nedan och välj på nytt.');}
            // Do not cancel a queued intent or replace a draft before both versions are durable.
            await preserveVersions(original,latest);
            const next=resolvedIdeaDraft(original,latest,choice,new Date().toISOString());
            const queued=await refreshPending();if(queued[original.idea.id])await discardPendingWrite(queued[original.idea.id].id);
            const drafts={...draftsRef.current};
            if(choice==='github')delete drafts[original.idea.id];else drafts[original.idea.id]=next;
            await commitDrafts(drafts);
            setRows(current=>[latest,...current.filter(row=>row.idea.id!==latest.idea.id)]);setRemote(null);setStale(false);
        }catch(e:any){setError(e.message);}
        finally{await refreshPending().catch(()=>{});busyRef.current=false;setBusy(false);}
    }
    async function restoreVersion(backup:ConflictBackup,side:'local'|'remote') {
        if(busyRef.current||pending[backup.local.idea.id])return;
        const base=draftsRef.current[backup.local.idea.id]||rows.find(row=>row.idea.id===backup.local.idea.id);if(!base)return;
        busyRef.current=true;setBusy(true);sequence.current++;setError('');
        try{
            await persistence.current;
            await preserveVersions(base,rows.find(row=>row.idea.id===base.idea.id)||base);
            const next={...base,idea:{...base.idea,text:backup[side].idea.text,status:backup[side].idea.status,updatedAt:new Date().toISOString()},error:''};
            await commitDrafts({...draftsRef.current,[base.idea.id]:next});setRemote(null);
        }catch(e:any){setError(e.message);}finally{busyRef.current=false;setBusy(false);}
    }
    const merged = new Map(rows.map(row => [row.idea.id, row]));
    for (const [id, draft] of Object.entries(drafts)) merged.set(id, draft);
    const items = [...merged.values()].sort((a, b) => b.idea.updatedAt.localeCompare(a.idea.updatedAt));
    const current = selected ? merged.get(selected) : undefined;
    return { numbering, items, current, drafts, pending, selected, ready, loading, error, stale, confirmedIds, busy, remote, backups, resolveConflict, restoreVersion, create, open, close, edit, save, discard, continueEditing, fetchRemote, reload, remove };
}
export type IdeasController = ReturnType<typeof useIdeas>;
