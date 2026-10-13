const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36');
  // Exact Pixel 10 Pro / Pixel 9 Pro: 1280 x 2856 (412 x 919 at 3.1068x scale)
  await page.setViewport({ width: 412, height: 919, deviceScaleFactor: 3.1068, isMobile: true, hasTouch: true });
  
  await page.goto('http://localhost:8088/demo-billing', { waitUntil: 'networkidle2', timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));

  // Dismiss modal if present
  await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('div, button, span, a'));
    const btn = divs.find(d => d.textContent && d.textContent.trim().toLowerCase().includes('continue in browser'));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  const tabLabels = [
    { id: 'billing', label: 'Fast Billing' },
    { id: 'tables', label: 'Live Tables' },
    { id: 'kitchen', label: 'Kitchen KOT' },
    { id: 'printers', label: 'Universal Printers' },
    { id: 'offline', label: 'Offline Mode' },
    { id: 'analytics', label: 'Sales & Cash Closing' },
  ];

  for (const t of tabLabels) {
    console.log(`Clicking tab ${t.label}...`);
    await page.evaluate((tabText) => {
      const elements = Array.from(document.querySelectorAll('div, button, span'));
      const target = elements.find(el => el.textContent && el.textContent.includes(tabText));
      if (target) {
        target.click();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, t.label);
    await new Promise(r => setTimeout(r, 1200));

    const outPath = path.join(__dirname, `tab_${t.id}.png`);
    await page.screenshot({ path: outPath });
    console.log(`Saved screenshot: ${outPath}`);
  }

  await browser.close();
}

run().catch(console.error);
