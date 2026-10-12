// PM2 keeps the tracker running in the background on http://localhost:4000 (website + API in one process),
// restarts it if it crashes, and writes logs to tracker/logs. Started by `npm run app:start`.
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'levelup-tracker',
      cwd: path.join(__dirname, 'server'),
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: '4000', // overrides server/.env (dotenv never overwrites existing variables)
      },
      autorestart: true,
      exp_backoff_restart_delay: 2000, // e.g. if SQL Server isn't up yet after boot: retry 2s, 3s, 4.5s…
      max_restarts: 50,
      max_memory_restart: '500M',
      kill_timeout: 5000,
      out_file: path.join(__dirname, 'logs', 'app.log'),
      error_file: path.join(__dirname, 'logs', 'app-error.log'),
      time: true, // timestamp every log line
    },
  ],
};
