// Starts the tracker automatically when you log in to Windows (no admin rights needed):
// puts a tiny hidden-window script in your Startup folder that runs `npm run app:start`.
//   node scripts/autostart.js          -> install
//   node scripts/autostart.js --remove -> uninstall
const fs = require('fs');
const os = require('os');
const path = require('path');

if (process.platform !== 'win32') {
  console.error('Auto-start is set up for Windows only. On macOS/Linux use `npx pm2 startup` instead.');
  process.exit(1);
}

const startup = path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const target = path.join(startup, 'LevelUp-Tracker.vbs');
const tracker = path.resolve(__dirname, '..');

if (process.argv.includes('--remove')) {
  if (fs.existsSync(target)) fs.rmSync(target);
  console.log(`Removed ${target}. The app will no longer start at login (it keeps running until you run npm run app:stop or restart).`);
  process.exit(0);
}

// VBScript: run the command with a hidden window (0) and don't wait (False).
const cmd = `cmd /c cd /d "${tracker}" && npm run app:start >> "${path.join(tracker, 'logs', 'autostart.log')}" 2>&1`;
const vbs = [
  "' Level Up tracker: starts the app in the background at login. Remove with: npm run app:autostart:remove",
  'Set shell = CreateObject("WScript.Shell")',
  `shell.Run "${cmd.replace(/"/g, '""')}", 0, False`,
  '',
].join('\r\n');

fs.mkdirSync(path.join(tracker, 'logs'), { recursive: true });
fs.writeFileSync(target, vbs);
console.log(`Installed ${target}`);
console.log(`At every login the tracker starts on http://localhost:4000 (user: ${os.userInfo().username}).`);
