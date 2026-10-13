const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 919, deviceScaleFactor: 3.1068, isMobile: true, hasTouch: true });
  await page.goto('http://localhost:8088/demo-billing', { waitUntil: 'networkidle2' });
  
  const buttons = await page.evaluate(() => {
    const list = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.getAttribute('role') === 'button' || el.tabIndex === 0 || el.onclick) {
        const text = el.innerText ? el.innerText.trim() : '';
        if (text && text.length < 50 && !text.includes('\n')) {
          const rect = el.getBoundingClientRect();
          list.push({ text, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
        }
      }
    }
    return list;
  });
  console.log('Found buttons:', buttons);
  await browser.close();
})();
