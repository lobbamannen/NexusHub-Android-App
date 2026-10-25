import { useCallback, useEffect, useRef, useState } from 'react';
import { bookmarkEntry } from '@/lib/document-bookmarks.mjs';
const LOCAL_KEY = 'nexus-portal-favorites';
async function request(body?: unknown) { const r = await fetch('/api/document-bookmarks', { method: body ? 'POST' : 'GET', cache: 'no-store', ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }); const data: any = await r.json(); if (!r.ok)
    throw Error(data.error || 'GitHub kunde inte nås.'); return data; }
const rows = (data: any) => Object.values(data.register.entries).filter((e: any) => e.saved) as any[];
export function useDocumentBookmarks() {
    const [entries, setEntries] = useState<any[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
    const lock = useRef(false), generation = useRef(0);
    const reload = useCallback(async () => {
        const run = ++generation.current;
        setLoading(true);
        setError('');
        try {
            let data = await request();
            let local: any[] = [];
            try {
                const value = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
                if (Array.isArray(value))
                    local = value;
            }
            catch { }
            const valid = local.filter(entry => { try {
                bookmarkEntry(entry);
                return true;
            }
            catch {
                return false;
            } });
            for (let i = 0; i < valid.length; i += 200)
                data = await request({ action: 'migrate', entries: valid.slice(i, i + 200) });
            // Clear only the exact successfully migrated snapshot; preserve any invalid legacy rows.
            if (valid.length) {
                try {
                    const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
                    if (JSON.stringify(current) === JSON.stringify(local))
                        localStorage.setItem(LOCAL_KEY, JSON.stringify(local.filter(e => !valid.includes(e))));
                }
                catch { }
            }
            if (run === generation.current) {
                setEntries(rows(data));
                if (valid.length < local.length)
                    setError((local.length - valid.length) + ' äldre genvägar kunde inte överföras och finns kvar på enheten.');
            }
        }
        catch (e: any) {
            if (run === generation.current)
                setError(e.message);
        }
        finally {
            if (run === generation.current)
                setLoading(false);
        }
    }, []);
    useEffect(() => { void reload(); return () => { generation.current++; }; }, [reload]);
    const mark = async (entry: any, value: boolean) => { if (lock.current)
        return false; lock.current = true; generation.current++; setBusy(true); setError(''); try {
        const data = await request({ action: 'set', entry, value });
        setEntries(rows(data));
        return true;
    }
    catch (e: any) {
        setError(e.message);
        return false;
    }
    finally {
        lock.current = false;
        setBusy(false);
        setLoading(false);
    } };
    return { entries, error, busy, loading, reload, mark };
}
