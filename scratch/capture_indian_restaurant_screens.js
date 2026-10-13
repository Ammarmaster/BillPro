const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function captureIndianRestaurantScreens() {
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

  const rawDir = path.resolve(__dirname, '../out/raw/pixel-10-pro');
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  // Dismiss PWA install prompt & customize header
  async function polishDom() {
    await page.evaluate(() => {
      // 1. Dismiss PWA prompt
      const divs = Array.from(document.querySelectorAll('div, button, span, a'));
      const pwaBtn = divs.find(d => d.textContent && d.textContent.trim().toLowerCase().includes('continue in browser'));
      if (pwaBtn) pwaBtn.click();

      // 2. Hide promotional bottom bar if present
      divs.forEach(d => {
        if (d.textContent && (d.textContent.includes('Ready to start live billing?') || d.textContent.includes('Activate Now'))) {
          d.style.display = 'none';
        }
      });

      // 3. Customize top header for an authentic Indian Restaurant POS terminal
      const allEls = Array.from(document.querySelectorAll('*'));
      for (const el of allEls) {
        if (el.children.length === 0) {
          if (el.innerText === 'Interactive Product Tour') {
            el.innerText = 'Royal Biryani & Cafe · Terminal #1';
            el.style.color = '#F8FAFC';
            el.style.fontSize = '11px';
            el.style.fontWeight = '700';
          }
          if (el.innerText === 'Login') {
            el.innerText = '● Shift Active';
            el.style.color = '#10B981';
            el.style.fontWeight = '800';
            el.style.fontSize = '12px';
          }
          if (el.innerText === 'Get Started') {
            el.innerText = '📶 Offline Ready';
            el.style.fontSize = '11px';
            el.style.fontWeight = '700';
          }
          if (el.innerText === 'EzBill') {
            el.innerText = 'BillPro';
          }
        }
      }
    });
    await new Promise(r => setTimeout(r, 300));
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
    await polishDom();
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

  // Initial polish
  await polishDom();

  // 1. pos-billing
  console.log('Capturing 1: pos-billing...');
  await selectTab('Fast Billing');
  await scrollVertical(220);
  await polishDom();
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

    // Enhance Thermal Receipt with Indian Restaurant branding & show UPI QR code
    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.children.length === 0) {
          if (el.innerText && el.innerText.includes('EZBILL DEMO RESTAURANT')) {
            el.innerText = 'ROYAL BIRYANI & CAFE';
            el.style.fontSize = '16px';
            el.style.fontWeight = '900';
          }
          if (el.innerText && el.innerText.includes('GSTIN: 29ABCDE1234F1Z5')) {
            el.innerText = 'GSTIN: 29AAAAA0000A1Z5 · FSSAI: 11223344556677';
            el.style.fontSize = '9.5px';
            el.style.fontWeight = '700';
          }
        }
        // Expand receipt paper scrollview so the UPI QR code is visible!
        if (el.style && el.style.maxHeight === '380px') {
          el.style.maxHeight = '520px';
        }
      }

      // Scroll receipt so that total & UPI QR code are in the center
      for (const el of all) {
        if (el.scrollHeight > el.clientHeight + 40 && el.innerText && el.innerText.includes('TOTAL PAYABLE')) {
          el.scrollTop = 160;
        }
      }
    });

    await new Promise(r => setTimeout(r, 500));
    await page.screenshot({ path: path.join(rawDir, 'thermal-receipt.png') });
  } else {
    console.error('Could not find thermal receipt button');
  }

  // Reload page to reset modal overlay cleanly
  await page.goto('http://localhost:8088/demo-billing', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  await polishDom();

  // 3. table-management
  console.log('Capturing 3: table-management...');
  await selectTab('Live Tables POS');
  await scrollVertical(220);
  await polishDom();
  await page.screenshot({ path: path.join(rawDir, 'table-management.png') });

  // 4. kitchen-display
  console.log('Capturing 4: kitchen-display...');
  await selectTab('Kitchen KOT');
  await scrollVertical(220);
  await polishDom();
  await page.screenshot({ path: path.join(rawDir, 'kitchen-display.png') });

  // 5. universal-printers
  console.log('Capturing 5: universal-printers...');
  await selectTab('Universal Printers');
  await scrollVertical(220);
  await polishDom();
  await page.screenshot({ path: path.join(rawDir, 'universal-printers.png') });

  // 6. offline-sync
  console.log('Capturing 6: offline-sync...');
  await selectTab('100% Offline Mode');
  await scrollVertical(220);
  await polishDom();
  await page.screenshot({ path: path.join(rawDir, 'offline-sync.png') });

  // 7. cash-closing
  console.log('Capturing 7: cash-closing...');
  await selectTab('Sales & Cash Closing');
  await scrollVertical(220);
  await polishDom();
  await page.screenshot({ path: path.join(rawDir, 'cash-closing.png') });

  // 8. profit-engine
  console.log('Capturing 8: profit-engine...');
  await selectTab('Fast Billing');
  await scrollVertical(1720);
  await polishDom();
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

captureIndianRestaurantScreens().catch(console.error);
