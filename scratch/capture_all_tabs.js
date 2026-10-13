const puppeteer = require('puppeteer');
const path = require('path');

async function captureAllTabs() {
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

  // List of tab text queries
  const tabs = [
    { id: 'billing', query: 'Fast Billing' },
    { id: 'tables', query: 'Live Tables' },
    { id: 'kitchen', query: 'Kitchen KOT' },
    { id: 'printers', query: 'Universal Printers' },
    { id: 'offline', query: 'Offline Mode' },
    { id: 'analytics', query: 'Sales & Cash Closing' },
  ];

  for (const t of tabs) {
    console.log(`Switching to tab: ${t.id}...`);
    // Find tab element, scroll its container so it is visible, then tap its center
    const tapped = await page.evaluate((q) => {
      const all = Array.from(document.querySelectorAll('*'));
      for (const el of all) {
        if (el.children.length === 0 && el.innerText && el.innerText.includes(q)) {
          // Find scrollable parent
          let p = el.parentElement;
          while (p && p.scrollWidth <= p.clientWidth) {
            p = p.parentElement;
          }
          if (p) {
            p.scrollLeft = el.offsetLeft - 40;
          }
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    }, t.query);

    if (tapped) {
      await new Promise(r => setTimeout(r, 300));
      // Re-get rect after scroll
      const pos = await page.evaluate((q) => {
        const all = Array.from(document.querySelectorAll('*'));
        for (const el of all) {
          if (el.children.length === 0 && el.innerText && el.innerText.includes(q)) {
            const rect = el.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
        }
        return null;
      }, t.query);

      const clickPos = pos || tapped;
      console.log(`Tapping at (${clickPos.x}, ${clickPos.y})`);
      await page.touchscreen.tap(clickPos.x, clickPos.y);
      await new Promise(r => setTimeout(r, 1200));

      const outPath = path.join(__dirname, `screen_${t.id}.png`);
      await page.screenshot({ path: outPath });
      console.log(`Saved: ${outPath}`);
    } else {
      console.log(`Tab not found: ${t.query}`);
    }
  }

  await browser.close();
}

captureAllTabs().catch(console.error);
