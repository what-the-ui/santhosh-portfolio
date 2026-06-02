// v2.1 — JSON APIs + hardened generic scraper
const axios = require('axios');
const cheerio = require('cheerio');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function fetchPage(url) {
  const resp = await axios.get(url, { headers: HEADERS, timeout: 20000, maxRedirects: 5 });
  return resp.data;
}

// ── Extract company slug from URL ──
function extractSlug(url, platform) {
  try {
    const u = new URL(url);
    if (platform === 'greenhouse') return u.pathname.split('/').filter(Boolean)[0];
    if (platform === 'lever') return u.pathname.split('/').filter(Boolean)[0];
    if (platform === 'ashby') return u.hostname.split('.')[0] !== 'jobs' ? u.hostname.split('.')[0] : u.pathname.split('/').filter(Boolean)[0];
  } catch {}
  return null;
}

// ── Greenhouse JSON API ──
async function scrapeGreenhouse(url) {
  const slug = extractSlug(url, 'greenhouse') || url.split('greenhouse.io/').pop()?.split('/')[0]?.split('?')[0];
  if (!slug) return null;
  try {
    const resp = await axios.get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, { timeout: 15000 });
    const jobs = (resp.data.jobs || []).map(j => ({ title: j.title, link: j.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${j.id}` }));
    return { ok: true, jobs };
  } catch { return null; }
}

// ── Lever JSON API ──
async function scrapeLever(url) {
  const slug = extractSlug(url, 'lever') || url.split('lever.co/').pop()?.split('/')[0]?.split('?')[0];
  if (!slug) return null;
  try {
    const resp = await axios.get(`https://api.lever.co/v0/postings/${slug}?mode=json`, { timeout: 15000 });
    const jobs = (resp.data || []).map(j => ({ title: j.text, link: j.hostedUrl || `https://jobs.lever.co/${slug}/${j.id}` }));
    return { ok: true, jobs };
  } catch { return null; }
}

// ── Ashby JSON API ──
async function scrapeAshby(url) {
  let slug = null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('ashbyhq.com')) slug = u.pathname.split('/').filter(Boolean)[0];
    else if (u.hostname.includes('jobs.ashby')) slug = u.hostname.split('.')[0];
    else slug = u.hostname.split('.')[0];
  } catch {}
  if (!slug) return null;
  try {
    const resp = await axios.post(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {}, { timeout: 15000 });
    const jobs = (resp.data.jobPostings || []).map(j => ({
      title: j.title,
      link: j.externalLink || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    }));
    return { ok: true, jobs };
  } catch { return null; }
}

