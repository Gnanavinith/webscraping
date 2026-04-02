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

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use(limiter);
app.use(cors());
app.use(express.json());

// ── Scrape phone from individual listing page ────────────────────────────────
async function scrapePhoneFromListing(browser, placeUrl) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

    try {
      await page.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch (e) {
      console.log('Listing page timeout — continuing:', e.message);
    }

    // Wait a moment for dynamic content
    await new Promise(r => setTimeout(r, 1500));

    const phone = await page.evaluate(() => {
      // Strategy 1: tel: link (most reliable)
      const telLink = document.querySelector('a[href^="tel:"]');
      if (telLink) {
        return telLink.getAttribute('href').replace('tel:', '').trim();
      }

      // Strategy 2: aria-label on buttons containing phone digits
      const buttons = Array.from(document.querySelectorAll('button[aria-label], a[aria-label]'));
      for (const btn of buttons) {
        const label = btn.getAttribute('aria-label') || '';
        // Indian: 10-digit starting with 6-9, or +91 prefix
        const indMatch = label.match(/(\+91[\s\-]?[6-9]\d{9}|\b[6-9]\d{9}\b)/);
        if (indMatch) return indMatch[1];
        // International: (XXX) XXX-XXXX or XXX-XXX-XXXX
        const intMatch = label.match(/(\+?1?[\s\-\.]?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4})/);
        if (intMatch) return intMatch[1].trim();
      }

      // Strategy 3: scan full page text for phone patterns
      const bodyText = document.body.innerText;
      const patterns = [
        /\+91[\s\-]?[6-9]\d{9}/,
        /\b[6-9]\d{9}\b/,
        /\+?1?[\s\-\.]?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/,
        /\b\d{3}[\s\-\.]\d{3}[\s\-\.]\d{4}\b/,
      ];
      for (const pattern of patterns) {
        const m = bodyText.match(pattern);
        if (m) return m[0].trim();
      }

      return null;
    });

    return phone;
  } catch (err) {
    console.error('Error scraping listing page:', err.message);
    return null;
  } finally {
    await page.close();
  }
}

// ── Run N async tasks with concurrency limit ─────────────────────────────────
async function runWithConcurrency(tasks, concurrency) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return results;
}

