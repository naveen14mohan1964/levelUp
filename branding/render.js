// Renders the SVG logos to PNG with Edge (headless). Run: node branding/render.js
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'server', 'node_modules', 'playwright-core'));
const dir = __dirname;
const jobs = [
  ['level-up-mark.svg', 'level-up-mark-400.png', 400, 400, 'transparent'], // LinkedIn Page + developer app logo
  ['level-up-mark.svg', 'level-up-mark-1024.png', 1024, 1024, 'transparent'],
  ['level-up-mark.svg', 'favicon-64.png', 64, 64, 'transparent'],
  ['level-up-mark.svg', 'apple-touch-icon.png', 180, 180, '#0B1220'], // iPhone home-screen icon
  ['level-up-logo.svg', 'level-up-logo-1200x320.png', 1200, 320, '#0B1220'],
  ['level-up-logo-light.svg', 'level-up-logo-on-white.png', 1200, 320, '#FFFFFF'],
  ['linkedin-cover.svg', 'linkedin-cover-1128x191.png', 1128, 191, '#0A1222'], // LinkedIn Page cover image
];
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [src, out, w, h, bg] of jobs) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const svg = fs.readFileSync(path.join(dir, src), 'utf8');
    await page.setContent(`<html><body style="margin:0;background:${bg}">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`);
    await page.screenshot({ path: path.join(dir, out), omitBackground: bg === 'transparent' });
    await page.close();
    console.log('wrote', out);
  }
  await browser.close();
})();
