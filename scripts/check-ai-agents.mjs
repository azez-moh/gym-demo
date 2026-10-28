// Wall-screen check for the AI Agents page: no page scroll and no inner scrollbars.
// Usage: node scripts/check-ai-agents.mjs [--base=http://localhost:5199/] [--now=<ms>] [--out=qa/ai-agents-wall]
//   [--route=vision-overview] checks the AI Vision overview (wall selector .vo-wall) instead of AI Agents.
// Signs in with the Sign in button (COO and Facility Manager), opens #/ai-agents at 1920x1080, 1680x1050,
// 1536x864 and 1440x900 in EN dark and AR light, asserts the layout fits and saves a screenshot of each.
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? 'true']; }));
const ROUTE = flags.route || 'ai-agents';
const WALL = ROUTE === 'vision-overview' ? '.vo-wall' : '.ag-wall';
const out = path.resolve(root, flags.out || `qa/${ROUTE}-wall`);
mkdirSync(out, { recursive: true });
// Riyadh 18:30 on 2026-10-22 by default; pass --now to test other times (e.g. just after midnight).
const nowMs = flags.now || String(Date.UTC(2026, 9, 22, 15, 30));

// --sizes=1100x800,390x844 checks narrower screens too: there the page may scroll (not a wall screen), inner lists still may not.
const SIZES = flags.sizes ? flags.sizes.split(',').map((x) => x.split('x').map(Number)) : [[1920, 1080], [1680, 1050], [1536, 864], [1440, 900]];
const VARIANTS = [{ theme: 'dark', lang: 'en' }, { theme: 'light', lang: 'ar' }];
const ROLES = (flags.roles || 'coo,fm').split(',');

function findChrome() {
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  return undefined;
}

let server;
let base = flags.base;
if (!base) {
  const port = 5199;
  server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  base = `http://localhost:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(base); if (r.ok) break; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({ executablePath: findChrome() });
const failures = [];
try {
  for (const role of ROLES) {
    for (const v of VARIANTS) {
      for (const [w, h] of SIZES) {
        const tag = `${role}-${v.theme}-${v.lang}-${w}x${h}`;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
        await ctx.route(/arcgisonline|cartocdn|openstreetmap|tile\./, (r) => r.abort());
        await ctx.addInitScript(([t, l]) => {
          try { localStorage.setItem('opt.theme', t); localStorage.setItem('opt.lang', l); } catch { /* ignore */ }
        }, [v.theme, v.lang]);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => failures.push(`${tag}: page error ${e.message}`));
        await page.goto(`${base}?now=${nowMs}#/signin`, { waitUntil: 'load' });
        await page.locator('.rolepick__opt').nth(role === 'fm' ? 1 : 0).click();
        await page.locator('.signin__submit').click();
        await page.waitForURL(/#\/(map|overview|branch)/);
        await page.goto(`${base}?now=${nowMs}#/${ROUTE}`, { waitUntil: 'load' });
        await page.waitForSelector(WALL);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1500);
        const r = await page.evaluate(() => {
          const se = document.scrollingElement;
          const inner = [];
          for (const el of document.querySelectorAll('*')) {
            const cs = getComputedStyle(el);
            const scrolls = /(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX);
            if (!scrolls) continue;
            const box = el.getBoundingClientRect();
            if (box.right <= 0 || box.left >= window.innerWidth) continue; // closed menu drawer, off screen
            if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
              inner.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} ${el.scrollHeight}/${el.clientHeight}`);
            }
          }
          return { sh: se.scrollHeight, ih: window.innerHeight, sw: se.scrollWidth, iw: window.innerWidth, inner };
        });
        if (w >= 1200 && r.sh > r.ih + 1) failures.push(`${tag}: page scrolls ${r.sh} > ${r.ih}`);
        if (r.sw > r.iw + 1) failures.push(`${tag}: horizontal overflow ${r.sw} > ${r.iw}`);
        for (const x of r.inner) failures.push(`${tag}: inner scroll ${x}`);
        const file = path.join(out, `${ROUTE}-${tag}.png`);
        await page.screenshot({ path: file, fullPage: w < 1200 });
        console.log(`${(w < 1200 || r.sh <= r.ih + 1) && !r.inner.length ? 'ok  ' : 'FAIL'} ${path.relative(root, file)}`);
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
console.log(failures.length ? `\nFAILURES (${failures.length}):\n${failures.join('\n')}` : '\nAll sizes fit in one view, no inner scrollbars.');
process.exitCode = failures.length ? 1 : 0;
