import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { env } from './env';
import { STORAGE_SCHEMA } from './storage-schema';

const STORAGE_NAME = 'nexus_hub_android_v1';
const DATABASE_KEY = 'main';
let idbPromise: Promise<IDBDatabase> | undefined;

function openStorage(): Promise<IDBDatabase> {
  if (!idbPromise) idbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_NAME, 1);
    request.onupgradeneeded = () => {
      for (const name of ['database', 'kv', 'binaries']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); idbPromise = undefined; };
      resolve(db);
    };
    request.onerror = () => { idbPromise = undefined; reject(request.error); };
    request.onblocked = () => { idbPromise = undefined; reject(new Error('Local storage upgrade is blocked by another app window.')); };
  });
  return idbPromise;
}

async function readValue<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    tx.oncomplete = () => resolve(request.result as T | undefined);
    tx.onabort = () => reject(tx.error || request.error || new Error('Local read aborted.'));
    tx.onerror = () => { /* onabort reports the transaction failure. */ };
  });
}

async function writeValue(store: string, key: IDBValidKey, value: unknown, remove = false): Promise<void> {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    // Wait for transaction completion, not merely put success, before acknowledging durability.
    const tx = db.transaction(store, 'readwrite', { durability: 'strict' });
    const target = tx.objectStore(store);
    if (remove) target.delete(key); else target.put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('Local storage write aborted.'));
    tx.onerror = () => { /* onabort reports the transaction failure. */ };
  });
}

export function durableGet<T = unknown>(key: string): Promise<T | undefined> { return readValue<T>('kv', key); }
export function durableSet(key: string, value: unknown): Promise<void> { return writeValue('kv', key, value); }
export function durableDelete(key: string): Promise<void> { return writeValue('kv', key, undefined, true); }
/** Key-only enumeration avoids materializing unrelated large cached values. */
export async function durableKeys(prefix = ''): Promise<string[]> {
  const db = await openStorage();
  return new Promise((resolve,reject) => {
    const tx=db.transaction('kv','readonly');
    const request=tx.objectStore('kv').openKeyCursor(prefix?IDBKeyRange.lowerBound(prefix):undefined);
    const keys:string[]=[];
    request.onsuccess=()=>{
      const cursor=request.result;if(!cursor)return;
      if(typeof cursor.key!=='string'){if(!prefix)cursor.continue();return;}
      if(!cursor.key.startsWith(prefix))return;
      keys.push(cursor.key);cursor.continue();
    };
    tx.oncomplete=()=>resolve(keys);
    tx.onabort=()=>reject(tx.error||request.error||new Error('Cache key enumeration failed.'));
  });
}
export async function durableEntries<T = unknown>(prefix = ''): Promise<Array<[string, T]>> {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly');
    const request = tx.objectStore('kv').openCursor(prefix ? IDBKeyRange.lowerBound(prefix) : undefined);
    const entries: Array<[string, T]> = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      // An empty prefix must scan past non-string IndexedDB keys; those may
      // sort before string keys. A nonempty prefix starts at its string lower bound.
      if (typeof cursor.key !== 'string') {
        if (!prefix) cursor.continue();
        return;
      }
      if (!cursor.key.startsWith(prefix)) return;
      entries.push([cursor.key, cursor.value]);
      cursor.continue();
    };
    tx.oncomplete = () => resolve(entries);
    tx.onabort = () => reject(tx.error || request.error || new Error('Local listing aborted.'));
  });
}

type Row = Record<string, unknown>;
type Result<T = Row> = { results: T[]; success: true; meta: { changes: number; duration: number; last_row_id: number } };

export class LocalStatement {
  constructor(readonly owner: LocalDatabase, readonly sql: string, readonly values: unknown[] = []) {}
  bind(...values: unknown[]): LocalStatement { return new LocalStatement(this.owner, this.sql, values); }
  async all<T = Row>(): Promise<Result<T>> { return this.owner.execute<T>(this); }
  async first<T = Row>(column?: string): Promise<T | null> {
    const result = await this.all<Row>();
    const row = result.results[0];
    return (row ? column === undefined ? row : row[column] : null) as T | null;
  }
  async run<T = Row>(): Promise<Result<T>> { return this.owner.execute<T>(this); }
  async raw<T = unknown[]>(): Promise<T[]> {
    const result = await this.all<Row>();
    return result.results.map(row => Object.values(row)) as T[];
  }
}

