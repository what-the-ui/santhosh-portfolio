// v2.0.0
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { load, save } = require('./store');
const { scrape } = require('./scraper');
const { sendJobAlert, sendColdEmail } = require('./mailer');
const { findHiringManager } = require('./apollo');
const { generateTailoredResume } = require('./resume-generator');
const { getAuthUrl, exchangeCode, getPortfolioVisitors } = require('./analytics');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

// ── In-memory store (persisted to data.json) ──
let db = load();

// ── Logging ──
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// ══════════════════════════════════════════
// SCAN ENGINE
// ══════════════════════════════════════════
async function scanConnection(conn) {
  log(`Scanning: ${conn.name} (${conn.url})`);
  conn.scanning = true;
  save(db);

  const result = await scrape(conn.url, conn.type);

  conn.scanning = false;
  conn.totalScans = (conn.totalScans || 0) + 1;
  conn.lastScan = new Date().toISOString();
  db.totalScans = (db.totalScans || 0) + 1;

  if (!result.ok) {
    conn.lastError = result.error;
    log(`  ✗ Scrape failed: ${result.error}`);
    save(db);
    return [];
  }

  // Apply keyword filter
  const keywords = conn.keywords || [];
  const matchMode = conn.matchMode || 'any';
  const filtered = keywords.length === 0 ? result.jobs : result.jobs.filter(j => {
    const title = j.title.toLowerCase();
    if (matchMode === 'all') return keywords.every(k => title.includes(k.toLowerCase()));
    return keywords.some(k => title.includes(k.toLowerCase()));
  });

  // Find genuinely new jobs
  const existingTitles = new Set(
    db.jobs.filter(j => j.connectionId === conn.id).map(j => j.title.toLowerCase())
  );
  const newJobs = filtered.filter(j => !existingTitles.has(j.title.toLowerCase()));

  if (newJobs.length > 0) {
    log(`  ✓ ${newJobs.length} new job(s) found`);
    const entries = await Promise.all(newJobs.map(async j => {
      let resume = null;
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          resume = await generateTailoredResume(j.title, conn.name);
          log(`  ✓ Resume generated for: ${j.title}`);
        } catch (e) {
          log(`  ✗ Resume generation failed: ${e.message}`);
        }
      }
      return {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        connectionId: conn.id,
        connectionName: conn.name,
        connectionEmoji: conn.emoji,
        title: j.title,
        link: j.link,
        foundAt: new Date().toISOString(),
        resume,
      };
    }));

    db.jobs = [...entries, ...db.jobs].slice(0, 1000);
    conn.jobsFound = (conn.jobsFound || 0) + newJobs.length;
    conn.lastError = null;

    // Send job alert email
    try {
      await sendJobAlert({
        emailCfg: db.settings.email,
        jobs: newJobs,
        connectionName: conn.name,
      });
    } catch (e) {
      log(`  ✗ Job alert email error: ${e.message}`);
    }

    // Apollo: find hiring manager and send cold email (once per connection, not per job)
    if (process.env.APOLLO_API_KEY) {
      try {
        const manager = await findHiringManager(conn.name);
        if (manager?.email) {
          log(`  → Hiring manager found: ${manager.fullName} <${manager.email}>`);
          await sendColdEmail({
            hiringManager: manager,
            jobTitle: newJobs[0].title,
            companyName: conn.name,
          });
          log(`  ✓ Cold email sent to ${manager.email}`);
        } else {
          log(`  · No hiring manager found on Apollo for ${conn.name}`);
        }
      } catch (e) {
        log(`  ✗ Apollo/cold email error: ${e.message}`);
      }
    }
  } else {
    log(`  · No new matches`);
    conn.lastError = null;
  }

  save(db);
  return newJobs;
}

function isDue(conn) {
  if (!conn.lastScan) return true;
  const intervals = { '1h': 3600000, '6h': 21600000, '12h': 43200000, '24h': 86400000 };
  const ms = intervals[conn.frequency || '6h'] || 21600000;
  return Date.now() - new Date(conn.lastScan).getTime() >= ms;
}

