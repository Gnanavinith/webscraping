import express from 'express';
import cors from 'cors';
import puppeteer from 'puppeteer';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Puppeteer for Render
const getPuppeteerConfig = () => {
  const isRender = process.env.RENDER || false;
  
  return {
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
    executablePath: isRender ? undefined : undefined, // Let puppeteer use default Chrome locally
    env: {
      ...process.env,
      PUPPETEER_CACHE_DIR: path.join(__dirname, '.cache', 'puppeteer')
    }
  };
};

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
app.use(limiter);
app.use(cors());
app.use(express.json());

async function scrapeGoogleMaps(businessType, location) {
  console.log('Launching Puppeteer...');
  const config = getPuppeteerConfig();
  console.log('Puppeteer config:', JSON.stringify(config, null, 2));
  
  const browser = await puppeteer.launch(config);

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
    await page.screenshot({ path: 'debug-no-feed.png', fullPage: true });
    await browser.close();
    return [];
  }

  // Scroll to load all results
  await autoScroll(page, feedSelector);
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'debug-after-scroll.png', fullPage: true });

  // DIAGNOSTIC: dump feed structure so we can see what selectors to use
  const diagnostics = await page.evaluate(() => {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return { error: 'no feed' };

    const directChildren = Array.from(feed.children);

    const childSummaries = directChildren.slice(0, 5).map((child, i) => ({
      index: i,
      tag: child.tagName,
      classes: child.className,
      childCount: child.children.length,
      htmlSnippet: child.innerHTML.slice(0, 600),
      links: Array.from(child.querySelectorAll('a[href]')).map(a => ({
        href: a.getAttribute('href')?.slice(0, 100),
        label: a.getAttribute('aria-label')?.slice(0, 80),
        text: a.textContent.trim().slice(0, 60)
      })),
      ariaLabels: Array.from(child.querySelectorAll('[aria-label]')).map(el => ({
        tag: el.tagName,
        label: el.getAttribute('aria-label')?.slice(0, 100),
        text: el.textContent.trim().slice(0, 60)
      })).slice(0, 10),
      spans: Array.from(child.querySelectorAll('span')).map(s => s.textContent.trim()).filter(t => t).slice(0, 10),
    }));

    return {
      feedChildCount: directChildren.length,
      feedClasses: feed.className,
      children: childSummaries
    };
  });

  fs.writeFileSync('diagnostics.json', JSON.stringify(diagnostics, null, 2));
  console.log('\n=== DIAGNOSTICS SAVED TO diagnostics.json ===');
  console.log(`Feed has ${diagnostics.feedChildCount} direct children`);

  // EXTRACTION: anchor-first strategy — find all /maps/place/ links, walk up to card root
  const businesses = await page.evaluate(() => {
    const results = [];
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return results;

    const placeLinks = feed.querySelectorAll('a[href*="/maps/place/"]');
    console.log(`Found ${placeLinks.length} place links`);

    const seenNames = new Set();

    placeLinks.forEach(link => {
      try {
        // Walk up to the direct child of feed (the card root)
        let card = link;
        while (card.parentElement && card.parentElement !== feed) {
          card = card.parentElement;
        }
        if (card.parentElement !== feed) return;

        // Name
        let name = link.getAttribute('aria-label') || link.textContent.trim();
        const heading = card.querySelector('[role="heading"], h2, h3, span.fontHeadlineSmall');
        if (heading) name = heading.textContent.trim();
        if (!name || name.length < 2 || seenNames.has(name)) return;
        seenNames.add(name);

        // Rating
        let rating = null;
        const ratingEl = card.querySelector('span[role="img"][aria-label]');
        if (ratingEl) {
          const m = (ratingEl.getAttribute('aria-label') || '').match(/[\d.]+/);
          rating = m ? m[0] : null;
        }

        // Reviews
        let reviews = null;
        card.querySelectorAll('span[aria-label]').forEach(el => {
          const lbl = el.getAttribute('aria-label') || '';
          if (lbl.match(/review/i)) {
            const m = lbl.match(/[\d,]+/);
            if (m) reviews = m[0];
          }
        });
        if (!reviews) {
          const m = card.textContent.match(/\(([\d,]+)\)/);
          if (m) reviews = m[1];
        }

        // All visible text lines for address/phone
        const allText = Array.from(card.querySelectorAll('span, div'))
          .map(el => {
            if (el.children.length > 3) return '';
            return el.textContent.trim();
          })
          .filter(t => t.length > 2 && t.length < 120 && t !== name)
          .filter((t, i, arr) => arr.indexOf(t) === i);

        const phone = allText.find(t => t.match(/^(\+?[\d\s\-().]{7,20})$/) && t.match(/\d{4,}/)) || null;
        const address = allText.find(t =>
          t !== phone &&
          t.length > 8 &&
          (t.match(/\d/) || t.match(/,\s*[A-Z]/)) &&
          t.match(/[A-Za-z]{2,}/)
        ) || null;

        // Website detection
        let hasWebsite = false;
        card.querySelectorAll('a[href], button').forEach(el => {
          const href = el.getAttribute('href') || '';
          const label = (el.getAttribute('aria-label') || '').toLowerCase();
          if (
            label.includes('website') ||
            href.includes('/url?') ||
            href.includes('google.com/aclk') ||
            (href.startsWith('http') && !href.includes('google.com'))
          ) {
            hasWebsite = true;
          }
        });

        if (!hasWebsite) {
          results.push({ name, address, phone, rating, reviews });
        }
      } catch (err) {
        console.error('Card error:', err.message);
      }
    });

    return results;
  });

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
      }, 700);
      setTimeout(() => { clearInterval(timer); resolve(); }, 25000);
    });
  }, feedSelector);

  await new Promise(r => setTimeout(r, 1500));
}

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
