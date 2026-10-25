import { useState, type Dispatch, type SetStateAction } from 'react';
const values = new Map<string, unknown>();
export function useLibraryState<T>(key: string, initial: T): [
    T,
    Dispatch<SetStateAction<T>>
] {
    const [value, setValue] = useState<T>(() => values.has(key) ? values.get(key) as T : initial);
    const set: Dispatch<SetStateAction<T>> = next => setValue(previous => { const resolved = typeof next === 'function' ? (next as (value: T) => T)(previous) : next; values.set(key, resolved); return resolved; });
    return [value, set];
}
