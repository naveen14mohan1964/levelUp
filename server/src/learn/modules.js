// Self-paced learning modules (system design): each is a roadmap file server/data/<key>-roadmap.json
// with levels → lessons { id, title, minutes, learn, links: [[label, url]], build, check }. Progress: dbo.learn_progress.
// Adding a module = add a roadmap file + one line here (+ an area in client/src/areas.js).
const fs = require('fs');
const path = require('path');

const load = (key) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', `${key}-roadmap.json`), 'utf8'));

const MODULES = {
  lld: { key: 'lld', label: 'LLD', title: 'Low-level design', roadmap: load('lld') },
  hld: { key: 'hld', label: 'HLD', title: 'High-level design', roadmap: load('hld') },
  judge: { key: 'judge', label: 'Judgement', title: 'Engineering judgement & domain expertise', roadmap: load('judge') },
};

module.exports = { MODULES };
