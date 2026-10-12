// Copies your data from the laptop's SQL Server (Windows auth) into the Docker SQL Server, all of it, exactly:
//   1. BACKUP ... WITH COPY_ONLY on the laptop (your local database is not changed), into a folder you own that the
//      SQL Server service account may write to (its own Backup folder isn't readable by your user)
//   2. copy the .bak into the db container
//   3. stop the app container, RESTORE over the container's database, start the app again
// Run from tracker/:  npm run docker:migrate     (the db container must be up: npm run docker:up)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BAK_IN_CONTAINER = '/tmp/levelup-migrate.bak';
const BAK_DIR = process.env.LEVELUP_BACKUP_DIR || path.join('C:', path.sep, 'Users', 'Public', 'LevelUp-migrate');

function composeEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) throw new Error('tracker/.env is missing: copy .env.docker.example to .env first');
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.DB_PASSWORD) throw new Error('DB_PASSWORD is missing in tracker/.env');
  return env;
}

const docker = (args, opts = {}) => execFileSync('docker', ['compose', ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });

function sqlcmd(query, password) {
  return docker(['exec', '-T', '-e', 'SQLCMDPASSWORD', 'db', '/opt/mssql-tools18/bin/sqlcmd', '-C', '-S', 'localhost', '-U', 'sa', '-b', '-h', '-1', '-W', '-s', '|', '-Q', query],
    { env: { ...process.env, SQLCMDPASSWORD: password } });
}

async function main() {
  const { DB_PASSWORD } = composeEnv();
  delete process.env.DB_USER; // the source is the laptop's SQL Server, through Windows authentication
  const { getPool, DB_NAME } = require('../server/src/db');

  console.log('1/4 Backing up the laptop database (copy-only, nothing changes there)…');
  const pool = await getPool();
  // let the SQL Server service account write into our folder (you own it, so no admin rights are needed)
  const account = (await pool.request().query("SELECT TOP 1 service_account AS a FROM sys.dm_server_services WHERE servicename LIKE 'SQL Server (%'")).recordset[0]?.a || 'NT SERVICE\MSSQLSERVER';
  fs.mkdirSync(BAK_DIR, { recursive: true });
  execFileSync('icacls', [BAK_DIR, '/grant', `${account}:(OI)(CI)M`], { stdio: 'ignore' });
  const bak = path.join(BAK_DIR, 'levelup-docker-migrate.bak');
  await pool.request().query(`BACKUP DATABASE [${DB_NAME}] TO DISK = N'${bak.replace(/'/g, "''")}' WITH COPY_ONLY, INIT, FORMAT`);
  await pool.close();
  const local = bak;

  console.log('2/4 Copying the backup into the db container…');
  docker(['cp', local, `db:${BAK_IN_CONTAINER}`]);
  docker(['exec', '-T', '-u', 'root', 'db', 'chmod', '644', BAK_IN_CONTAINER]);

  console.log('3/4 Restoring (the app container pauses for a moment)…');
  try { docker(['stop', 'app']); } catch { /* not running yet */ }
  const files = sqlcmd(`SET NOCOUNT ON; RESTORE FILELISTONLY FROM DISK = N'${BAK_IN_CONTAINER}'`, DB_PASSWORD)
    .split(/\r?\n/).map((l) => l.split('|')).filter((c) => c.length > 2 && (c[2] === 'D' || c[2] === 'L'));
  const data = files.find((c) => c[2] === 'D')?.[0];
  const log = files.find((c) => c[2] === 'L')?.[0];
  if (!data || !log) throw new Error('Could not read the file list from the backup');
  sqlcmd(`RESTORE DATABASE [${DB_NAME}] FROM DISK = N'${BAK_IN_CONTAINER}' WITH REPLACE, ` +
    `MOVE N'${data}' TO N'/var/opt/mssql/data/${DB_NAME}.mdf', MOVE N'${log}' TO N'/var/opt/mssql/data/${DB_NAME}_log.ldf'`, DB_PASSWORD);
  const counts = sqlcmd(`SET NOCOUNT ON; SELECT (SELECT COUNT(*) FROM [${DB_NAME}].dbo.problems WHERE status <> 'todo'), (SELECT COUNT(*) FROM [${DB_NAME}].dbo.meals), (SELECT COUNT(*) FROM [${DB_NAME}].dbo.li_posts)`, DB_PASSWORD).trim();
  docker(['exec', '-T', '-u', 'root', 'db', 'rm', '-f', BAK_IN_CONTAINER]);
  fs.rmSync(local, { force: true }); // the backup was only a transfer file

  console.log('4/4 Starting the app…');
  docker(['up', '-d', 'app']);
  const [solved, meals, posts] = counts.split('|');
  console.log(`Done. In Docker now: ${solved} solved problems, ${meals} meals, ${posts} LinkedIn posts (same as the laptop).`);
}

main().then(() => process.exit(0), (e) => { console.error(`Migration failed: ${e.stderr || e.message}`); process.exit(1); });
