// Downloads the exercise demo frames used by server/src/exercise-guide.js into client/public/exercises/<id>/{0,1}.jpg,
// so the Workout page shows them offline. Source: free-exercise-db (public domain, Unlicense).
//   node scripts/fetch-exercise-demos.js
const fs = require('fs');
const path = require('path');
const { DEMO_IDS } = require('../server/src/exercise-guide');

const RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
const OUT = path.join(__dirname, '..', 'client', 'public', 'exercises');

(async () => {
  let fetched = 0;
  for (const id of DEMO_IDS) {
    for (const frame of [0, 1]) {
      const file = path.join(OUT, id, `${frame}.jpg`);
      if (fs.existsSync(file)) continue;
      const res = await fetch(`${RAW}/${encodeURIComponent(id)}/${frame}.jpg`);
      if (!res.ok) throw new Error(`${id}/${frame}.jpg: HTTP ${res.status}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      fetched++;
    }
  }
  console.log(`Exercise demos: ${DEMO_IDS.length} moves, ${fetched} new images in client/public/exercises`);
})().catch((e) => {
  console.error('Download failed:', e.message);
  process.exit(1);
});