export class LocalDatabase {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private SQL: SqlJsStatic, private connection: Database) {
    this.connection.run('PRAGMA foreign_keys=ON');
  }
  prepare(sql: string): LocalStatement { return new LocalStatement(this, sql); }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }

  private snapshot(): Uint8Array {
    const bytes = this.connection.export();
    // sql.js export reopens its connection and resets connection-local PRAGMAs.
    this.connection.run('PRAGMA foreign_keys=ON');
    return bytes;
  }

  private query<T>(statement: LocalStatement): Result<T> {
    if (statement.owner !== this) throw new Error('Statement belongs to another database.');
    const started = performance.now();
    const prepared = this.connection.prepare(statement.sql);
    const results: T[] = [];
    try {
      prepared.bind(statement.values.map(value => value === undefined ? null : typeof value === 'boolean' ? Number(value) : value) as SqlValue[]);
      while (prepared.step()) results.push(prepared.getAsObject() as T);
    } finally { prepared.free(); }
    const changes = /^\s*(SELECT|EXPLAIN|PRAGMA)\b/i.test(statement.sql) ? 0 : this.connection.getRowsModified();
    const lastId = this.connection.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
    return { results, success: true, meta: { changes, duration: performance.now() - started, last_row_id: Number(lastId || 0) } };
  }

  private async transact<T>(work: () => T): Promise<T> {
    const before = this.snapshot();
    try {
      this.connection.run('BEGIN IMMEDIATE');
      const result = work();
      this.connection.run('COMMIT');
      await writeValue('database', DATABASE_KEY, this.snapshot());
      return result;
    } catch (error) {
      // Persistence failures restore the exact pre-operation database before the next queued operation.
      this.connection.close();
      this.connection = new this.SQL.Database(before);
      this.connection.run('PRAGMA foreign_keys=ON');
      throw error;
    }
  }

  execute<T = Row>(statement: LocalStatement): Promise<Result<T>> {
    return this.serialize(async () => {
      if (/^\s*(SELECT|EXPLAIN)\b/i.test(statement.sql)) return this.query<T>(statement);
      return this.transact(() => this.query<T>(statement));
    });
  }

  batch<T = Row>(statements: LocalStatement[]): Promise<Result<T>[]> {
    return this.serialize(() => this.transact(() => statements.map(statement => this.query<T>(statement))));
  }

  exec(sql: string): Promise<{ count: number; duration: number }> {
    return this.serialize(() => this.transact(() => {
      const start = performance.now();
      this.connection.run(sql);
      return { count: this.connection.getRowsModified(), duration: performance.now() - start };
    }));
  }

  /** Snapshot contains application data only; credentials never enter this database. */
  export(): Promise<Uint8Array> { return this.serialize(async () => this.snapshot()); }
}

type StoredBinary = { bytes: Uint8Array; httpMetadata: Record<string, string>; uploaded: string; };
export class LocalBucket {
  /** Inventory keys without deserializing hundreds of MB of stored originals. */
  async keys(prefix = ''): Promise<string[]> {
    const db = await openStorage();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('binaries', 'readonly');
      const request = tx.objectStore('binaries').getAllKeys(IDBKeyRange.bound(prefix, prefix + '\uffff'));
      tx.oncomplete = () => resolve(request.result.filter((key): key is string => typeof key === 'string'));
      tx.onabort = () => reject(tx.error || request.error || new Error('Kunde inte inventera lokala filer.'));
    });
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView | Blob | ReadableStream<Uint8Array> | string, options?: { httpMetadata?: Record<string, string> }): Promise<{ key: string; size: number }> {
    let bytes: Uint8Array;
    if (typeof value === 'string') bytes = new TextEncoder().encode(value);
    else if (value instanceof Blob) bytes = new Uint8Array(await value.arrayBuffer());
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value.slice(0));
    else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
    else bytes = new Uint8Array(await new Response(value).arrayBuffer());
    await writeValue('binaries', key, { bytes, httpMetadata: options?.httpMetadata || {}, uploaded: new Date().toISOString() } satisfies StoredBinary);
    return { key, size: bytes.byteLength };
  }
  async get(key: string) {
    const stored = await readValue<StoredBinary>('binaries', key);
    if (!stored) return null;
    const bytes = new Uint8Array(stored.bytes);
    return {
      key, size: bytes.byteLength, uploaded: new Date(stored.uploaded), httpMetadata: stored.httpMetadata,
      get body() { return new Blob([bytes]).stream(); },
      arrayBuffer: async () => bytes.slice().buffer,
      text: async () => new TextDecoder().decode(bytes),
      writeHttpMetadata(headers: Headers) {
        const map: Record<string, string> = { contentType: 'Content-Type', cacheControl: 'Cache-Control', contentDisposition: 'Content-Disposition', contentLanguage: 'Content-Language', contentEncoding: 'Content-Encoding' };
        for (const [name, value] of Object.entries(stored.httpMetadata)) if (map[name]) headers.set(map[name], value);
      },
    };
  }
  delete(key: string | string[]): Promise<void> {
    return Promise.all((Array.isArray(key) ? key : [key]).map(item => writeValue('binaries', item, undefined, true))).then(() => undefined);
  }
}

let initializing: Promise<void> | undefined;
export function initializeStorage(): Promise<void> {
  if (!initializing) initializing = (async () => {
    const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
    const saved = await readValue<Uint8Array>('database', DATABASE_KEY);
    const connection = new SQL.Database(saved ? new Uint8Array(saved) : undefined);
    const database = new LocalDatabase(SQL, connection);
    // Fail startup if this SQLite build cannot execute the original mirror's JSON upserts.
    const json = await database.prepare(`SELECT json_extract('{"ok":1}', '$.ok') AS ok`).first<{ ok: number }>();
    if (json?.ok !== 1) throw new Error('SQLite JSON support is required for the local mirror.');
    await database.exec(STORAGE_SCHEMA);
    env.BUCKET = new LocalBucket();
    env.DB = database;
  })().catch(error => { initializing = undefined; throw error; });
  return initializing;
}
