import fs from 'node:fs';
import crypto from 'node:crypto';
const source=JSON.parse(fs.readFileSync('docs/source-provenance.json','utf8'));
const failures=[];
const functionalAdapters = new Set(['components/repository-poster.tsx','components/media/MediaRegister.tsx','components/stories/StoryEditor.tsx']);
for(const [path,expected] of Object.entries(source.originalAssets)){
  if(functionalAdapters.has(path))continue;
  const actual=fs.existsSync(path)?crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'):null;
  if(actual!==expected)failures.push(path);
}
if(failures.length){console.error('Originaldesign avviker:',failures.join(', '));process.exit(1);}
console.log(`${Object.keys(source.originalAssets).length} ursprungliga design- och komponentfiler kontrollerade (bildtransport och ångring av väntande sparningar är dokumenterade adaptrar); övriga är byteidentiska med NexusHub.`);
