// QA screenshots. Usage:
//   node scripts/shoot.mjs <label> <route>[,<route>...] [--base=http://localhost:5199/] [--variants=all|quick] [--role=coo|fm] [--scope=<json>]
//     [--click=<css selector>[|<selector>...]] clicks each visible selector after load (e.g. open a top bar dropdown) before the shot
//     [--full=false] viewport only; [--suffix=<text>] added to the file name
// Example: node scripts/shoot.mjs scaffold signin,overview
// Starts `vite preview` on dist/ when --base is not given (run `npm run build` first).
// Output: qa/<label>/<route>-<theme>-<lang>-<width>.png, plus a summary of page errors, missing i18n keys
// and horizontal overflow. Tiles from external map servers are blocked (blank tiles are expected offline).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || 'true']; }));
const [label = 'shots', routeArg = 'signin,overview'] = args.filter((a) => !a.startsWith('--'));
const routes = routeArg.split(',').map((r) => r.replace(/^[#/]+/, ''));
const out = path.join(root, 'qa', label);
mkdirSync(out, { recursive: true });

const ALL = [
  { theme: 'dark', lang: 'en', w: 1440 }, { theme: 'light', lang: 'en', w: 1440 },
  { theme: 'dark', lang: 'ar', w: 1440 }, { theme: 'light', lang: 'ar', w: 1440 },
  { theme: 'dark', lang: 'en', w: 390 }, { theme: 'light', lang: 'en', w: 390 },
  { theme: 'dark', lang: 'ar', w: 390 }, { theme: 'light', lang: 'ar', w: 390 },
];
const QUICK = [ALL[0], ALL[3], ALL[4], ALL[7]];
const LIGHTEN = [ALL[1]];
const variants = flags.variants === 'quick' ? QUICK : flags.variants === 'lighten' ? LIGHTEN : ALL;
const role = flags.role === 'fm' ? 'fm' : 'coo';
const scope = flags.scope || '{"level":"all"}';
// Fixed clock (Riyadh 18:30 on 2026-10-22) so screenshots are comparable between runs; override with --now=<ms>.
const nowMs = flags.now || String(Date.UTC(2026, 9, 22, 15, 30));

function findChrome() {
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = [path.join(base, d, 'chrome-linux', 'chrome'), path.join(base, d, 'chrome-linux64', 'chrome')].find((x) => existsSync(x)) || '';
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
const errors = [];
try {
  for (const v of variants) {
    const tag = `${v.theme}-${v.lang}-${v.w}`;
    const ctx = await browser.newContext({ viewport: { width: v.w, height: v.w > 500 ? 900 : 844 }, deviceScaleFactor: 1 });
    await ctx.route(/arcgisonline|cartocdn|openstreetmap|tile\./, (r) => r.abort());
    await ctx.addInitScript(([t, l, ro, sc]) => {
      try {
        localStorage.setItem('gym.theme', t); localStorage.setItem('opt.lang', l); localStorage.setItem('opt.role', ro); localStorage.setItem('opt.scope', sc);
      } catch { /* ignore */ }
    }, [v.theme, v.lang, role, scope]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('console', (m) => {
      const x = m.text();
      if ((m.type() === 'error' && !x.includes('Failed to load resource') && !x.includes('ERR_FAILED')) || x.includes('[i18n]')) errors.push(`${tag}: ${x}`);
    });
    for (const route of routes) {
      if (route === 'signin') {
        await page.evaluate(() => { try { sessionStorage.removeItem('opt.auth'); } catch { /* ignore */ } }).catch(() => {});
      } else {
        await page.goto(`${base}?now=${nowMs}#/signin`, { waitUntil: 'load' });
        await page.evaluate(([ro]) => sessionStorage.setItem('opt.auth', JSON.stringify({ email: `${ro}@gymdemo.sa`, role: ro })), [role]);
      }
      // a distinct query string forces a full load, so the session and storage are read fresh
      await page.goto(`${base}?now=${nowMs}&r=${encodeURIComponent(route)}#/${route}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(Number(flags.wait || 1500));
      for (const sel of (flags.click ? flags.click.split('|') : [])) {
        const el = page.locator(sel).first();
        if (!(await el.isVisible().catch(() => false))) continue; // e.g. desktop-only control on a phone
        await el.click();
        await page.waitForTimeout(400);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) errors.push(`${route}/${tag}: horizontal overflow ${overflow}px`);
      const file = path.join(out, `${route.replace(/[/?=&]/g, '_')}${flags.suffix ? `-${flags.suffix}` : ''}-${tag}.png`);
      await page.screenshot({ path: file, fullPage: flags.full !== 'false' });
      console.log('shot', path.relative(root, file));
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
console.log(errors.length ? `\nISSUES (${errors.length}):\n${errors.join('\n')}` : '\nno page errors, no missing i18n keys, no horizontal overflow');
