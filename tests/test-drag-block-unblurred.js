'use strict';

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

async function testDragBlockUnblurred() {
  console.log('🧪 Testing that dragging a schedule block leaves the grid completely unblurred...');
  const port = 9253;
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    'about:blank'
  ]);
  await new Promise(r => setTimeout(r, 1200));

  const listRes = await new Promise(r => {
    http.get(`http://127.0.0.1:${port}/json/version`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => r(JSON.parse(data)));
    });
  });

  const ws = new WebSocket(listRes.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let bMsgId = 1;
  const bPending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && bPending.has(msg.id)) {
      const { resolve, reject } = bPending.get(msg.id);
      bPending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  const target = await (new Promise((resolve, reject) => {
    const id = bMsgId++;
    bPending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Target.createTarget', params: { url: 'about:blank' } }));
  }));

  const pWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${target.targetId}`);
  await new Promise(r => pWs.onopen = r);

  let pMsgId = 1;
  const pPending = new Map();
  pWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pPending.has(msg.id)) {
      const { resolve, reject } = pPending.get(msg.id);
      pPending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = pMsgId++;
      pPending.set(id, { resolve, reject });
      pWs.send(JSON.stringify({ id, method, params }));
    });
  }

  try {
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        const userObj = { role: 'IT Department Head', name: 'Admin Test', email: 'ithead@test.com' };
        localStorage.setItem('user', JSON.stringify(userObj));
        localStorage.setItem('labsync_last_activity', Date.now().toString());
        sessionStorage.setItem('labsync_user', JSON.stringify(userObj));
        window.fetch = async (url) => {
          if (url.includes('/api/user/current')) return new Response(JSON.stringify({ user: userObj }));
          if (url.includes('/api/schedules/room/')) return new Response(JSON.stringify([]));
          return new Response(JSON.stringify({}));
        };
      `
    });

    await send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    await send('Page.navigate', { url: 'http://localhost:3000/room-schedule-editor.html?room=204' });
    await new Promise(r => setTimeout(r, 2200));

    // 1. Create a sample block in the tray so we have a block to drag
    const createRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const container = document.getElementById('blocks-container');
          if (!container) return { success: false, reason: 'no container' };
          
          const block = window.convertToTrayBlock('CAP 401W - Capstone Project', 'Andrei Gabito', '2C-2');
          container.appendChild(block);
          window.mobileScheduleEditor.openSheet('blocks');
          return {
            success: true,
            blockId: block.id,
            count: container.children.length
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Block created in tray & sheet opened:', createRes.result.value);

    // Give sheet animation a moment
    await new Promise(r => setTimeout(r, 400));

    // 2. Check state while sheet is open (backdrop active)
    const beforeDrag = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const backdrop = document.getElementById('mobile-sheet-backdrop');
          const panel = document.getElementById('create-block-panel');
          const style = window.getComputedStyle(backdrop);
          return {
            backdropActive: backdrop.classList.contains('active'),
            backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
            backdropOpacity: style.opacity,
            panelOpen: panel.classList.contains('mobile-sheet-open')
          };
        })()
      `,
      returnByValue: true
    });
    console.log('State before drag (sheet open):', beforeDrag.result.value);
    assert.strictEqual(beforeDrag.result.value.backdropActive, true, 'Backdrop should be active when sheet is open');

    // 3. Simulate touch drag on the block
    const dragRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          try {
            const block = document.querySelector('#blocks-container .schedule-block');
            if (!block) return { success: false, reason: 'no block' };

            const rect = block.getBoundingClientRect();
            const touchStartX = rect.left + rect.width / 2;
            const touchStartY = rect.top + rect.height / 2;

            // Dispatch touchstart
            const touchObj = new Touch({
              identifier: Date.now(),
              target: block,
              clientX: touchStartX,
              clientY: touchStartY,
              pageX: touchStartX,
              pageY: touchStartY,
              screenX: touchStartX,
              screenY: touchStartY
            });

            const touchEvent = new TouchEvent('touchstart', {
              cancelable: true,
              bubbles: true,
              touches: [touchObj],
              targetTouches: [touchObj],
              changedTouches: [touchObj]
            });
            block.dispatchEvent(touchEvent);

            // Move finger up onto the schedule grid (e.g. clientY = 220)
            const moveTouchObj = new Touch({
              identifier: Date.now(),
              target: block,
              clientX: 200,
              clientY: 220,
              pageX: 200,
              pageY: 220,
              screenX: 200,
              screenY: 220
            });

            const moveEvent = new TouchEvent('touchmove', {
              cancelable: true,
              bubbles: true,
              touches: [moveTouchObj],
              targetTouches: [moveTouchObj],
              changedTouches: [moveTouchObj]
            });
            document.dispatchEvent(moveEvent);

            const backdrop = document.getElementById('mobile-sheet-backdrop');
            const backdropStyle = window.getComputedStyle(backdrop);
            const panel = document.getElementById('create-block-panel');
            const ghost = document.querySelector('.touch-drag-ghost');
            const grid = document.getElementById('schedule-grid');
            const gridStyle = grid ? window.getComputedStyle(grid) : {};

            return {
              success: true,
              bodyDraggingActive: document.body.classList.contains('dragging-active'),
              backdropActive: backdrop.classList.contains('active'),
              backdropDisplay: backdropStyle.display,
              backdropOpacity: backdropStyle.opacity,
              backdropFilter: backdropStyle.backdropFilter || backdropStyle.webkitBackdropFilter,
              backdropPointerEvents: backdropStyle.pointerEvents,
              hasGhost: !!ghost,
              ghostZIndex: ghost ? window.getComputedStyle(ghost).zIndex : null,
              gridFilter: gridStyle.filter || gridStyle.backdropFilter || 'none'
            };
          } catch (err) {
            return { error: err.message, stack: err.stack };
          }
        })()
      `,
      returnByValue: true
    });
    console.log('State DURING drag (touchmove):', dragRes.result.value);

    const d = dragRes.result.value;
    assert.strictEqual(d.bodyDraggingActive, true, 'body should have dragging-active class');
    assert.strictEqual(d.backdropActive, false, 'Backdrop active class should be removed');
    assert.strictEqual(d.backdropDisplay, 'none', 'Backdrop display should be none');
    assert.strictEqual(d.backdropOpacity, '0', 'Backdrop opacity should be 0');
    assert.ok(d.backdropFilter === 'none' || !d.backdropFilter, 'Backdrop filter should be none');
    assert.strictEqual(d.hasGhost, true, 'Ghost element should exist during drag');
    assert.strictEqual(d.ghostZIndex, '100005', 'Ghost element should have z-index 100005');

    // 4. Capture screenshot of the drag in progress showing the unblurred grid!
    const ss = await send('Page.captureScreenshot', { format: 'png' });
    const ssPath = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b\\drag-unblurred-grid.png';
    fs.writeFileSync(ssPath, Buffer.from(ss.data, 'base64'));
    console.log(`📸 Screenshot saved to: ${ssPath}`);

    // 5. Complete drop on Monday column
    const dropRes = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const mondayCol = document.querySelector('.grid-day-column[data-day="Monday"]');
          if (!mondayCol) return { success: false, reason: 'no monday col' };

          const rect = mondayCol.getBoundingClientRect();
          const dropY = rect.top + 100; // ~ 8:30 AM slot

          const endTouchObj = new Touch({
            identifier: Date.now(),
            target: mondayCol,
            clientX: rect.left + rect.width / 2,
            clientY: dropY,
            pageX: rect.left + rect.width / 2,
            pageY: dropY,
            screenX: rect.left + rect.width / 2,
            screenY: dropY
          });

          const endEvent = new TouchEvent('touchend', {
            cancelable: true,
            bubbles: true,
            touches: [],
            targetTouches: [],
            changedTouches: [endTouchObj]
          });
          document.dispatchEvent(endEvent);

          return {
            success: true,
            bodyDraggingActiveAfter: document.body.classList.contains('dragging-active'),
            backdropActiveAfter: document.getElementById('mobile-sheet-backdrop').classList.contains('active')
          };
        })()
      `,
      returnByValue: true
    });
    console.log('State AFTER drop:', dropRes.result.value);
    await new Promise(r => setTimeout(r, 600));

    const postDropSS = await send('Page.captureScreenshot', { format: 'png' });
    const postDropSSPath = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\0bcdf4f1-ee48-4c70-af9b-6e8de028d01b\\post-drop-grid.png';
    fs.writeFileSync(postDropSSPath, Buffer.from(postDropSS.data, 'base64'));
    console.log(`📸 Post-drop screenshot saved to: ${postDropSSPath}`);

    console.log('✅ ALL DRAG UNBLURRED TESTS PASSED!');
  } finally {
    try { chrome.kill(); } catch (e) {}
  }
}

testDragBlockUnblurred().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
