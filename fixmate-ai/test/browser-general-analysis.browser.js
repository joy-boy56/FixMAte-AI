/**
 * Browser verification that AI-produced general analysis is rendered as
 * text, never as HTML.
 *
 * Usage: node test/browser-general-analysis.test.js [baseUrl]
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
      .get(`http://127.0.0.1:9223${pathname}`, (res) => {
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

async function main() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-chrome-ga-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9223',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws = null;
  try {
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

    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    const send = (method, params = {}) => {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        socket.send(JSON.stringify({ id: msgId, method, params }));
        setTimeout(() => {
          if (pending.has(msgId)) {
            pending.delete(msgId);
            reject(new Error('CDP timeout: ' + method));
          }
        }, 30000);
      });
    };
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', {
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
    };

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: BASE_URL });
    await new Promise((r) => setTimeout(r, 3000));

    // Feed a hostile general analysis through the real renderer.
    const result = await evaluate(`
      (() => {
        const hostile = {
          summary: '<img src=x onerror=window.__gaXss=1>summary',
          patterns: [{
            pattern: '<img src=x onerror=window.__gaXss2=1>',
            description: '"><script>window.__gaXss3=1<\\/script>',
            affectedFiles: ['<img src=x onerror=window.__gaXss4=1>.js'],
            severity: '<img src=x onerror=window.__gaXss5=1>'
          }],
          priorities: [{
            file: '<img src=x onerror=window.__gaXss6=1>.js',
            line: '<img src=x onerror=window.__gaXss7=1>',
            diagnostic: '<img src=x onerror=window.__gaXss8=1>',
            priority: '<img src=x onerror=window.__gaXss9=1>',
            reason: '<img src=x onerror=window.__gaXss10=1>'
          }],
          quickWins: [{
            file: '<img src=x onerror=window.__gaXss11=1>.js',
            line: '<img src=x onerror=window.__gaXss12=1>',
            fix: '<img src=x onerror=window.__gaXss13=1>',
            effort: '<img src=x onerror=window.__gaXss14=1>'
          }],
          normalFixes: [{
            file: '<img src=x onerror=window.__gaXss15=1>.js',
            line: '<img src=x onerror=window.__gaXss16=1>',
            issue: '<img src=x onerror=window.__gaXss17=1>',
            fix: '<img src=x onerror=window.__gaXss18=1>',
            effort: '<img src=x onerror=window.__gaXss19=1>',
            explanation: '<img src=x onerror=window.__gaXss20=1>'
          }]
        };

        Explanation.state.files = [];
        Explanation.addGeneralAnalysisMessage(hostile);

        const container = document.querySelector('.general-analysis-message');
        const flags = [];
        for (let i = 1; i <= 20; i++) {
          flags.push(window['__gaXss' + i] || 0);
        }
        return {
          rendered: !!container,
          imgTags: container ? container.querySelectorAll('img').length : -1,
          scriptTags: container ? container.querySelectorAll('script').length : -1,
          flags,
          text: container ? container.textContent : ''
        };
      })()
    `);

    check('the general analysis was rendered', result.rendered === true, '');
    check('no <img> element was created from AI output',
      result.imgTags === 0, `imgTags=${result.imgTags}`);
    check('no <script> element was created from AI output',
      result.scriptTags === 0, `scriptTags=${result.scriptTags}`);
    check('no injected handler executed',
      result.flags.every((f) => f === 0), JSON.stringify(result.flags));
    check('the hostile payload is visible as literal text',
      result.text.includes('<img src=x onerror='),
      JSON.stringify(result.text.slice(0, 160)));

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