// ── Main scraper ─────────────────────────────────────────────────────────────
async function scrapeGoogleMaps(businessType, location) {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch(getPuppeteerConfig());
  const page = await browser.newPage();

  // Block unnecessary resources
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1440, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  const searchQuery = encodeURIComponent(`${businessType} in ${location}`);
  const url = `https://www.google.com/maps/search/${searchQuery}`;
  console.log(`Navigating to: ${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    console.log('Navigation timeout — continuing:', e.message);
  }

  // Dismiss consent screen if present
  try {
    const consentBtn = await page.$('button[aria-label*="Accept"], form[action*="consent"] button');
    if (consentBtn) {
      await consentBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) {}

  const feedSelector = 'div[role="feed"]';
  try {
    await page.waitForSelector(feedSelector, { timeout: 15000 });
    console.log('Feed found');
  } catch (e) {
    console.log('Feed NOT found');
    await browser.close();
    return [];
  }

  await autoScroll(page, feedSelector);
  await new Promise(r => setTimeout(r, 800));

  // Extract basic info + place URLs from the feed
  const rawBusinesses = await page.evaluate(() => {
    const results = [];
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return results;

    const seenNames = new Set();
    const cards = Array.from(feed.children);

    cards.forEach((card, idx) => {
      try {
        const placeLink = card.querySelector('a[href*="/maps/place/"]');
        if (!placeLink) return;

        // Name
        let name = placeLink.getAttribute('aria-label') || '';
        if (!name) {
          const heading = card.querySelector('[role="heading"]');
          name = heading ? heading.textContent.trim() : '';
        }
        name = name.replace(/·.*$/, '').trim();
        if (!name || name.length < 2 || seenNames.has(name)) return;
        seenNames.add(name);

        const cardText = card.textContent;

        // Website detection
        let hasWebsite = false;
        card.querySelectorAll('a').forEach(a => {
          if ((a.getAttribute('aria-label') || '').toLowerCase().includes('website')) hasWebsite = true;
        });
        if (!hasWebsite) {
          card.querySelectorAll('button').forEach(btn => {
            if ((btn.getAttribute('aria-label') || '').toLowerCase().includes('website')) hasWebsite = true;
          });
        }
        if (!hasWebsite) {
          card.querySelectorAll('a[href]').forEach(a => {
            if ((a.getAttribute('href') || '').match(/\/url\?.*q=http/i)) hasWebsite = true;
          });
        }
        if (!hasWebsite && cardText.includes('Website')) hasWebsite = true;

        // Rating
        let rating = null;
        card.querySelectorAll('span[role="img"]').forEach(el => {
          const m = (el.getAttribute('aria-label') || '').match(/(\d+\.?\d*)\s*star/i);
          if (m) rating = m[1];
        });

        // Reviews
        let reviews = null;
        const reviewMatch = cardText.match(/\(([\d,]+)\)/);
        if (reviewMatch) reviews = reviewMatch[1];

        // Address
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

        address = leafTexts.find(t =>
          t.match(/^\d+\s+[A-Za-z]/) ||
          (t.includes(',') && t.match(/[A-Za-z]{2,}/))
        ) || leafTexts.find(t =>
          t.match(/[A-Za-z]{3,}/) && t.length > 8
        ) || null;

        // Place URL for detail scraping
        const placeUrl = placeLink.href;

        results.push({ name, address, rating, reviews, hasWebsite, placeUrl });
      } catch (err) {
        console.error(`Card ${idx} error:`, err.message);
      }
    });

    return results;
  });

  console.log(`\nFound ${rawBusinesses.length} businesses in feed. Now scraping phone numbers...`);

  // Scrape phones from individual listing pages (concurrency = 4)
  const tasks = rawBusinesses.map(biz => async () => {
    console.log(`Fetching phone for: ${biz.name}`);
    const phone = await scrapePhoneFromListing(browser, biz.placeUrl);
    console.log(`  → ${phone || 'not found'}`);
    return { ...biz, phone, placeUrl: undefined }; // remove placeUrl from output
  });

  const businesses = await runWithConcurrency(tasks, 4);

  console.log(`\nDone. Total businesses: ${businesses.length}`);
  await browser.close();
  return businesses;
}

// ── Auto-scroll feed ─────────────────────────────────────────────────────────
async function autoScroll(page, feedSelector) {
  await page.evaluate(async (selector) => {
    const feed = document.querySelector(selector);
    if (!feed) return;
    const scrollable = feed.closest('[role="main"]') || feed.parentElement;

    await new Promise(resolve => {
      let lastHeight = 0;
      let sameCount = 0;
      const timer = setInterval(() => {
        scrollable.scrollBy(0, 800);
        const newHeight = scrollable.scrollHeight;
        if (newHeight === lastHeight) {
          sameCount++;
          if (sameCount >= 5) { clearInterval(timer); resolve(); }
        } else {
          sameCount = 0;
          lastHeight = newHeight;
        }
      }, 400);
      setTimeout(() => { clearInterval(timer); resolve(); }, 15000);
    });
  }, feedSelector);

  await new Promise(r => setTimeout(r, 800));
}

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

// ── Main scrape endpoint ──────────────────────────────────────────────────────
app.post('/api/scrape-gmb', async (req, res) => {
  try {
    const { location, businessType } = req.body;
    if (!location || !businessType) {
      return res.status(400).json({ success: false, error: 'Location and business type are required' });
    }

    console.log(`\nSearching: ${businessType} in ${location}`);
    const businesses = await scrapeGoogleMaps(businessType, location);

    res.json({ success: true, count: businesses.length, location, businessType, data: businesses });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));