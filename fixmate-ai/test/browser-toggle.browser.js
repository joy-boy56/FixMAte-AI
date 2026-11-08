/**
 * Browser verification for the Fast/Max mode toggle.
 *
 * Drives headless Chrome over the DevTools Protocol (no extra dependencies -
 * Node 24 provides a global WebSocket).
 *
 * Usage: node test/browser-toggle.test.js [baseUrl]
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const BASE_URL = process.argv[2] || 'http://localhost:3100';
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    require('node:http')
      .get(`http://127.0.0.1:9222${pathname}`, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(
        'Page error: ' +
          (res.exceptionDetails.exception?.description ||
            res.exceptionDetails.text)
      );
    }
    return res.result.value;
  }
}

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-chrome-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9222',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
    // Wait for the debugger endpoint
    let target = null;
    for (let i = 0; i < 50; i++) {
      try {
        const list = await getJson('/json/list');
        target = list.find((t) => t.type === 'page');
        if (target) break;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!target) throw new Error('Chrome debugger did not start');

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve);
      socket.addEventListener('error', reject);
    });
    const cdp = new CDP(socket);
    ws = socket;

    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    // Collect console errors
    const consoleErrors = [];
    socket.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        consoleErrors.push(
          msg.params.exceptionDetails?.exception?.description ||
            msg.params.exceptionDetails?.text
        );
      }
    });

    await cdp.send('Page.navigate', { url: BASE_URL });
    // Wait for the health fetch to populate the toggle
    await new Promise((r) => setTimeout(r, 3500));

    // --- 1. Toggle renders both modes from the server ---
    const btns = await cdp.eval(`
      Array.from(document.querySelectorAll('#mode-toggle .mode-btn')).map(b => ({
        mode: b.dataset.mode,
        label: b.textContent.trim(),
        active: b.classList.contains('active'),
        pressed: b.getAttribute('aria-pressed'),
        title: b.title
      }))
    `);
    check(
      'toggle renders a button per server-provided mode',
      Array.isArray(btns) && btns.length === 2,
      JSON.stringify(btns)
    );
    check(
      'buttons carry the Fast and Max labels',
      !!btns && btns.some((b) => b.label === 'Fast') && btns.some((b) => b.label === 'Max'),
      JSON.stringify(btns?.map((b) => b.label))
    );
    check(
      'exactly one button is active',
      !!btns && btns.filter((b) => b.active).length === 1,
      JSON.stringify(btns?.filter((b) => b.active))
    );
    check(
      'active button has aria-pressed=true',
      !!btns && btns.filter((b) => b.active).every((b) => b.pressed === 'true'),
      ''
    );
    check(
      'button tooltip shows the server model name (not hardcoded)',
      !!btns && btns.every((b) => b.title.includes('/')),
      JSON.stringify(btns?.map((b) => b.title))
    );

    // --- 2. Clicking Max switches the active mode and persists it ---
    await cdp.eval(`
      document.querySelector('#mode-toggle .mode-btn[data-mode="max"]').click();
      true
    `);
    await new Promise((r) => setTimeout(r, 300));

    const afterClick = await cdp.eval(`
      ({
        state: App.state.aiMode,
        stored: localStorage.getItem('aiMode'),
        activeMode: document.querySelector('#mode-toggle .mode-btn.active')?.dataset.mode,
        activePressed: document.querySelector('#mode-toggle .mode-btn.active')?.getAttribute('aria-pressed'),
        inactivePressed: document.querySelector('#mode-toggle .mode-btn:not(.active)')?.getAttribute('aria-pressed')
      })
    `);
    check('clicking Max sets App.state.aiMode', afterClick.state === 'max', JSON.stringify(afterClick));
    check('Max is persisted to localStorage', afterClick.stored === 'max', String(afterClick.stored));
    check('the Max button becomes active', afterClick.activeMode === 'max', String(afterClick.activeMode));
    check('active button aria-pressed=true, other=false',
      afterClick.activePressed === 'true' && afterClick.inactivePressed === 'false',
      JSON.stringify(afterClick));

    // --- 3. The mode survives a reload ---
    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 3500));
    const afterReload = await cdp.eval(`
      ({
        state: App.state.aiMode,
        stored: localStorage.getItem('aiMode'),
        activeMode: document.querySelector('#mode-toggle .mode-btn.active')?.dataset.mode
      })
    `);
    check('mode survives a page reload',
      afterReload.state === 'max' && afterReload.activeMode === 'max',
      JSON.stringify(afterReload));

    // --- 4. An unknown saved mode is corrected and re-persisted ---
    await cdp.eval(`localStorage.setItem('aiMode', 'constructor'); true`);
    await cdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 3500));
    const afterStale = await cdp.eval(`
      ({
        state: App.state.aiMode,
        stored: localStorage.getItem('aiMode'),
        activeMode: document.querySelector('#mode-toggle .mode-btn.active')?.dataset.mode
      })
    `);
    check('an unknown saved mode is corrected to the server default',
      afterStale.state === 'fast' && afterStale.activeMode === 'fast',
      JSON.stringify(afterStale));
    check('the corrected mode is written back to localStorage',
      afterStale.stored === 'fast',
      String(afterStale.stored));

    // --- 5. XSS: a hostile model name must not be parsed as HTML ---
    const xss = await cdp.eval(`
      (() => {
        App.state.aiModes = [{
          id: 'evil',
          label: '<img src=x onerror=window.__xss=1>Evil',
          model: 'x" onmouseover="window.__xss2=1',
          description: '"><script>window.__xss3=1<\\/script>'
        }];
        App.state.aiMode = 'evil';
        App.renderModeToggle();
        const btn = document.querySelector('#mode-toggle .mode-btn');
        return {
          html: document.getElementById('mode-toggle').innerHTML,
          text: btn.textContent,
          title: btn.title,
          imgTags: document.querySelectorAll('#mode-toggle img').length,
          scriptTags: document.querySelectorAll('#mode-toggle script').length,
          onmouseoverAttrs: btn.getAttribute('onmouseover'),
          xss: window.__xss || 0,
          xss2: window.__xss2 || 0,
          xss3: window.__xss3 || 0
        };
      })()
    `);
    check('a hostile model name creates no <img> element', xss.imgTags === 0, `imgTags=${xss.imgTags}`);
    check('a hostile label creates no <script> element', xss.scriptTags === 0, `scriptTags=${xss.scriptTags}`);
    check('a hostile model name creates no inline event handler',
      xss.onmouseoverAttrs === null, String(xss.onmouseoverAttrs));
    check('no injected handler executed', xss.xss === 0 && xss.xss2 === 0 && xss.xss3 === 0,
      JSON.stringify({ xss: xss.xss, xss2: xss.xss2, xss3: xss.xss3 }));
    check('the hostile label is rendered as literal text',
      xss.text.includes('<img') && xss.text.includes('Evil'),
      JSON.stringify(xss.text));
    check('the hostile model name is rendered as literal title text',
      xss.title.includes('onmouseover'),
      JSON.stringify(xss.title));
    check('the hostile model name is escaped in the serialized HTML',
      xss.html.includes('"') && !xss.html.includes('onmouseover="'),
      JSON.stringify(xss.html));

    // --- 6. No uncaught page errors ---
    check('no uncaught JavaScript errors on the page',
      consoleErrors.length === 0, JSON.stringify(consoleErrors));

    socket.close();
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    chrome.kill();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('FAILED:');
    for (const f of failed) console.log('  - ' + f.name + (f.detail ? ' :: ' + f.detail : ''));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Browser test crashed:', err);
  process.exitCode = 1;
});
