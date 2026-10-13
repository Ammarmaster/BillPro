const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 919, deviceScaleFactor: 3.1068, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:8088/demo-billing', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));

  // Dismiss modal if present
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div, button, span, a'));
    const btn = divs.find(d => d.textContent && d.textContent.trim().toLowerCase().includes('continue in browser'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  console.log('Tapping Live Tables POS at (280, 270)...');
  await page.touchscreen.tap(280, 270);
  await new Promise(r => setTimeout(r, 1200));

  await page.screenshot({ path: path.join(__dirname, 'test_tap_tables.png') });
  console.log('Saved test_tap_tables.png');
  await browser.close();
})();
