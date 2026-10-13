const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function captureScreens() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36');
  // Exact Pixel 10 Pro screen resolution: 1280 x 2856 (412 x 919 at 3.1068)
  await page.setViewport({ width: 412, height: 919, deviceScaleFactor: 3.1068, isMobile: true, hasTouch: true });
  
  await page.goto('http://localhost:8088/demo-billing', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  // Dismiss modal if present
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div, button, span, a'));
    const btn = divs.find(d => d.textContent && d.textContent.trim().toLowerCase().includes('continue in browser'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const tabs = [
    { id: 'pos-billing', query: 'Fast Billing' },
    { id: 'table-management', query: 'Live Tables' },
    { id: 'kitchen-display', query: 'Kitchen KOT' },
    { id: 'universal-printers', query: 'Universal Printers' },
    { id: 'offline-sync', query: 'Offline Mode' },
    { id: 'cash-closing', query: 'Sales & Cash Closing' },
  ];

  const rawDir = path.resolve(__dirname, '../out/raw/pixel-10-pro');
  if (!fs.existsSync(rawDir)) {
    fs.mkdirSync(rawDir, { recursive: true });
  }

  for (const t of tabs) {
    console.log(`\n--- Capturing ${t.id} (${t.query}) ---`);
    
    // Scroll tab into view inside the horizontal tab bar
    await page.evaluate((q) => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.children.length === 0 && el.innerText && el.innerText.includes(q)) {
          el.scrollIntoView({ inline: 'center', block: 'nearest' });
          break;
        }
      }
    }, t.query);
    await new Promise(r => setTimeout(r, 400));

    // Find tab coordinates and tap it
    const rect = await page.evaluate((q) => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.children.length === 0 && el.innerText && el.innerText.includes(q)) {
          const r = el.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
      }
      return null;
    }, t.query);

    if (rect) {
      console.log(`Tapping tab at (${Math.round(rect.x)}, ${Math.round(rect.y)})`);
      await page.touchscreen.tap(rect.x, rect.y);
      await new Promise(r => setTimeout(r, 1000));
    } else {
      console.error(`Could not locate tab for: ${t.query}`);
    }

    const outPath = path.join(rawDir, `${t.id}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved screenshot: ${outPath}`);
  }

  // Create Goldie capture manifest in out/raw/pixel-10-pro/manifest.json
  const manifest = {
    device: "pixel-10-pro",
    udid: "emulator-5554",
    capturedAt: new Date().toISOString(),
    screenshots: tabs.map(t => ({
      sceneId: t.id,
      file: path.join(rawDir, `${t.id}.png`)
    })),
    preview: null
  };

  fs.writeFileSync(path.join(rawDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log('\nWrote capture manifest to out/raw/pixel-10-pro/manifest.json');

  await browser.close();
}

captureScreens().catch(console.error);
