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
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (e) {
    console.log('Navigation timeout — continuing:', e.message);
  }

  // Dismiss consent if present
  try {
    const consentBtn = await page.$('button[aria-label*="Accept"], form[action*="consent"] button');
    if (consentBtn) {
      await consentBtn.click();
      await new Promise(r => setTimeout(r, 2000));
      console.log('Dismissed consent screen');
    }
  } catch (e) {}

  // Wait for feed
  const feedSelector = 'div[role="feed"]';
  try {
    await page.waitForSelector(feedSelector, { timeout: 15000 });
    console.log('Feed found');
  } catch (e) {
    console.log('Feed NOT found');
    await browser.close();
    return [];
  }

  // Scroll to load all results
  await autoScroll(page, feedSelector);
  await new Promise(r => setTimeout(r, 2000));

  // Click each listing and extract data from the detail panel
  const businesses = await page.evaluate(() => {
    const results = [];
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return results;

    const seenNames = new Set();

    // Strategy: get all direct children of feed (each is a listing card)
    const cards = Array.from(feed.children);
    console.log(`Total cards: ${cards.length}`);

    cards.forEach((card, idx) => {
      try {
        // Get all text content from the card
        const allSpans = Array.from(card.querySelectorAll('span'))
          .map(s => s.textContent.trim())
          .filter(t => t.length > 0);

        // Find the place link with aria-label (this is the business name)
        const placeLink = card.querySelector('a[href*="/maps/place/"]');
        if (!placeLink) return;

        // Name: prefer aria-label on the link, fallback to heading
        let name = placeLink.getAttribute('aria-label') || '';
        if (!name) {
          const heading = card.querySelector('[role="heading"]');
          name = heading ? heading.textContent.trim() : '';
        }
        // Clean name - remove trailing junk
        name = name.replace(/·.*$/, '').trim();

        if (!name || name.length < 2 || seenNames.has(name)) return;
        seenNames.add(name);

        // All links in card
        const allLinks = Array.from(card.querySelectorAll('a[href]'));

        // Website check - look for non-google external links or website aria-label
        let hasWebsite = false;
        allLinks.forEach(a => {
          const href = a.getAttribute('href') || '';
          const label = (a.getAttribute('aria-label') || '').toLowerCase();
          const dataVal = (a.getAttribute('data-value') || '').toLowerCase();
          if (
            label.includes('website') ||
            dataVal.includes('website') ||
            href.includes('/url?q=') ||          // Google redirect to external site
            href.includes('google.com/aclk') ||  // Ad click
            (href.startsWith('http') && !href.includes('google.com') && !href.includes('maps/place'))
          ) {
            hasWebsite = true;
          }
        });

        // Also check buttons for website indicator
        card.querySelectorAll('button').forEach(btn => {
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (label.includes('website')) hasWebsite = true;
        });

        // Rating: find span with role="img" and aria-label containing stars
        let rating = null;
        card.querySelectorAll('span[role="img"]').forEach(el => {
          const lbl = el.getAttribute('aria-label') || '';
          const m = lbl.match(/(\d+\.?\d*)\s*star/i) || lbl.match(/^(\d+\.?\d*)$/);
          if (m) rating = m[1];
        });

        // Reviews: find pattern like "(123)" or "123 reviews"
        let reviews = null;
        const cardText = card.textContent;
        const reviewMatch = cardText.match(/\((\d[\d,]*)\)/);
        if (reviewMatch) reviews = reviewMatch[1];

        // Phone: look for tel: links first (most reliable)
        let phone = null;
        allLinks.forEach(a => {
          const href = a.getAttribute('href') || '';
          if (href.startsWith('tel:')) {
            phone = href.replace('tel:', '').trim();
          }
        });
        // Fallback: scan text for phone patterns
        if (!phone) {
          const phoneMatch = cardText.match(/(\+?[\d][\d\s\-().]{6,18}[\d])/);
          if (phoneMatch) {
            const candidate = phoneMatch[1].trim();
            if (candidate.replace(/\D/g, '').length >= 7) phone = candidate;
          }
        }

        // Address: look for address-like text that isn't the name/phone/rating
        let address = null;
        const excludePatterns = [name, phone, rating, reviews].filter(Boolean);
        
        // Try to find text that looks like an address
        const textNodes = Array.from(card.querySelectorAll('span, div'))
          .filter(el => el.children.length === 0) // leaf nodes only
          .map(el => el.textContent.trim())
          .filter(t => {
            if (t.length < 5 || t.length > 150) return false;
            if (excludePatterns.some(p => t === p)) return false;
            if (t.match(/^\d+\.?\d*$/)) return false; // pure number
            if (t.match(/^\(\d+\)$/)) return false;   // review count
            // Must look somewhat address-like
            return t.match(/\d/) || t.match(/[A-Z][a-z]+.*[A-Z]/) || t.includes(',');
          });

        if (textNodes.length > 0) {
          // Prefer text with numbers (street addresses)
          address = textNodes.find(t => t.match(/^\d+\s+[A-Za-z]/) || t.match(/[A-Za-z]+.*,\s*[A-Za-z]/)) 
                    || textNodes[0];
        }

        results.push({ name, address, phone, rating, reviews, hasWebsite });
        console.log(`Card ${idx}: ${name} | website: ${hasWebsite} | phone: ${phone}`);
      } catch (err) {
        console.error(`Card ${idx} error:`, err.message);
      }
    });

    return results;
  });

  console.log(`Total extracted: ${businesses.length}`);
  console.log(`With website: ${businesses.filter(b => b.hasWebsite).length}`);
  console.log(`Without website: ${businesses.filter(b => !b.hasWebsite).length}`);

  await browser.close();

  // Return ALL businesses but flag website status
  // Filter to only those without websites
  return businesses.filter(b => !b.hasWebsite).map(({ hasWebsite, ...b }) => b);
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
      }, 700);
      setTimeout(() => { clearInterval(timer); resolve(); }, 25000);
    });
  }, feedSelector);

  await new Promise(r => setTimeout(r, 1500));
}