// ── Workday ──
async function scrapeWorkday(url, html) {
  const $ = cheerio.load(html);
  const jobs = [];
  const seen = new Set();
  $('[data-automation-id="jobTitle"], .css-19uc56f, [class*="jobTitle"]').each((_, el) => {
    const title = $(el).text().trim();
    const link = $(el).closest('a').attr('href') || $(el).parents('a').first().attr('href');
    if (title && !seen.has(title.toLowerCase())) {
      seen.add(title.toLowerCase());
      jobs.push({ title, link: resolveLink(link, url) });
    }
  });
  return jobs.length ? { ok: true, jobs } : null;
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

  // ── Greenhouse HTML fallback ──
  if (type === 'greenhouse' || url.includes('greenhouse.io')) {
    $('div.opening a, .job-post a, [class*="opening"] a, .job-posts a').each((_, el) => add($(el).text(), $(el).attr('href')));
    $('h3.title, .opening h3, .job-post h3').each((_, el) => {
      const link = $(el).closest('a').attr('href') || $(el).parent().find('a').attr('href');
      add($(el).text(), link);
    });
  }

  // ── Lever HTML fallback ──
  if (type === 'lever' || url.includes('lever.co')) {
    $('a.posting-title, .posting-name h5, [class*="posting-title"]').each((_, el) => {
      const a = $(el).is('a') ? $(el) : $(el).closest('a');
      add($(el).find('h5').text() || $(el).text(), a.attr('href'));
    });
  }

  // ── Ashby HTML fallback ──
  if (url.includes('ashbyhq.com') || url.includes('jobs.ashby')) {
    $('a[href*="/jobs/"]').each((_, el) => add($(el).text(), $(el).attr('href')));
    $('[class*="job"] h3, [class*="job"] h4, [class*="posting"] h3').each((_, el) => {
      add($(el).text(), $(el).closest('a').attr('href') || $(el).parent().find('a').first().attr('href'));
    });
  }

  // ── Framer sites ──
  $('p.framer-text, [data-framer-name] p').each((_, el) => {
    const text = $(el).text().trim();
    if (!isJobTitle(text)) return;
    const link = $(el).closest('a').attr('href') ||
      $(el).parents().toArray().reduce((found, p) => found || ($(p).find('a[href]').first().attr('href') || null), null);
    add(text, link);
  });

  // ── Smartrecruiters ──
  if (url.includes('smartrecruiters.com')) {
    $('[class*="job-title"], .details-title h2, a[class*="job"]').each((_, el) => {
      add($(el).text(), $(el).is('a') ? $(el).attr('href') : $(el).closest('a').attr('href'));
    });
  }

  // ── BambooHR ──
  if (url.includes('bamboohr.com')) {
    $('li.ResumentCard a, .ResumentCard__title, [class*="ResumentCard"] a').each((_, el) => {
      add($(el).text(), $(el).attr('href') || $(el).closest('a').attr('href'));
    });
  }

  // ── Rippling / Rippling Jobs ──
  if (url.includes('rippling.com') || url.includes('ats.rippling')) {
    $('[class*="job-title"], [class*="jobTitle"], h3, h4').each((_, el) => {
      add($(el).text(), $(el).closest('a').attr('href') || $(el).parent().find('a').first().attr('href'));
    });
  }

  // ── Generic selectors (broad net) ──
  const selectors = [
    // Anchors with job-like class names
    '[class*="job-title"] a', '[class*="jobtitle"] a', '[class*="position-title"] a',
    '[class*="role-title"] a', '[class*="opening-title"] a', '[class*="listing-title"] a',
    // Headings inside anchors
    'a h1', 'a h2', 'a h3', 'a h4', 'a p',
    // Headings containing anchors
    'h1 a', 'h2 a', 'h3 a', 'h4 a',
    // Job/position/career/role containers
    '[class*="job"] h1', '[class*="job"] h2', '[class*="job"] h3', '[class*="job"] h4',
    '[class*="position"] h2', '[class*="position"] h3', '[class*="position"] h4',
    '[class*="career"] h2', '[class*="career"] h3',
    '[class*="role"] h2', '[class*="role"] h3', '[class*="role"] p',
    '[class*="opening"] h2', '[class*="opening"] h3',
    '[class*="listing"] h2', '[class*="listing"] h3',
    // Data attributes
    '[data-qa*="job"] a', '[data-testid*="job"] a', '[data-cy*="job"] a',
    '[data-qa*="position"] a', '[data-testid*="position"] a',
    // List items
    'li[class*="job"] a', 'li[class*="posting"] a', 'li[class*="opening"] a',
    'li[class*="position"] a', 'li[class*="role"] a', 'li[class*="career"] a',
    // Common card patterns
    '.job-card a', '.job-listing a', '.career-listing a', '.jobs-list a',
    '[class*="job-card"] a', '[class*="job-item"] a', '[class*="job-row"] a',
    // href-based
    'a[href*="/roles/"]', 'a[href*="/role/"]',
    'a[href*="/jobs/"]', 'a[href*="/job/"]',
    'a[href*="/careers/"]', 'a[href*="/career/"]',
    'a[href*="/openings/"]', 'a[href*="/opening/"]',
    'a[href*="/positions/"]', 'a[href*="/position/"]',
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

  // ── Broad link text fallback ──
  $('a').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href') || '';
    if (isJobTitle(text)) add(text, href);
  });

  return jobs.slice(0, 100);
}

const STOP_WORDS = ['about', 'contact', 'home', 'login', 'sign in', 'sign up',
  'learn more', 'read more', 'see all', 'view all', 'apply now', 'cookie',
  'privacy', 'terms', 'search', 'filter', 'sort by', 'next', 'previous',
  'back', 'submit', 'cancel', 'close', 'menu', 'blog', 'news', 'language',
  'english', 'benefits', 'culture', 'team', 'life at', 'our values'];

const JOB_WORDS = [
  'engineer', 'designer', 'manager', 'developer', 'analyst', 'scientist',
  'director', 'lead', 'senior', 'junior', 'associate', 'head of', 'vp',
  'vice president', 'architect', 'specialist', 'coordinator', 'consultant',
  'recruiter', 'marketing', 'sales', 'product', 'operations', 'finance',
  'legal', 'data', 'software', 'frontend', 'backend', 'fullstack', 'full-stack',
  'devops', 'infrastructure', 'security', 'ios', 'android', 'mobile', 'brand',
  'content', 'ux', 'ui/', 'ui-', 'ui ', 'growth', 'strategy', 'research',
  'writer', 'editor', 'copywriter', 'illustrator', 'motion', 'visual',
  'principal', 'staff', 'intern', 'apprentice', 'fellow', 'creative',
  'program manager', 'project manager', 'account manager', 'customer success',
  'support', 'partnership', 'business development', 'revenue', 'design',
];

function isJobTitle(text) {
  if (!text || text.length < 4 || text.length > 120) return false;
  const lower = text.toLowerCase();
  if (STOP_WORDS.some(w => lower === w || lower.startsWith(w + ' '))) return false;
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
    // Try JSON APIs first for known platforms
    if (type === 'greenhouse' || url.includes('greenhouse.io')) {
      const result = await scrapeGreenhouse(url);
      if (result) return result;
    }
    if (type === 'lever' || url.includes('lever.co')) {
      const result = await scrapeLever(url);
      if (result) return result;
    }
    if (url.includes('ashbyhq.com') || url.includes('jobs.ashby')) {
      const result = await scrapeAshby(url);
      if (result) return result;
    }

    // Fall back to HTML scraping
    const html = await fetchPage(url);

    if (type === 'workday' || url.includes('myworkdayjobs.com')) {
      const result = await scrapeWorkday(url, html);
      if (result) return result;
    }

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
      headers: { 'X-RapidAPI-Key': apiKey, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' },
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
