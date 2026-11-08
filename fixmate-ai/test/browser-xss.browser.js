/**
 * Browser regression tests for the XSS fixes.
 *
 * Covers the two vectors that the earlier browser tests missed:
 *   1. Attribute-position payloads (`"` breaking out of a data-* attribute)
 *   2. Raw AI output flowing through formatMessageText / addAIMessage
 *
 * Usage: node test/browser-xss.browser.js [baseUrl]
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
      .get(`http://127.0.0.1:9224${pathname}`, (res) => {
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
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fx-chrome-xss-'));
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9224',
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

    // ---------------------------------------------------------------------
    // 1. Attribute-position payloads in the general analysis
    // ---------------------------------------------------------------------
    const attr = await evaluate(`
      (() => {
        const hostile = {
          summary: 'summary',
          patterns: [],
          priorities: [{
            file: 'x" onmouseover="window.__attrXss=1',
            line: 'y" onfocus="window.__attrXss2=1',
            diagnostic: 'z" onclick="window.__attrXss3=1',
            priority: 'critical',
            reason: 'reason'
          }],
          quickWins: [],
          normalFixes: [{
            file: 'a" onmouseover="window.__attrXss4=1',
            line: 'b" onmouseover="window.__attrXss5=1',
            issue: 'c" onmouseover="window.__attrXss6=1',
            fix: 'fix',
            effort: 'low',
            explanation: 'explanation'
          }]
        };

        Explanation.state.files = [];
        Explanation.addGeneralAnalysisMessage(hostile);

        const container = document.querySelector('.general-analysis-message');
        const nodes = container.querySelectorAll('[data-file], [data-line], [data-diagnostic]');
        const ALLOWED = new Set(['style', 'class', 'data-file', 'data-line', 'data-diagnostic']);
        const injectedAttrs = [];
        for (const n of nodes) {
          for (const a of n.attributes) {
            if (!ALLOWED.has(a.name)) {
              injectedAttrs.push(a.name);
            }
          }
        }
        return {
          rendered: !!container,
          nodeCount: nodes.length,
          injectedAttrs,
          eventHandlerAttrs: Array.from(container.querySelectorAll('*')).flatMap((n) =>
            Array.from(n.attributes)
              .filter((a) => a.name.toLowerCase().startsWith('on'))
              .map((a) => a.name)
          ),
          flags: [
            window.__attrXss || 0, window.__attrXss2 || 0, window.__attrXss3 || 0,
            window.__attrXss4 || 0, window.__attrXss5 || 0, window.__attrXss6 || 0
          ],
          firstDataFile: nodes[0]?.getAttribute('data-file'),
          firstDataFileDom: nodes[0]?.dataset.file
        };
      })()
    `);

    check('the general analysis was rendered', attr.rendered === true, '');
    check('attribute-position values produced elements', attr.nodeCount >= 2, `nodes=${attr.nodeCount}`);
    check('no extra attributes were injected',
      attr.injectedAttrs.length === 0, JSON.stringify(attr.injectedAttrs));
    check('no on* event handler attribute exists anywhere in the analysis',
      attr.eventHandlerAttrs.length === 0, JSON.stringify(attr.eventHandlerAttrs));
    check('no injected handler executed',
      attr.flags.every((f) => f === 0), JSON.stringify(attr.flags));
    check('the hostile file name survives as the attribute VALUE',
      attr.firstDataFile === 'x" onmouseover="window.__attrXss=1',
      JSON.stringify(attr.firstDataFile));
    check('dataset.file round-trips to the original value',
      attr.firstDataFileDom === 'x" onmouseover="window.__attrXss=1',
      JSON.stringify(attr.firstDataFileDom));

    // ---------------------------------------------------------------------
    // 2. Raw AI output through addAIMessage / formatMessageText
    // ---------------------------------------------------------------------
    const msg = await evaluate(`
      (() => {
        const payload = '<img src=x onerror="window.__rawXss=1">';
        Explanation.addAIMessage(payload);
        const nodes = document.querySelectorAll('.chat-message.ai-message .message-text');
        const last = nodes[nodes.length - 1];
        return {
          imgTags: document.querySelectorAll('.chat-message.ai-message .message-text img').length,
          lastText: last ? last.textContent : null,
          lastHtml: last ? last.innerHTML : null
        };
      })()
    `);
    // The payload is only exploitable once the browser has tried to load the
    // broken image, so wait for that to happen.
    await new Promise((r) => setTimeout(r, 800));
    const rawFlag = await evaluate('window.__rawXss || 0');

    check('the AI message was rendered', msg.lastText !== null, '');
    check('no <img> element was created from AI output',
      msg.imgTags === 0, `imgTags=${msg.imgTags}`);
    check('the AI payload is shown as literal text',
      !!msg.lastText && msg.lastText.includes('<img src=x onerror='),
      JSON.stringify(msg.lastText));
    check('the AI payload is escaped in the serialized HTML',
      !!msg.lastHtml && !msg.lastHtml.includes('<img'),
      JSON.stringify(msg.lastHtml));
    check('no injected handler executed', rawFlag === 0, String(rawFlag));

    // ---------------------------------------------------------------------
    // 3. Bold markdown still works after the escape-first change
    // ---------------------------------------------------------------------
    const md = await evaluate(`
      (() => {
        Explanation.addAIMessage('normal **bold** text');
        const nodes = document.querySelectorAll('.chat-message.ai-message .message-text');
        const last = nodes[nodes.length - 1];
        return {
          strongTags: last ? last.querySelectorAll('strong').length : -1,
          text: last ? last.textContent : null
        };
      })()
    `);
    check('markdown bold is still rendered',
      md.strongTags === 1, `strongTags=${md.strongTags}`);
    check('the bold text is intact', md.text === 'normal bold text', JSON.stringify(md.text));

    // ---------------------------------------------------------------------
    // 4. Newlines still render as line breaks
    // ---------------------------------------------------------------------
    const nl = await evaluate(`
      (() => {
        Explanation.addAIMessage('line one\\nline two');
        const nodes = document.querySelectorAll('.chat-message.ai-message .message-text');
        const last = nodes[nodes.length - 1];
        return { brTags: last ? last.querySelectorAll('br').length : -1 };
      })()
    `);
    check('newlines still render as <br>', nl.brTags === 1, `brTags=${nl.brTags}`);

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
