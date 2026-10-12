// Preloaded before ANY test file (node --require ./test/env.js), so no module can read the real
// database name first. Tests always run against DSATracker_Test and can never touch your real data.
process.env.DB_NAME = process.env.TEST_DB_NAME || 'DSATracker_Test';
process.env.TRACKER_TEST = '1';
