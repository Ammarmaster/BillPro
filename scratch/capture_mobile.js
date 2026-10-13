const puppeteer = require('puppeteer');
const path = require('path');

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36');
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

  await page.screenshot({ path: path.join(__dirname, 'demo_billing_screen.png') });
  console.log('Saved demo billing screenshot successfully!');
  await browser.close();
}

run().catch(console.error);
