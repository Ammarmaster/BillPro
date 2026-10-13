const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function captureAll8Screens() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36');
  // Exact Pixel 10 Pro screen resolution: 1280 x 2856 (412 x 919 at 3.1068)
  await page.setViewport({ width: 412, height: 919, deviceScaleFactor: 3.1068, isMobile: true, hasTouch: true });
  
  await page.goto('http://localhost:8088/demo-billing', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));

  // Dismiss PWA install prompt if present
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div, button, span, a'));
    const btn = divs.find(d => d.textContent && d.textContent.trim().toLowerCase().includes('continue in browser'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const rawDir = path.resolve(__dirname, '../out/raw/pixel-10-pro');
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  async function selectTab(tabLabel) {
    await page.evaluate((label) => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.innerText && el.innerText.includes(label) && el.innerText.length < 40) {
          el.scrollIntoView({ inline: 'center' });
          el.click();
          break;
        }
      }
    }, tabLabel);
    await new Promise(r => setTimeout(r, 600));
  }

  async function scrollVertical(top) {
    await page.evaluate((t) => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.scrollHeight > el.clientHeight + 100) {
          el.scrollTop = t;
        }
      }
    }, top);
    await new Promise(r => setTimeout(r, 400));
  }

  // 1. pos-billing
  console.log('Capturing 1: pos-billing...');
  await selectTab('Fast Billing');
  await scrollVertical(220);
  await page.screenshot({ path: path.join(rawDir, 'pos-billing.png') });

  // 2. thermal-receipt
  console.log('Capturing 2: thermal-receipt...');
  await scrollVertical(1200);
  const tappedBtn = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all) {
      if (el.children.length === 0 && el.innerText && el.innerText.includes('Preview Thermal Receipt')) {
        el.scrollIntoView({ block: 'center' });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });
  if (tappedBtn) {
    await new Promise(r => setTimeout(r, 300));
    await page.touchscreen.tap(tappedBtn.x, tappedBtn.y);
    await new Promise(r => setTimeout(r, 1000));

    // Scroll receipt modal to show GST total and UPI QR code
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.scrollHeight > el.clientHeight + 30 && el.innerText && el.innerText.includes('TOTAL PAYABLE')) {
          el.scrollTop = 160;
        }
      }
    });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(rawDir, 'thermal-receipt.png') });
  } else {
    console.error('Could not find thermal receipt button');
  }

  // Reload page to cleanly reset any open modal overlays
  await page.goto('http://localhost:8088/demo-billing', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));

  // Dismiss PWA install prompt if present again
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div, button, span, a'));
    const btn = divs.find(d => d.textContent && d.textContent.trim().toLowerCase().includes('continue in browser'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // 3. table-management
  console.log('Capturing 3: table-management...');
  await selectTab('Live Tables POS');
  await scrollVertical(220);
  await page.screenshot({ path: path.join(rawDir, 'table-management.png') });

  // 4. kitchen-display
  console.log('Capturing 4: kitchen-display...');
  await selectTab('Kitchen KOT');
  await scrollVertical(220);
  await page.screenshot({ path: path.join(rawDir, 'kitchen-display.png') });

  // 5. universal-printers
  console.log('Capturing 5: universal-printers...');
  await selectTab('Universal Printers');
  await scrollVertical(220);
  await page.screenshot({ path: path.join(rawDir, 'universal-printers.png') });

  // 6. offline-sync
  console.log('Capturing 6: offline-sync...');
  await selectTab('100% Offline Mode');
  await scrollVertical(220);
  await page.screenshot({ path: path.join(rawDir, 'offline-sync.png') });

  // 7. cash-closing
  console.log('Capturing 7: cash-closing...');
  await selectTab('Sales & Cash Closing');
  await scrollVertical(220);
  await page.screenshot({ path: path.join(rawDir, 'cash-closing.png') });

  // 8. profit-engine
  console.log('Capturing 8: profit-engine...');
  await selectTab('Fast Billing');
  await scrollVertical(1720);
  await page.screenshot({ path: path.join(rawDir, 'profit-engine.png') });

  const sceneIds = [
    'pos-billing',
    'thermal-receipt',
    'table-management',
    'kitchen-display',
    'universal-printers',
    'offline-sync',
    'cash-closing',
    'profit-engine'
  ];

  const manifest = {
    device: "pixel-10-pro",
    udid: "emulator-5554",
    capturedAt: new Date().toISOString(),
    screenshots: sceneIds.map(id => ({
      sceneId: id,
      file: path.join(rawDir, `${id}.png`)
    })),
    preview: null
  };

  fs.writeFileSync(path.join(rawDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log('\nAll 8 screens captured and manifest written to out/raw/pixel-10-pro/manifest.json');

  await browser.close();
}

captureAll8Screens().catch(console.error);
