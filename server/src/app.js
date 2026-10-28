// The Express app, without starting a server, so tests can run it on a random port against a test database.
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/api', require('./routes/plan'));
app.use('/api', require('./routes/projects'));
app.use('/api', require('./routes/schedule'));
app.use('/api', require('./routes/settings').router);
app.use('/api', require('./routes/problems'));
app.use('/api', require('./routes/leetcode'));
app.use('/api', require('./routes/mentor'));
app.use('/api', require('./routes/linkedin'));
app.use('/api', require('./routes/linkedin-outreach').router);
app.use('/api', require('./routes/telegram'));
app.use('/api', require('./routes/referrals').router);
app.use('/api', require('./routes/ai').router);
app.use('/api', require('./routes/learn').router);
app.use('/api', require('./routes/game').router);
app.use('/api', require('./routes/checkin').router); // the Mentor: daily check-ins
app.use('/api', require('./routes/cards').router); // flashcards (spaced repetition)
app.use('/api', require('./routes/report').router); // the weekly report
app.use('/api', require('./routes/system').router); // focus guard: Faaah alarm volume (local only)
app.use('/api', require('./routes/assignments').router); // course assignments explained (content is local-only)
app.use('/api', require('./routes/mastery').router); // pattern mastery, company readiness, system design drills
app.use('/api', require('./routes/neurosprint').router); // 5-phase interactive neuro-learning sprint engine
app.use('/api', require('./routes/dev').router); // dev-only (npm run dev): reset/restore AI + game progress
const workout = require('./routes/workout');
app.use('/api', workout.router);

// Meal + progress photos (stored locally in server/uploads)
app.use('/uploads', express.static(workout.UPLOADS, { maxAge: '7d' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'Photo is too large (max 12 MB)' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  console.error(err);
  res.status(500).json({ error: err.message });
});

// Serve the built React app (npm run build) so a single process runs everything.
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  // index.html is never cached, so a rebuild (npm run app:update) shows on the next reload; hashed assets cache normally.
  // A missing built file (e.g. an old hashed chunk asked for by a tab opened before the rebuild) is a 404, not the page.
  app.get(/^\/(assets|mediapipe|icons)\//, (req, res) => res.status(404).type('text/plain').send('Not found (the app was updated: reload the page)'));
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => res.set('Cache-Control', 'no-store').sendFile(path.join(dist, 'index.html')));
}

module.exports = app;
