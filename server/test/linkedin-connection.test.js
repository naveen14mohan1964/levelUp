// In-app LinkedIn connector. Uses a temporary .env and token file, so your real keys/login are never touched.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'li-conn-'));
process.env.LINKEDIN_ENV_FILE = path.join(tmp, '.env');
process.env.LINKEDIN_TOKEN_FILE = path.join(tmp, 'token.json');
process.env.LINKEDIN_REDIRECT_PORT = '39871';
delete process.env.LINKEDIN_CLIENT_ID;
delete process.env.LINKEDIN_CLIENT_SECRET;

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api } = require('./helpers');
const conn = require('../src/linkedin/connection');

describe('LinkedIn connector', () => {
  before(startServer);
  after(async () => { await stopServer(); fs.rmSync(tmp, { recursive: true, force: true }); });

  test('starts not connected and without keys', async () => {
    const s = (await api('GET', '/linkedin/connection')).body;
    assert.deepEqual([s.keysSet, s.connected, s.local, s.redirectUri], [false, false, true, 'http://localhost:39871/callback']);
    assert.equal((await api('POST', '/linkedin/connection/connect')).status, 400, 'needs keys first');
  });

  test('keys are validated, saved to the .env file, and the secret is never returned', async () => {
    assert.equal((await api('PUT', '/linkedin/connection/keys', { client_id: 'bad id!', client_secret: 'x'.repeat(20) })).status, 400);
    assert.equal((await api('PUT', '/linkedin/connection/keys', { client_id: '86abcdefgh1234', client_secret: 'short' })).status, 400);
    fs.writeFileSync(process.env.LINKEDIN_ENV_FILE, '# keep me\nLINKEDIN_REDIRECT_PORT=39871\nLINKEDIN_VERSION=202609\n');
    const r = await api('PUT', '/linkedin/connection/keys', { client_id: '86abcdefgh1234', client_secret: 'WPL_AP1.supersecretvalue==' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.keysSet, r.body.clientIdHint], [true, '86ab…34']);
    assert.doesNotMatch(JSON.stringify(r.body), /supersecret/);
    const file = fs.readFileSync(process.env.LINKEDIN_ENV_FILE, 'utf8');
    assert.match(file, /^LINKEDIN_CLIENT_ID=86abcdefgh1234$/m);
    assert.match(file, /^LINKEDIN_CLIENT_SECRET=WPL_AP1\.supersecretvalue==$/m);
    assert.match(file, /# keep me[\s\S]*LINKEDIN_VERSION=202609/, 'other lines are kept');
    // Saving again replaces, not duplicates.
    await api('PUT', '/linkedin/connection/keys', { client_id: '86abcdefgh9999', client_secret: 'WPL_AP1.another==' });
    assert.equal((fs.readFileSync(process.env.LINKEDIN_ENV_FILE, 'utf8').match(/LINKEDIN_CLIENT_ID=/g) || []).length, 1);
  });

  test('connect hands back LinkedIn\'s approval URL; a bad callback is refused and reported', async () => {
    const r = await api('POST', '/linkedin/connection/connect');
    assert.equal(r.status, 200);
    const url = new URL(r.body.url);
    assert.equal(url.origin + url.pathname, 'https://www.linkedin.com/oauth/v2/authorization');
    assert.equal(url.searchParams.get('client_id'), '86abcdefgh9999');
    assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:39871/callback');
    assert.equal(url.searchParams.get('scope'), 'openid profile w_member_social');
    assert.equal((await api('GET', '/linkedin/connection')).body.login.running, true);
    // Someone else's redirect (wrong state) must not log you in.
    const cb = await fetch('http://localhost:39871/callback?code=abc&state=forged');
    assert.equal(cb.status, 400);
    await new Promise((res) => setTimeout(res, 100));
    const s = (await api('GET', '/linkedin/connection')).body;
    assert.deepEqual([s.connected, s.login.running], [false, false]);
    assert.match(s.login.error, /state mismatch/);
  });

  test('a saved login shows as connected with days left; disconnect removes it', async () => {
    fs.writeFileSync(process.env.LINKEDIN_TOKEN_FILE, JSON.stringify({ access_token: 't', expires_at: Date.now() + 5 * 86400000 + 60000, name: 'Test User', person_urn: 'urn:li:person:x' }));
    const s = (await api('GET', '/linkedin/connection')).body;
    assert.deepEqual([s.connected, s.name, s.daysLeft], [true, 'Test User', 5]);
    const d = (await api('POST', '/linkedin/connection/disconnect')).body;
    assert.equal(d.connected, false);
    assert.equal(fs.existsSync(process.env.LINKEDIN_TOKEN_FILE), false);
  });

  test('Connector tab: account + network counts + sync history + "stale export" reminder', async () => {
    let c = (await api('GET', '/linkedin/connector')).body;
    assert.deepEqual([c.connection.connected, c.network.contacts, c.network.lastImport, c.network.stale, c.history.length], [false, 0, null, true, 0]);
    const csv = ['First Name,Last Name,URL,Email Address,Company,Position,Connected On',
      'Asha,Rao,https://www.linkedin.com/in/asha-rao,,Google,Engineering Manager,12 Mar 2025',
      'Ravi,Iyer,https://www.linkedin.com/in/ravi-iyer,,Some Startup,Developer,01 Jan 2024'].join('\n');
    await api('POST', '/referrals/import', { csv, file_name: 'Connections.csv' });
    c = (await api('GET', '/linkedin/connector')).body;
    assert.deepEqual([c.network.contacts, c.network.connected, c.network.atTargets, c.network.companiesCovered], [2, 2, 1, 1]);
    assert.deepEqual([c.network.daysSinceImport, c.network.stale, c.history[0].added, c.history[0].file_name], [0, false, 2, 'Connections.csv']);
  });

  test('only requests from this computer can change keys or log in', () => {
    assert.equal(conn.isLocal({ socket: { remoteAddress: '127.0.0.1' } }), true);
    assert.equal(conn.isLocal({ socket: { remoteAddress: '::ffff:127.0.0.1' } }), true);
    assert.equal(conn.isLocal({ socket: { remoteAddress: '192.168.1.23' } }), false);
    assert.equal(conn.isLocal({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '100.101.1.2' } }), false, 'relayed (Tailscale Serve) = your phone');
    process.env.LEVELUP_DOCKER = '1';
    try {
      assert.equal(conn.isLocal({ socket: { remoteAddress: '172.18.0.1' }, headers: {} }), true, 'Docker: the laptop via the 127.0.0.1-published port');
      assert.equal(conn.isLocal({ socket: { remoteAddress: '172.18.0.4' }, headers: { 'tailscale-user-login': 'me@x' } }), false);
    } finally { delete process.env.LEVELUP_DOCKER; }
  });
});
