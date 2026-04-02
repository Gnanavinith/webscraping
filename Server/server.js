import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

const getPuppeteerConfig = () => ({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-web-security',
    '--lang=en-US',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
    '--disable-gpu'
  ],
});

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use(cors());
app.use(express.json());

// ── Scrape phone from individual listing page ────────────────────────────────
async function scrapePhoneFromListing(browser, placeUrl) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    try {
      await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    } catch (e) {
      // timeout — still try to extract from whatever loaded
    }

    await new Promise(r => setTimeout(r, 1200));

    const phone = await page.evaluate(() => {
      // Strategy 1: tel: link
      const telLink = document.querySelector('a[href^="tel:"]');
      if (telLink) return telLink.getAttribute('href').replace('tel:', '').trim();

      // Strategy 2: aria-label on any element
      const allEls = Array.from(document.querySelectorAll('[aria-label]'));
      for (const el of allEls) {
        const label = el.getAttribute('aria-label') || '';
        const indMatch = label.match(/(\+91[\s\-]?[6-9]\d{9}|\b[6-9]\d{9}\b)/);
        if (indMatch) return indMatch[1];
        const intMatch = label.match(/(\+?1?[\s\-\.]?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4})/);
        if (intMatch) return intMatch[1].trim();
      }

      // Strategy 3: page text
      const bodyText = document.body.innerText;
      const patterns = [
        /\+91[\s\-]?[6-9]\d{9}/,
        /\b[6-9]\d{9}\b/,
        /\+?1?[\s\-\.]?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/,
        /\b\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}\b/,
      ];
      for (const pat of patterns) {
        const m = bodyText.match(pat);
        if (m) return m[0].trim();
      }
      return null;
    });

    return phone;
  } catch (err) {
    return null;
  } finally {
    await page.close();
  }
}

// ── Auto-scroll feed ─────────────────────────────────────────────────────────
async function autoScroll(page, feedSelector) {
  await page.evaluate(async (selector) => {
    const feed = document.querySelector(selector);
    if (!feed) return;
    const scrollable = feed.closest('[role="main"]') || feed.parentElement;
    await new Promise(resolve => {
      let lastHeight = 0, sameCount = 0;
      const timer = setInterval(() => {
        scrollable.scrollBy(0, 800);
        const newHeight = scrollable.scrollHeight;
        if (newHeight === lastHeight) {
          if (++sameCount >= 5) { clearInterval(timer); resolve(); }
        } else { sameCount = 0; lastHeight = newHeight; }
      }, 400);
      setTimeout(() => { clearInterval(timer); resolve(); }, 15000);
    });
  }, feedSelector);
  await new Promise(r => setTimeout(r, 800));
}

