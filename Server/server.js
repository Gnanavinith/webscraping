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

async function scrapeGoogleMaps(businessType, location) {
  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch(getPuppeteerConfig());
  const page = await browser.newPage();

  // Block unnecessary resources (images, CSS, fonts) - speeds up by 40-60%
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
      req.abort(); // don't load images, CSS, fonts
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

  try {
    const consentBtn = await page.$('button[aria-label*="Accept"], form[action*="consent"] button');
    if (consentBtn) {
      await consentBtn.click();
      await new Promise(r => setTimeout(r, 1000)); // Reduced from 2000ms
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
  await new Promise(r => setTimeout(r, 800)); // Reduced from 2000ms

  // DEBUG: Log a sample card to see phone format
  const debugInfo = await page.evaluate(() => {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed || !feed.children[0]) return null;
    const firstCard = feed.children[0];
    return {
      fullText: firstCard.textContent.slice(0, 500),
      telLinks: Array.from(firstCard.querySelectorAll('a[href^="tel:"]')).map(a => a.href),
      allLinks: Array.from(firstCard.querySelectorAll('a')).map(a => ({ 
        href: a.href, 
        text: a.textContent.slice(0, 50) 
      })).slice(0, 10)
    };
  });
  if (debugInfo) {
    console.log('DEBUG - First card text:', debugInfo.fullText);
    console.log('DEBUG - Tel links:', debugInfo.telLinks);
  }

  const businesses = await page.evaluate(() => {
    const results = [];
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return results;

    const seenNames = new Set();
    const cards = Array.from(feed.children);
    console.log(`Total cards: ${cards.length}`);

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

        // ── Website detection (STRICT) ──────────────────────────────────
        // Google Maps only adds a "Website" button when the business has one.
        // We check aria-labels on anchors and buttons for the exact word "website".
        let hasWebsite = false;

        // Check anchor aria-labels
        card.querySelectorAll('a').forEach(a => {
          const label = (a.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes('website')) hasWebsite = true;
        });

        // Check button aria-labels
        if (!hasWebsite) {
          card.querySelectorAll('button').forEach(btn => {
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (label.includes('website')) hasWebsite = true;
          });
        }

        // Check for Google's external redirect links (/url?q=http...)
        // This is how Maps links to business websites
        if (!hasWebsite) {
          card.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href') || '';
            if (href.match(/\/url\?.*q=http/i)) hasWebsite = true;
          });
        }

        // ── Rating ──────────────────────────────────────────────────────
        let rating = null;
        card.querySelectorAll('span[role="img"]').forEach(el => {
          const lbl = el.getAttribute('aria-label') || '';
          const m = lbl.match(/(\d+\.?\d*)\s*star/i);
          if (m) rating = m[1];
        });

        // ── Reviews ─────────────────────────────────────────────────────
        let reviews = null;
        const cardText = card.textContent;
        const reviewMatch = cardText.match(/\(([\d,]+)\)/);
        if (reviewMatch) reviews = reviewMatch[1];

       
      // ── Phone ────────────────────────────────────────────────────────
let phone = null;
const telLink = card.querySelector('a[href^="tel:"]');
if (telLink) {
  phone = telLink.getAttribute('href').replace('tel:', '').trim();
}

if (!phone) {
  const phonePatterns = [
    /\+?1?[\s\-\.]?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/,  // (801) 423-1345
    /\+91[\s\-]?[6-9]\d{9}/,   // Indian +91
    /\b[6-9]\d{9}\b/,           // Indian 10-digit mobile
    /\b0\d{10}\b/,              // Indian with leading 0
  ];

  for (const pattern of phonePatterns) {
    const m = cardText.match(pattern);
    if (m) {
      phone = m[0].trim();
      break;
    }
  }
}

        // ── Address ──────────────────────────────────────────────────────
        let address = null;
        const leafTexts = Array.from(card.querySelectorAll('span'))
          .filter(el => el.children.length === 0)
          .map(el => el.textContent.trim())
          .filter(t => {
            if (!t || t.length < 5 || t.length > 150) return false;
            if (t === name || t === phone || t === rating) return false;
            if (t.match(/^\d+\.?\d*$/) || t.match(/^\([\d,]+\)$/)) return false;
            return true;
          });

        address = leafTexts.find(t =>
          t.match(/^\d+\s+[A-Za-z]/) ||
          (t.includes(',') && t.match(/[A-Za-z]{2,}/))
        ) || null;

        console.log(`[${idx}] "${name}" | hasWebsite:${hasWebsite} | phone:${phone}`);

        if (!hasWebsite) {
          results.push({ name, address, phone, rating, reviews });
        }
      } catch (err) {
        console.error(`Card ${idx} error:`, err.message);
      }
    });

    return results;
  });

  console.log(`\nResult: ${businesses.length} businesses without websites`);
  await browser.close();
  return businesses;
}

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
      }, 400); // Reduced from 700ms
      setTimeout(() => { clearInterval(timer); resolve(); }, 15000); // Reduced from 25000ms
    });
  }, feedSelector);

  await new Promise(r => setTimeout(r, 800)); // Reduced from 1500ms
}

// ── Debug endpoint: inspect raw card data ───────────────────────────────────
app.post('/api/debug', async (req, res) => {
  try {
    const { location, businessType } = req.body;
    const browser = await puppeteer.launch(getPuppeteerConfig());
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setViewport({ width: 1440, height: 900 });

    const q = encodeURIComponent(`${businessType} in ${location}`);
    try { await page.goto(`https://www.google.com/maps/search/${q}`, { waitUntil: 'networkidle2', timeout: 45000 }); } catch(e) {}
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
        text: card.textContent.slice(0, 300),
      }));
    });

    await browser.close();
    res.json({ count: raw.length, data: raw });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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