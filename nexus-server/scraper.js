const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(url) {
  const resp = await axios.get(url, {
    headers: HEADERS,
    timeout: 20000,
    maxRedirects: 5,
  });
  return resp.data;
}

function parseJobs(html, url, type) {
  const $ = cheerio.load(html);
  const jobs = [];
  const seen = new Set();

  const add = (title, link) => {
    title = title?.trim().replace(/\s+/g, ' ');
    if (!title || title.length < 4 || title.length > 120) return;
    if (seen.has(title.toLowerCase())) return;
    seen.add(title.toLowerCase());
    jobs.push({ title, link: resolveLink(link, url) });
  };

  // ── Greenhouse ──
  if (type === 'greenhouse' || url.includes('greenhouse.io')) {
    $('div.opening a, .job-post a, [class*="opening"] a').each((_, el) => {
      add($(el).text(), $(el).attr('href'));
    });
    $('h3.title, .opening h3').each((_, el) => {
      const link = $(el).closest('a').attr('href') || $(el).parent().find('a').attr('href');
      add($(el).text(), link);
    });
  }

  // ── Lever ──
  if (type === 'lever' || url.includes('lever.co')) {
    $('a.posting-title, .posting-name h5').each((_, el) => {
      const a = $(el).is('a') ? $(el) : $(el).closest('a');
      add($(el).find('h5').text() || $(el).text(), a.attr('href'));
    });
  }

  // ── Ashby ──
  if (url.includes('ashbyhq.com') || url.includes('jobs.ashby')) {
    $('a[href*="/jobs/"]').each((_, el) => {
      add($(el).text(), $(el).attr('href'));
    });
  }

  // ── Workday ──
  if (type === 'workday' || url.includes('myworkdayjobs.com')) {
    $('[data-automation-id="jobTitle"], .css-19uc56f').each((_, el) => {
      const link = $(el).closest('a').attr('href');
      add($(el).text(), link);
    });
  }

  // ── Framer sites (careers.puffy.com etc.) ──
  $('p.framer-text, [class*="framer"] p').each((_, el) => {
    const text = $(el).text().trim();
    if (!isJobTitle(text)) return;
    const link = $(el).closest('a').attr('href') || $(el).parents().toArray().reduce((found, p) => {
      if (found) return found;
      const a = $(p).find('a[href]').first();
      return a.length ? a.attr('href') : null;
    }, null);
    add(text, link);
  });

  // ── Generic selectors ──
  const selectors = [
    '[class*="job-title"] a', '[class*="jobtitle"] a', '[class*="position-title"] a',
    '[class*="role-title"] a', '[class*="opening-title"] a',
    'h2 a', 'h3 a', 'h4 a',
    'a h2', 'a h3', 'a h4', 'a p',
    '[class*="job"] h2', '[class*="job"] h3', '[class*="job"] h4',
    '[class*="position"] h2', '[class*="position"] h3',
    '[class*="career"] h2', '[class*="career"] h3',
    '[class*="role"] h2', '[class*="role"] h3', '[class*="role"] p',
    '[data-qa*="job"] a', '[data-testid*="job"] a',
    'li[class*="job"] a', 'li[class*="posting"] a', 'li[class*="opening"] a',
    '.job-card a', '.job-listing a', '.career-listing a', '.jobs-list a',
    '[class*="job-card"] a', '[class*="job-item"] a',
    'a[href*="/role"] p', 'a[href*="/roles"] p', 'a[href*="/job"] p', 'a[href*="/careers"] p',
  ];

  selectors.forEach(sel => {
    try {
      $(sel).each((_, el) => {
        const text = $(el).text().trim();
        const href = $(el).attr('href') || $(el).closest('a').attr('href');
        if (isJobTitle(text)) add(text, href);
      });
    } catch {}
  });

  // ── Link text fallback ──
  $('a').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (isJobTitle(text) && /job|career|position|role|opening|apply/i.test(href)) {
      add(text, href);
    }
  });

  return jobs.slice(0, 50);
}

const STOP_WORDS = ['about', 'contact', 'home', 'login', 'sign in', 'sign up',
  'learn more', 'read more', 'see all', 'view all', 'apply now', 'cookie',
  'privacy', 'terms', 'search', 'filter', 'sort by', 'next', 'previous',
  'back', 'submit', 'cancel', 'close', 'menu', 'blog', 'news'];

const JOB_WORDS = ['engineer', 'designer', 'manager', 'developer', 'analyst',
  'scientist', 'director', 'lead', 'senior', 'junior', 'associate', 'head of',
  'vp ', 'vice president', 'president', 'architect', 'specialist', 'coordinator',
  'consultant', 'recruiter', 'marketing', 'sales', 'product', 'operations',
  'finance', 'legal', 'data', 'software', 'frontend', 'backend', 'fullstack',
  'full-stack', 'devops', 'infrastructure', 'security', 'ios', 'android',
  'mobile', 'brand', 'content', 'ux', 'ui ', 'growth', 'strategy', 'research',
  'writer', 'editor', 'copywriter', 'illustrator', 'motion', 'visual',
  'principal', 'staff ', 'intern', 'apprentice', 'fellow'];

function isJobTitle(text) {
  if (!text || text.length < 4 || text.length > 100) return false;
  const lower = text.toLowerCase();
  if (STOP_WORDS.some(w => lower.startsWith(w))) return false;
  return JOB_WORDS.some(w => lower.includes(w));
}

function resolveLink(link, base) {
  if (!link) return base;
  if (link.startsWith('http')) return link;
  if (link.startsWith('//')) return 'https:' + link;
  try { return new URL(link, base).href; } catch { return base; }
}

async function scrape(url, type) {
  try {
    const html = await fetchPage(url);
    const jobs = parseJobs(html, url, type);
    return { ok: true, jobs };
  } catch (e) {
    return { ok: false, jobs: [], error: e.message };
  }
}

async function scrapeLinkedIn(companyName, keywords) {
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) return { ok: false, jobs: [], error: 'JSEARCH_API_KEY not set — add it in Render env vars' };

  const query = keywords.length > 0
    ? `${keywords.join(' OR ')} at ${companyName}`
    : companyName;

  try {
    const resp = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: { query, num_results: '20', date_posted: 'all' },
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
      timeout: 15000,
    });

    const jobs = (resp.data.data || []).map(j => ({
      title: j.job_title,
      link: j.job_apply_link || j.job_google_link || `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(j.job_title)}`,
    }));

    return { ok: true, jobs };
  } catch (e) {
    return { ok: false, jobs: [], error: `JSearch error: ${e.message}` };
  }
}

module.exports = { scrape, scrapeLinkedIn };