// ── STREAMING scrape endpoint (Server-Sent Events) ───────────────────────────
// Frontend connects with: new EventSource('/api/scrape-stream?location=X&businessType=Y')
app.get('/api/scrape-stream', async (req, res) => {
  const { location, businessType } = req.query;

  if (!location || !businessType) {
    return res.status(400).json({ error: 'location and businessType are required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disables nginx buffering on Render
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Keep-alive ping every 20s so Render doesn't kill the idle connection
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 20000);

  let browser;
  try {
    send('status', { message: 'Launching browser…' });
    browser = await puppeteer.launch(getPuppeteerConfig());
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    send('status', { message: `Searching Google Maps for "${businessType}" in ${location}…` });

    const searchQuery = encodeURIComponent(`${businessType} in ${location}`);
    try {
      await page.goto(`https://www.google.com/maps/search/${searchQuery}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
    } catch (e) {}

    // Dismiss consent screen
    try {
      const btn = await page.$('button[aria-label*="Accept"], form[action*="consent"] button');
      if (btn) { await btn.click(); await new Promise(r => setTimeout(r, 1000)); }
    } catch (e) {}

    const feedSelector = 'div[role="feed"]';
    try {
      await page.waitForSelector(feedSelector, { timeout: 15000 });
    } catch (e) {
      send('error', { message: 'Could not load Google Maps feed. Try again.' });
      res.end(); clearInterval(keepAlive); await browser.close(); return;
    }

    send('status', { message: 'Scrolling through results…' });
    await autoScroll(page, feedSelector);
    await new Promise(r => setTimeout(r, 800));

    // Extract feed data
    const rawBusinesses = await page.evaluate(() => {
      const results = [];
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return results;
      const seenNames = new Set();

      Array.from(feed.children).forEach((card) => {
        try {
          const placeLink = card.querySelector('a[href*="/maps/place/"]');
          if (!placeLink) return;

          let name = placeLink.getAttribute('aria-label') || '';
          if (!name) {
            const heading = card.querySelector('[role="heading"]');
            name = heading ? heading.textContent.trim() : '';
          }
          name = name.replace(/·.*$/, '').trim();
          if (!name || name.length < 2 || seenNames.has(name)) return;
          seenNames.add(name);

          const cardText = card.textContent;

          let hasWebsite = false;
          card.querySelectorAll('a, button').forEach(el => {
            if ((el.getAttribute('aria-label') || '').toLowerCase().includes('website')) hasWebsite = true;
          });
          card.querySelectorAll('a[href]').forEach(a => {
            if ((a.getAttribute('href') || '').match(/\/url\?.*q=http/i)) hasWebsite = true;
          });
          if (!hasWebsite && cardText.includes('Website')) hasWebsite = true;

          let rating = null;
          card.querySelectorAll('span[role="img"]').forEach(el => {
            const m = (el.getAttribute('aria-label') || '').match(/(\d+\.?\d*)\s*star/i);
            if (m) rating = m[1];
          });

          let reviews = null;
          const rm = cardText.match(/\(([\d,]+)\)/);
          if (rm) reviews = rm[1];

          let address = null;
          const leafTexts = Array.from(card.querySelectorAll('span'))
            .filter(el => el.children.length === 0)
            .map(el => el.textContent.trim())
            .filter(t => {
              if (!t || t.length < 5 || t.length > 150) return false;
              if (t === name || t === rating) return false;
              if (t.match(/^\d+\.?\d*$/) || t.match(/^\([\d,]+\)$/)) return false;
              if (t.match(/^(Open|Closed|Directions|Website|Call|Share|Save)/i)) return false;
              return true;
            });
          address = leafTexts.find(t => t.match(/^\d+\s+[A-Za-z]/) || (t.includes(',') && t.match(/[A-Za-z]{2,}/)))
            || leafTexts.find(t => t.match(/[A-Za-z]{3,}/) && t.length > 8)
            || null;

          results.push({ name, address, rating, reviews, hasWebsite, placeUrl: placeLink.href });
        } catch (e) {}
      });
      return results;
    });

    send('status', { message: `Found ${rawBusinesses.length} listings. Fetching phone numbers…` });
    send('total', { total: rawBusinesses.length });

    // Process 3 at a time, stream each result immediately as it completes
    const CONCURRENCY = 3;
    let completed = 0;

    async function processOne(biz) {
      const phone = await scrapePhoneFromListing(browser, biz.placeUrl);
      completed++;
      const { placeUrl, ...rest } = biz;
      send('business', { ...rest, phone });
      send('progress', { completed, total: rawBusinesses.length });
    }

    for (let i = 0; i < rawBusinesses.length; i += CONCURRENCY) {
      const chunk = rawBusinesses.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(biz => processOne(biz)));
    }

    send('done', { total: completed });
    res.end();
  } catch (err) {
    console.error('Stream error:', err.message);
    send('error', { message: err.message });
    res.end();
  } finally {
    clearInterval(keepAlive);
    if (browser) await browser.close().catch(() => {});
  }
});

// ── Debug endpoint ────────────────────────────────────────────────────────────
app.post('/api/debug', async (req, res) => {
  try {
    const { location, businessType } = req.body;
    const browser = await puppeteer.launch(getPuppeteerConfig());
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setViewport({ width: 1440, height: 900 });
    const q = encodeURIComponent(`${businessType} in ${location}`);
    try {
      await page.goto(`https://www.google.com/maps/search/${q}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch(e) {}
    await page.waitForSelector('div[role="feed"]', { timeout: 15000 }).catch(() => {});
    await autoScroll(page, 'div[role="feed"]');
    const raw = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return [];
      return Array.from(feed.children).map((card, i) => ({
        index: i,
        name: card.querySelector('a[href*="/maps/place/"]')?.getAttribute('aria-label') || '',
        anchors: Array.from(card.querySelectorAll('a[href]')).map(a => ({
          href: a.getAttribute('href')?.slice(0, 150),
          label: a.getAttribute('aria-label') || ''
        })),
        buttons: Array.from(card.querySelectorAll('button')).map(b => b.getAttribute('aria-label') || ''),
        text: card.textContent.slice(0, 400),
      }));
    });
    await browser.close();
    res.json({ count: raw.length, data: raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));