// Debug endpoint - returns ALL businesses (with and without websites)
app.post('/api/scrape-gmb-debug', async (req, res) => {
  try {
    const { location, businessType } = req.body;
    if (!location || !businessType) {
      return res.status(400).json({ success: false, error: 'Location and business type are required' });
    }

    console.log(`\nDEBUG Searching: ${businessType} in ${location}`);
    const browser = await puppeteer.launch(getPuppeteerConfig());
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await page.setViewport({ width: 1440, height: 900 });

    const searchQuery = encodeURIComponent(`${businessType} in ${location}`);
    try {
      await page.goto(`https://www.google.com/maps/search/${searchQuery}`, { waitUntil: 'networkidle2', timeout: 45000 });
    } catch(e) {}

    await page.waitForSelector('div[role="feed"]', { timeout: 15000 }).catch(() => {});
    await autoScroll(page, 'div[role="feed"]');

    const raw = await page.evaluate(() => {
      const feed = document.querySelector('div[role="feed"]');
      if (!feed) return [];
      return Array.from(feed.children).map((card, i) => ({
        index: i,
        hasPlaceLink: !!card.querySelector('a[href*="/maps/place/"]'),
        ariaLabel: card.querySelector('a[href*="/maps/place/"]')?.getAttribute('aria-label') || '',
        links: Array.from(card.querySelectorAll('a[href]')).map(a => ({ 
          href: a.getAttribute('href')?.slice(0, 120), 
          label: a.getAttribute('aria-label')?.slice(0, 80) 
        })),
        text: card.textContent.slice(0, 300),
      }));
    });

    await browser.close();
    res.json({ success: true, count: raw.length, data: raw });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    console.log(`Result: ${businesses.length} businesses without websites`);

    res.json({ success: true, count: businesses.length, location, businessType, data: businesses });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));