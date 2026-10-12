// Test harness: every test file runs the real app against a SEPARATE database (DSATracker_Test),
// reset to a fresh copy of the plan, so your real progress in DSATracker is never touched.
process.env.DB_NAME = process.env.TEST_DB_NAME || 'DSATracker_Test';

const { setupDatabase } = require('../src/setup-db');
const { getPool, closePool } = require('../src/db');

let server;
let base;

const TEST_DB = process.env.TEST_DB_NAME || 'DSATracker_Test';

async function startServer() {
  // Hard stop: if any module loaded the real DB name before this file ran, refuse to reset anything.
  const { DB_NAME } = require('../src/db');
  if (DB_NAME !== TEST_DB) {
    throw new Error(`Refusing to run tests: connected to "${DB_NAME}", expected "${TEST_DB}". Run tests with npm test (it preloads test/env.js).`);
  }
  await setupDatabase({ reset: true, quiet: true, expectDb: TEST_DB });
  const app = require('../src/app');
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}

async function stopServer() {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  server = null;
  await closePool();
}

/** JSON request helper: returns { status, body }. */
async function api(method, path, body) {
  const isForm = body instanceof FormData;
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function sqlQuery(query) {
  const pool = await getPool();
  return (await pool.request().query(query)).recordset;
}

module.exports = { startServer, stopServer, api, sqlQuery, getBase: () => base };