async function scanAll() {
  const active = db.connections.filter(c => c.active && isDue(c));
  if (active.length === 0) { log('No connections due for scan'); return; }

  log(`=== Auto-scan starting: ${active.length} connection(s) ===`);
  db.lastScanAt = new Date().toISOString();

  for (const conn of active) {
    await scanConnection(conn);
    // Small delay between requests to avoid hammering servers
    await new Promise(r => setTimeout(r, 1500));
  }

  log('=== Scan complete ===');
  save(db);
}

// ══════════════════════════════════════════
// CRON SCHEDULER
// ══════════════════════════════════════════
let cronJob = null;

function startCron() {
  if (cronJob) cronJob.stop();
  const expr = '0 * * * *'; // run hourly; per-connection frequency checked in isDue()
  cronJob = cron.schedule(expr, () => { scanAll(); }, { timezone: 'UTC' });
  log(`Cron scheduled: "${expr}"`);
}

startCron();

// ══════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    connections: db.connections.length,
    activeConnections: db.connections.filter(c => c.active).length,
    totalJobs: db.jobs.length,
    lastScanAt: db.lastScanAt,
    totalScans: db.totalScans,
    cronExpression: db.settings.frequency,
    nextScan: getNextScanTime(),
  });
});

function getNextScanTime() {
  try {
    // Simple: parse the cron and compute next fire
    const freq = db.settings.frequencyLabel || '6h';
    const ms = { '1h': 3600000, '6h': 21600000, '12h': 43200000, '24h': 86400000 }[freq] || 21600000;
    return db.lastScanAt ? new Date(new Date(db.lastScanAt).getTime() + ms).toISOString() : null;
  } catch { return null; }
}

// Connections
app.get('/api/connections', (req, res) => {
  res.json(db.connections);
});

app.post('/api/connections', (req, res) => {
  const conn = {
    id: Date.now().toString(),
    name: req.body.name,
    emoji: req.body.emoji || '🏢',
    url: req.body.url,
    type: req.body.type || 'custom',
    platform: req.body.platform || 'Custom',
    active: true,
    keywords: req.body.keywords || [],
    matchMode: req.body.matchMode || 'any',
    lastScan: null,
    jobsFound: 0,
    totalScans: 0,
    createdAt: new Date().toISOString(),
  };
  if (!conn.name || !conn.url) return res.status(400).json({ error: 'name and url required' });
  db.connections.push(conn);
  save(db);
  log(`Connection added: ${conn.name}`);
  res.json(conn);
});

app.patch('/api/connections/:id', (req, res) => {
  const conn = db.connections.find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  const allowed = ['active', 'keywords', 'matchMode', 'name', 'emoji', 'url', 'frequency'];
  allowed.forEach(k => { if (req.body[k] !== undefined) conn[k] = req.body[k]; });
  save(db);
  res.json(conn);
});

app.delete('/api/connections/:id', (req, res) => {
  const idx = db.connections.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [removed] = db.connections.splice(idx, 1);
  save(db);
  log(`Connection removed: ${removed.name}`);
  res.json({ ok: true });
});

// Scan triggers
app.post('/api/scan', async (req, res) => {
  // Accept emailCfg from browser so email works even before env vars are set
  if (req.body?.emailCfg) db.settings.email = { ...db.settings.email, ...req.body.emailCfg };
  res.json({ ok: true, message: 'Scan started' });
  await scanAll();
});

app.post('/api/scan/:id', async (req, res) => {
  const conn = db.connections.find(c => c.id === req.params.id);
  if (!conn) return res.status(404).json({ error: 'not found' });
  if (req.body?.emailCfg) db.settings.email = { ...db.settings.email, ...req.body.emailCfg };
  res.json({ ok: true, message: `Scanning ${conn.name}` });
  await scanConnection(conn);
});

// Jobs feed
app.get('/api/jobs', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  res.json(db.jobs.slice(0, limit));
});

app.delete('/api/jobs', (req, res) => {
  db.jobs = [];
  db.connections.forEach(c => c.jobsFound = 0);
  save(db);
  res.json({ ok: true });
});

