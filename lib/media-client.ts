// Short-lived shared reads; explicit refreshes and all writes invalidate both registers.
const cache = new Map<string, {
    until: number;
    response: Response;
}>();
const pending = new Map<string, Promise<Response>>();
let generation = 0;
export function invalidateMedia() { generation++; cache.clear(); pending.clear(); }
export async function mediaFetch(url: string, options: RequestInit = {}, force = false): Promise<Response> {
    if (options.method && options.method !== 'GET') {
        invalidateMedia();
        try {
            return await fetch(url, options);
        }
        finally {
            invalidateMedia();
        }
    }
    const current = cache.get(url);
    if (!force && current && Date.now() < current.until)
        return current.response.clone();
    if (force)
        invalidateMedia();
    let task = pending.get(url);
    if (!task) {
        const run = generation;
        task = fetch(url, { cache: force?'reload':'no-store' }).then(response => { if (response.ok && run === generation)
            cache.set(url, { until: Date.now() + 10000, response: response.clone() }); return response; });
        pending.set(url, task);
        const own = task;
        void task.finally(() => { if (pending.get(url) === own)
            pending.delete(url); }).catch(() => { });
    }
    const response = await task;
    if (options.signal?.aborted)
        throw new DOMException('Aborted', 'AbortError');
    return response.clone();
}
