const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/lenovo/.gemini/antigravity-ide/brain/a15ef772-e9fb-47dd-a4c9-20e167f0a6ba';

async function run() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const pageTab = tabs.find(t => t.url.includes('5173') || t.type === 'page');
  if (!pageTab) {
    console.error('No matching page tab found');
    process.exit(1);
  }

  console.log('Connecting to:', pageTab.webSocketDebuggerUrl);
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    } else if (data.method === 'Runtime.consoleAPICalled') {
      console.log('[BROWSER CONSOLE]', data.params.type, data.params.args.map(a => a.value || a.description).join(' '));
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', data.params.exceptionDetails);
    }
  };

  await new Promise(res => ws.onopen = res);
  console.log('Connected to CDP');

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false
  });

  // Reload page to get fresh bundle
  console.log('Reloading page...');
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 4500));

  // Helper to take screenshot
  async function takeScreenshot(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(ARTIFACT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log('Screenshot saved to:', outPath);
    return outPath;
  }

  // 1. Initial Overview Screenshot
  console.log('Capturing Initial Overview...');
  await takeScreenshot('cp_f2_initial_overview.png');

  // 2. Click SAFETY SCENE preset
  console.log('Clicking SAFETY SCENE preset...');
  const clickSafetyScene = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent && b.textContent.includes('SAFETY SCENE'));
        if (btn) {
          btn.click();
          return 'CLICKED_SAFETY_SCENE';
        }
        return 'BTN_NOT_FOUND';
      })()
    `,
    returnByValue: true
  });
  console.log('Safety Scene button click result:', clickSafetyScene.result.value);
  await new Promise(r => setTimeout(r, 2000));

  // 3. Capture Safety Scene
  console.log('Capturing Safety Scene...');
  await takeScreenshot('cp_f2_safety_scene.png');

  // 4. Open Map Layers drawer to verify Public Mapped Road / Track toggle
  console.log('Opening Map Layers drawer...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent && b.textContent.includes('MAP LAYERS'));
        if (btn) btn.click();
      })()
    `
  });
  await new Promise(r => setTimeout(r, 800));
  await takeScreenshot('cp_f2_layer_drawer.png');

  // Close layer drawer
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent && b.textContent.includes('MAP LAYERS'));
        if (btn) btn.click();
      })()
    `
  });
  await new Promise(r => setTimeout(r, 500));

  // 5. Start scenario playback
  console.log('Starting Scenario...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.title && (b.title.includes('Start') || b.title.includes('Play')) || b.textContent.includes('START'));
        if (btn) {
          btn.click();
          return 'STARTED_VIA_DOM';
        }
        return 'PLAY_BTN_NOT_FOUND';
      })()
    `
  });

  // Wait 10 seconds (Medium risk phase, gap closes to ~50m)
  console.log('Waiting 10 seconds for Medium Risk...');
  await new Promise(r => setTimeout(r, 10000));
  await takeScreenshot('cp_f2_medium_risk.png');

  // Wait 8 seconds more (High risk phase, blind curve apex, gap closes to ~18m, TTC ~3s)
  console.log('Waiting 8 seconds for High Risk proximity at blind curve...');
  await new Promise(r => setTimeout(r, 8000));
  await takeScreenshot('cp_f2_high_risk_apex.png');

  ws.close();
  console.log('Verification script completed successfully!');
}

run().catch(err => {
  console.error('CDP verification error:', err);
  process.exit(1);
});