// Settings
app.get('/api/settings', (req, res) => {
  // Never send SMTP password to frontend
  const safe = JSON.parse(JSON.stringify(db.settings));
  if (safe.email) safe.email.smtpPass = safe.email.smtpPass ? '••••••••' : '';
  res.json({ ...safe, totalScans: db.totalScans, lastScanAt: db.lastScanAt });
});

app.post('/api/settings', (req, res) => {
  const { frequency, frequencyLabel, email } = req.body;
  if (frequency) {
    db.settings.frequency = frequency;
    db.settings.frequencyLabel = frequencyLabel || '6h';
    startCron(); // restart with new expression
  }
  if (email) {
    if (!db.settings.email) db.settings.email = {};
    Object.assign(db.settings.email, email);
    // Don't overwrite password if placeholder sent
    if (email.smtpPass === '••••••••') delete db.settings.email.smtpPass;
  }
  save(db);
  log('Settings updated');

  const safe = JSON.parse(JSON.stringify(db.settings));
  if (safe.email) safe.email.smtpPass = safe.email.smtpPass ? '••••••••' : '';
  res.json(safe);
});

// Test email — accepts emailCfg from request body (browser localStorage)
// or falls back to server-stored config or env vars
app.post('/api/test-email', async (req, res) => {
  try {
    const emailCfg = req.body?.emailCfg || db.settings.email;
    await sendJobAlert({
      emailCfg,
      jobs: [{ title: 'Senior Product Designer (Test)', link: 'https://example.com/careers' }],
      connectionName: "Santhosh's Job Tracker — Test",
    });
    log('Test email sent successfully');
    res.json({ ok: true });
  } catch (e) {
    log(`Test email failed: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Portfolio analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const data = await getPortfolioVisitors(db.settings.gaRefreshToken);
    res.json({ ok: true, ...data });
  } catch (e) {
    log(`Analytics error: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message, needsAuth: !db.settings.gaRefreshToken });
  }
});

// Google OAuth2 flow — visit once to authorize GA access
app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.send('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Render environment variables first.');
  }
  res.redirect(getAuthUrl());
});

app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing authorization code');
  try {
    const tokens = await exchangeCode(code);
    db.settings.gaRefreshToken = tokens.refresh_token;
    save(db);
    log('GA refresh token saved successfully');
    res.send(`
      <html><body style="font-family:monospace;background:#000d1a;color:#00cfff;padding:40px;text-align:center;">
        <h2>✓ Google Analytics Connected</h2>
        <p style="color:#4a9abe;">Portfolio visitor data will now appear on your job tracker.</p>
        <p style="color:#4a9abe;">You can close this tab.</p>
      </body></html>
    `);
  } catch (e) {
    log(`OAuth callback error: ${e.message}`);
    res.status(500).send(`Auth failed: ${e.message}`);
  }
});

// Test cold email
app.post('/api/test-cold-email', async (req, res) => {
  try {
    await sendColdEmail({
      hiringManager: {
        name: req.body?.managerName || 'Hiring Manager',
        email: req.body?.managerEmail || process.env.ALERT_EMAIL,
        fullName: req.body?.managerName || 'Test Hiring Manager',
      },
      jobTitle: req.body?.jobTitle || 'Head of Design (Test)',
      companyName: req.body?.companyName || 'Acme Corp',
    });
    log('Test cold email sent');
    res.json({ ok: true });
  } catch (e) {
    log(`Test cold email failed: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ──────────────────────────────────────────
app.listen(PORT, () => {
  log(`NEXUS server running on port ${PORT}`);
  log(`Connections: ${db.connections.length}, Jobs stored: ${db.jobs.length}`);

  // Keep-alive self-ping (prevents Render free tier from sleeping)
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
  if (selfUrl) {
    const http = require('https');
    setInterval(() => {
      http.get(`${selfUrl}/api/health`, () => {}).on('error', () => {});
      log('Keep-alive ping sent');
    }, 10 * 60 * 1000); // every 10 minutes
  }
});
