import { db, bucket } from '@/lib/store';
import { mirrorManifest } from '@/lib/mirror';
import { createReplicaReader } from '@/lib/replica-read.mjs';
import { durableGet } from './local-store';

/** Android-only read access. Never used for optimistic GitHub writes. */
export const replicaReader = createReplicaReader({
  // A newly announced tree is not readable until every blob is copied.
  manifest: async (repo: string) => {
    const [manifest, completed] = await Promise.all([
      mirrorManifest(repo), durableGet<{commit:string}>('replica-complete:v2:' + repo),
    ]);
    return manifest?.commit && completed?.commit === manifest.commit ? manifest : null;
  },
  record: async (repo: string, path: string, sha: string) =>
    db().prepare('SELECT blob_sha,object_key FROM mirror_versions WHERE repo=? AND path=? AND blob_sha=? ORDER BY verified_at DESC LIMIT 1')
      .bind(repo, path, sha).first<any>(),
  binary: async (key: string) => {
    const file = await bucket().get(key);
    return file ? file.arrayBuffer() : null;
  },
});
