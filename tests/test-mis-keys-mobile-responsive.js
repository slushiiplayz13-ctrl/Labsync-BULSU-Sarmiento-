const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function run() {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const port = 9558;
  const tempProfile = path.join(__dirname, 'temp-chrome-keys-' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    'about:blank'
  ]);

  try {
    await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    const data = await res.json();
    const bWs = new WebSocket(data.webSocketDebuggerUrl);
    await new Promise(r => bWs.onopen = r);

    let id = 1;
    function send(ws, method, params = {}) {
      return new Promise((resolve) => {
        const curId = id++;
        const handler = (evt) => {
          const m = JSON.parse(evt.data);
          if (m.id === curId) {
            ws.removeEventListener('message', handler);
            resolve(m.result);
          }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const t = await send(bWs, 'Target.createTarget', { url: 'about:blank' });
    const pWs = new WebSocket(`ws://127.0.0.1:${port}/devtools/page/${t.targetId}`);
    await new Promise(r => pWs.onopen = r);

    await send(pWs, 'Page.enable');
    await send(pWs, 'Runtime.enable');

    // Emulate MIS Staff user
    await send(pWs, 'Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          const userObj = { role: 'MIS Staff', name: 'MIS Test Officer', email: 'mis@bulsu.edu.ph' };
          localStorage.setItem('user', JSON.stringify(userObj));
          localStorage.setItem('labsync_last_activity', Date.now().toString());
          sessionStorage.setItem('labsync_user', JSON.stringify(userObj));

          const origFetch = window.fetch;
          window.fetch = async function(url, ...args) {
            if (typeof url === 'string') {
              if (url.includes('/api/user/current')) {
                return new Response(JSON.stringify({ user: userObj }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
              if (url.includes('/api/keys')) {
                return new Response(JSON.stringify({
                  success: true,
                  keys: [
                    {
                      Key_ID: 1,
                      Key_Code: 'KEY-IT-203-A',
                      Room_Number: '203',
                      Building: 'Building B',
                      Room_Key_Status: 'Present',
                      deviceOnline: true,
                      Last_Activity_At: '2026-09-26T09:30:00Z',
                      Current_Holder_Name: null
                    },
                    {
                      Key_ID: 2,
                      Key_Code: 'KEY-IT-204-A',
                      Room_Number: '204',
                      Building: 'Building B',
                      Room_Key_Status: 'Absent',
                      deviceOnline: true,
                      Last_Activity_At: '2026-09-26T10:15:00Z',
                      Current_Holder_Name: 'Prof. Juan Dela Cruz'
                    },
                    {
                      Key_ID: 3,
                      Key_Code: 'KEY-IT-205-A',
                      Room_Number: '205',
                      Building: 'Building B',
                      Room_Key_Status: 'Present',
                      deviceOnline: true,
                      Last_Activity_At: '2026-09-26T08:00:00Z',
                      Current_Holder_Name: null
                    }
                  ],
                  summary: { total: 3, inDock: 2, inUse: 1 }
                }), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' }
                });
              }
            }
            return origFetch.apply(this, [url, ...args]);
          };
        } catch(e) {}
      `
    });

    // 1. Set mobile viewport (390 x 844)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true
    });

    console.log('Navigating to http://localhost:3000/mis-keys.html at 390px mobile viewport...');
    await send(pWs, 'Page.navigate', { url: 'http://localhost:3000/mis-keys.html' });
    await new Promise(r => setTimeout(r, 2500));

    // Evaluate mobile layout metrics
    const evalResult = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientWidth = docEl.clientWidth;
          const hasHorizontalScroll = scrollWidth > clientWidth;

          const table = document.querySelector('.keys-table');
          const tableComputed = table ? window.getComputedStyle(table) : null;
          const tableContainer = document.querySelector('.table-container.keys-table-card');
          const containerComputed = tableContainer ? window.getComputedStyle(tableContainer) : null;
          const thead = table ? table.querySelector('thead') : null;
          const theadComputed = thead ? window.getComputedStyle(thead) : null;

          const rows = document.querySelectorAll('tr.key-data-row');
          const firstRow = rows[0];
          const rowComputed = firstRow ? window.getComputedStyle(firstRow) : null;

          const searchBox = document.querySelector('.search-box-header');
          const searchOrder = searchBox ? window.getComputedStyle(searchBox).order : null;

          const filterGroup = document.querySelector('.keys-filter-group');
          const filterOrder = filterGroup ? window.getComputedStyle(filterGroup).order : null;

          const batchActions = document.querySelector('.keys-batch-actions');
          const batchOrder = batchActions ? window.getComputedStyle(batchActions).order : null;

          const firstRowCheckbox = firstRow ? firstRow.querySelector('.key-row-checkbox') : null;
          const firstRowBtn = firstRow ? firstRow.querySelector('.key-action-btn') : null;
          const btnComputed = firstRowBtn ? window.getComputedStyle(firstRowBtn) : null;

          return {
            scrollWidth,
            clientWidth,
            hasHorizontalScroll,
            tableDisplay: tableComputed ? tableComputed.display : null,
            tableMinWidth: tableComputed ? tableComputed.minWidth : null,
            containerOverflowX: containerComputed ? containerComputed.overflowX : null,
            theadDisplay: theadComputed ? theadComputed.display : null,
            rowCount: rows.length,
            rowDisplay: rowComputed ? rowComputed.display : null,
            searchOrder,
            filterOrder,
            batchOrder,
            btnWidth: btnComputed ? btnComputed.width : null,
            hasCheckbox: !!firstRowCheckbox
          };
        })()
      `,
      returnByValue: true
    });

    const metrics = evalResult.result.value;
    console.log('--- Mobile Metrics (390px) ---');
    console.log('Scroll width:', metrics.scrollWidth, 'Client width:', metrics.clientWidth);
    console.log('Has horizontal overflow:', metrics.hasHorizontalScroll);
    console.log('Table display:', metrics.tableDisplay, 'Table minWidth:', metrics.tableMinWidth);
    console.log('Thead display:', metrics.theadDisplay);
    console.log('Row count:', metrics.rowCount, 'Row display:', metrics.rowDisplay);
    console.log('Toolbar ordering - Search:', metrics.searchOrder, 'Filters:', metrics.filterOrder, 'Batch:', metrics.batchOrder);
    console.log('Action button width:', metrics.btnWidth);

    if (metrics.hasHorizontalScroll) {
      throw new Error(`Mobile view has horizontal overflow! scrollWidth (${metrics.scrollWidth}) > clientWidth (${metrics.clientWidth})`);
    }
    if (metrics.theadDisplay !== 'none') {
      throw new Error(`Table thead must be hidden on mobile, got: ${metrics.theadDisplay}`);
    }
    if (metrics.rowDisplay !== 'grid') {
      throw new Error(`Key row must be display: grid on mobile, got: ${metrics.rowDisplay}`);
    }
    if (metrics.searchOrder !== '1' || metrics.filterOrder !== '2' || metrics.batchOrder !== '3') {
      throw new Error(`Toolbar ordering mismatch! Expected 1, 2, 3 but got ${metrics.searchOrder}, ${metrics.filterOrder}, ${metrics.batchOrder}`);
    }

    // Test tap interaction: tap the card header to toggle selection
    const tapResult = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const firstRow = document.querySelector('tr.key-data-row');
          if (!firstRow) return { error: 'No rows' };
          const ticketCell = firstRow.querySelector('.col-ticket');
          ticketCell.click();

          const cb = firstRow.querySelector('.key-row-checkbox');
          const isSelected = firstRow.classList.contains('row-selected');
          const btnSelected = document.getElementById('btnBatchPrintSelected');
          const badge = document.getElementById('btnBatchPrintSelectedBadge');

          return {
            cbChecked: cb.checked,
            rowSelected: isSelected,
            btnEnabled: !btnSelected.disabled,
            badgeCount: badge.textContent
          };
        })()
      `,
      returnByValue: true
    });

    console.log('--- Tap Selection Result ---');
    console.log(tapResult.result.value);
    if (!tapResult.result.value.cbChecked || !tapResult.result.value.rowSelected) {
      throw new Error('Tapping card failed to select key row!');
    }
    if (!tapResult.result.value.btnEnabled || tapResult.result.value.badgeCount !== '1') {
      throw new Error('Batch toolbar failed to activate with count 1!');
    }

    // Test tap interaction: tap card again to uncheck (check-then-uncheck flow)
    const uncheckResult = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const firstRow = document.querySelector('tr.key-data-row');
          const ticketCell = firstRow.querySelector('.col-ticket');
          ticketCell.click();

          const cb = firstRow.querySelector('.key-row-checkbox');
          const isSelected = firstRow.classList.contains('row-selected');
          const tds = Array.from(firstRow.querySelectorAll('td'));
          const tdStyles = tds.map(td => {
            const cs = window.getComputedStyle(td);
            return {
              className: td.className,
              bgColor: cs.backgroundColor,
              borderBottom: cs.borderBottomWidth,
              boxShadow: cs.boxShadow
            };
          });

          const chip = firstRow.querySelector('.key-code-chip');
          const cbR = cb.getBoundingClientRect();
          const chipR = chip ? chip.getBoundingClientRect() : {};
          const tR = ticketCell.getBoundingClientRect();
          const cs = window.getComputedStyle(ticketCell);

          return {
            cbChecked: cb.checked,
            rowSelected: isSelected,
            tdStyles,
            cb: { x: cbR.x, w: cbR.width },
            chip: { x: chipR.x, w: chipR.width },
            ticketTd: { x: tR.x, w: tR.width, paddingLeft: cs.paddingLeft }
          };
        })()
      `,
      returnByValue: true
    });

    console.log('--- Uncheck Result (Light Mode) ---');
    console.log('Checkbox checked:', uncheckResult.result.value.cbChecked, 'Row selected:', uncheckResult.result.value.rowSelected);
    console.log('cb:', uncheckResult.result.value.cb);
    console.log('chip:', uncheckResult.result.value.chip);
    console.log('ticketTd:', uncheckResult.result.value.ticketTd);
    uncheckResult.result.value.tdStyles.forEach(s => {
      console.log('  TD', s.className, 'bgColor:', s.bgColor, 'borderBottom:', s.borderBottom);
      if (s.bgColor !== 'rgba(0, 0, 0, 0)' && s.bgColor !== 'transparent') {
        throw new Error(`TD ${s.className} has visible background: ${s.bgColor}`);
      }
    });

    // Capture screenshot of mobile cards view (light mode)
    const ss = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const artifactPath = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\9320f511-2c63-4a96-a592-4a9976ae1bca\\mis-keys-mobile-fixed.png';
    fs.writeFileSync(artifactPath, Buffer.from(ss.data, 'base64'));
    console.log('✔ Captured mobile light screenshot saved to:', artifactPath);

    // Now test in Dark Mode (check and uncheck flow as reported by user)
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
        document.documentElement.setAttribute('data-theme', 'dark');
      `
    });
    await new Promise(r => setTimeout(r, 400));

    // Tap to check, then tap to uncheck in dark mode
    const darkModeCheckUncheck = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const firstRow = document.querySelector('tr.key-data-row');
          const ticketCell = firstRow.querySelector('.col-ticket');

          // 1. Check
          ticketCell.click();
          const checkState = {
            cbChecked: firstRow.querySelector('.key-row-checkbox').checked,
            isSelected: firstRow.classList.contains('row-selected')
          };

          // 2. Uncheck
          ticketCell.click();
          const uncheckState = {
            cbChecked: firstRow.querySelector('.key-row-checkbox').checked,
            isSelected: firstRow.classList.contains('row-selected')
          };

          // 3. Inspect every TD computed background and borders
          const tds = Array.from(firstRow.querySelectorAll('td'));
          const tdStyles = tds.map(td => {
            const cs = window.getComputedStyle(td);
            return {
              className: td.className,
              bgColor: cs.backgroundColor,
              borderBottom: cs.borderBottomWidth,
              boxShadow: cs.boxShadow
            };
          });

          return {
            checkState,
            uncheckState,
            tdStyles
          };
        })()
      `,
      returnByValue: true
    });

    console.log('--- Dark Mode Check-Uncheck Test ---');
    console.log('After check:', darkModeCheckUncheck.result.value.checkState);
    console.log('After uncheck:', darkModeCheckUncheck.result.value.uncheckState);
    darkModeCheckUncheck.result.value.tdStyles.forEach(s => {
      console.log('  Dark TD', s.className, 'bgColor:', s.bgColor, 'borderBottom:', s.borderBottom);
      if (s.bgColor !== 'rgba(0, 0, 0, 0)' && s.bgColor !== 'transparent') {
        throw new Error(`Dark Mode TD ${s.className} has visible background container box: ${s.bgColor}`);
      }
    });

    // Capture dark mode screenshot
    const ssDark = await send(pWs, 'Page.captureScreenshot', { format: 'png' });
    const darkArtifactPath = 'C:\\Users\\andre\\.gemini\\antigravity-ide\\brain\\9320f511-2c63-4a96-a592-4a9976ae1bca\\mis-keys-mobile-dark-fixed.png';
    fs.writeFileSync(darkArtifactPath, Buffer.from(ssDark.data, 'base64'));
    console.log('✔ Captured mobile dark mode screenshot saved to:', darkArtifactPath);

    // Switch back to light mode for modal test
    await send(pWs, 'Runtime.evaluate', {
      expression: `
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
        document.documentElement.removeAttribute('data-theme');
      `
    });

    // Test Print QR Tag click opens preview modal
    const modalResult = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const firstRow = document.querySelector('tr.key-data-row');
          const printBtn = firstRow.querySelector('.key-action-btn');
          printBtn.click();
          return { clicked: true };
        })()
      `,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 600));

    const modalCheck = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const modal = document.getElementById('printKeyModalOverlay');
          const isVisible = modal && window.getComputedStyle(modal).display !== 'none';
          const pairs = modal.querySelectorAll('.keychain-print-pair');
          return {
            isVisible,
            pairsCount: pairs.length
          };
        })()
      `,
      returnByValue: true
    });
    console.log('--- Modal Test ---', modalCheck.result.value);
    if (!modalCheck.result.value.isVisible || modalCheck.result.value.pairsCount === 0) {
      throw new Error('Print QR Tag button failed to open preview modal!');
    }

    // Close modal
    await send(pWs, 'Runtime.evaluate', {
      expression: `document.getElementById('btnClosePrintModal').click();`
    });
    await new Promise(r => setTimeout(r, 300));

    // 2. Test Desktop Isolation (1440 x 900)
    await send(pWs, 'Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 800));

    const desktopEval = await send(pWs, 'Runtime.evaluate', {
      expression: `
        (function() {
          const table = document.querySelector('.keys-table');
          const tableComputed = window.getComputedStyle(table);
          const thead = table.querySelector('thead');
          const theadComputed = window.getComputedStyle(thead);
          const row = table.querySelector('tr.key-data-row');
          const rowComputed = window.getComputedStyle(row);

          return {
            tableDisplay: tableComputed.display,
            minWidth: tableComputed.minWidth,
            theadDisplay: theadComputed.display,
            rowDisplay: rowComputed.display
          };
        })()
      `,
      returnByValue: true
    });
    console.log('--- Desktop Metrics (1440px) ---', desktopEval.result.value);
    if (desktopEval.result.value.theadDisplay === 'none') {
      throw new Error('Thead must NOT be hidden on desktop!');
    }
    if (desktopEval.result.value.rowDisplay !== 'table-row') {
      throw new Error(`Desktop row display must be table-row, got: ${desktopEval.result.value.rowDisplay}`);
    }

    console.log('ALL MOBILE RESPONSIVE AND DESKTOP ISOLATION CHECKS PASSED SUCCESSFULLY! 🎉');

  } finally {
    try {
      chromeProc.kill('SIGKILL');
    } catch(e) {}
    try {
      fs.rmSync(tempProfile, { recursive: true, force: true });
    } catch(e) {}
  }
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
