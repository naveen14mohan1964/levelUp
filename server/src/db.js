const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

// Two ways to reach SQL Server:
//   • Windows Authentication through ODBC (msnodesqlv8): the laptop setup, same as SSMS. Used when DB_USER isn't set.
//   • A SQL login (user + password) through tedious, pure JavaScript: used in Docker, where Windows auth doesn't exist.
const USE_SQL_LOGIN = !!process.env.DB_USER;
const sql = USE_SQL_LOGIN ? require('mssql') : require('mssql/msnodesqlv8');

const DRIVER = process.env.DB_DRIVER || 'ODBC Driver 17 for SQL Server';
const SERVER = process.env.DB_SERVER || 'localhost';
const DB_NAME = process.env.DB_NAME || 'DSATracker';

function connectionString(database) {
  // Windows Authentication (Trusted_Connection) — same as SSMS "Windows Authentication".
  return `Driver={${DRIVER}};Server=${SERVER};Database=${database};Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;`;
}

/** Pool settings for a database on the configured server, in whichever auth mode is active. */
function poolConfig(database) {
  if (!USE_SQL_LOGIN) return { connectionString: connectionString(database) };
  return {
    server: SERVER,
    port: Number(process.env.DB_PORT) || 1433,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    options: { encrypt: true, trustServerCertificate: true }, // the container's self-signed certificate
    pool: { max: 10 },
  };
}

let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(poolConfig(DB_NAME))
      .connect()
      .catch((err) => {
        poolPromise = null;
        throw err;
      });
  }
  return poolPromise;
}

/** Closes the shared pool; the next getPool() call opens a fresh one (used by tests). */
async function closePool() {
  if (!poolPromise) return;
  const p = poolPromise;
  poolPromise = null;
  await (await p).close();
}

module.exports = { sql, getPool, closePool, connectionString, poolConfig, DB_NAME, SERVER };
