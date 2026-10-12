// In-app LinkedIn connector: saves your developer-app keys to linkedin-mcp/.env (on this computer only) and runs the
// same OAuth login the MCP server uses, so you never need a terminal. Publishing still goes through the MCP server.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { MCP_PATH } = require('./mcp-client');

const MCP_DIR = path.join(path.dirname(MCP_PATH), '..');
const ENV_FILE = process.env.LINKEDIN_ENV_FILE || path.join(MCP_DIR, '.env');
const KEYS = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'];

function readEnvFile() {
  return fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
}
function envValue(text, key) {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

/** What's configured, without ever returning the secret. */
function keys() {
  const text = readEnvFile();
  const id = envValue(text, 'LINKEDIN_CLIENT_ID');
  // Same precedence as the login itself (process env, then the file), so the URL you register always matches.
  const port = Number(process.env.LINKEDIN_REDIRECT_PORT) || Number(envValue(text, 'LINKEDIN_REDIRECT_PORT')) || 3999;
  return {
    keysSet: !!id && !!envValue(text, 'LINKEDIN_CLIENT_SECRET'),
    clientIdHint: id ? `${id.slice(0, 4)}…${id.slice(-2)}` : null,
    redirectUri: `http://localhost:${port}/callback`,
  };
}

/** Writes the two keys into linkedin-mcp/.env, keeping every other line. */
function saveKeys(clientId, clientSecret) {
  if (!/^[A-Za-z0-9]{8,40}$/.test(clientId || '')) throw Object.assign(new Error('That Client ID looks wrong: copy it from your app\'s Auth tab (letters and numbers only).'), { status: 400 });
  if (!/^\S{10,200}$/.test(clientSecret || '')) throw Object.assign(new Error('That Client Secret looks wrong: use "Primary Client Secret" from the Auth tab (no spaces).'), { status: 400 });
  let text = readEnvFile() || '# LinkedIn developer app (https://www.linkedin.com/developers/apps): saved by Level Up\nLINKEDIN_REDIRECT_PORT=3999\n';
  for (const [k, v] of [['LINKEDIN_CLIENT_ID', clientId], ['LINKEDIN_CLIENT_SECRET', clientSecret]]) {
    text = new RegExp(`^${k}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`) : `${text.replace(/\n?$/, '\n')}${k}=${v}\n`;
  }
  fs.mkdirSync(path.dirname(ENV_FILE), { recursive: true });
  fs.writeFileSync(ENV_FILE, text, { mode: 0o600 });
  // The login below runs in this process: give it the new keys too.
  process.env.LINKEDIN_CLIENT_ID = clientId;
  process.env.LINKEDIN_CLIENT_SECRET = clientSecret;
}

let authPromise;
function auth() {
  // Load the keys from the file first, so the MCP's auth module sees them (it never overrides set variables).
  const text = readEnvFile();
  for (const k of [...KEYS, 'LINKEDIN_REDIRECT_PORT']) {
    const v = envValue(text, k);
    if (v && !process.env[k]) process.env[k] = v;
  }
  authPromise ||= import(pathToFileURL(path.join(MCP_DIR, 'src', 'auth.js')).href);
  return authPromise;
}

const login = { running: false, url: null, error: null, startedMs: null };

/** Session status straight from the token file the MCP server uses. */
async function status() {
  const a = await auth();
  const s = a.status();
  const tok = a.loadToken() || {};
  return {
    ...keys(),
    connected: !!s.connected,
    name: s.name || null,
    picture: tok.picture || null,
    connectedAt: tok.saved_at || null,
    daysLeft: s.connected ? s.days_left : null,
    expired: !!s.name && !s.connected,
    expiresAt: s.expires_at || null,
    login: { running: login.running, url: login.running ? login.url : null, error: login.error },
  };
}

/** Starts LinkedIn's sign-in; resolves with the consent URL to open (the login finishes in the background). */
async function startLogin() {
  if (!keys().keysSet) throw Object.assign(new Error('Add your app\'s Client ID and Secret first (step 4).'), { status: 400 });
  if (login.running && login.url) return login.url;
  const a = await auth();
  Object.assign(login, { running: true, url: null, error: null, startedMs: Date.now() });
  return new Promise((resolve, reject) => {
    a.login({ onUrl: (url) => { login.url = url; resolve(url); } })
      .then(() => { login.running = false; })
      .catch((e) => {
        Object.assign(login, { running: false, error: e.message });
        reject(Object.assign(e, { status: /missing|busy/i.test(e.message) ? 400 : 502 })); // ignored if the URL was already handed out
      });
  });
}

async function disconnect() {
  (await auth()).logout();
}

/** Requests from this computer only (keys and logins can't be changed from another device on your Wi-Fi). */
/**
 * "This laptop" only. Requests relayed by Tailscale Serve (your phone) carry forwarding headers, so they never count.
 * In Docker the laptop's browser reaches the app through the port published on 127.0.0.1, arriving from Docker's
 * private bridge network, so private addresses count there (nothing else can reach that port).
 */
function isLocal(req) {
  const h = req.headers || {};
  if (h['tailscale-user-login'] || h['x-forwarded-for']) return false;
  const ip = req.socket?.remoteAddress || '';
  if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return true;
  return process.env.LEVELUP_DOCKER === '1' && /^(::ffff:)?(10.|192.168.|172.(1[6-9]|2d|3[01]).)/.test(ip);
}

module.exports = { keys, saveKeys, status, startLogin, disconnect, isLocal, ENV_FILE };
