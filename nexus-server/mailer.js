const nodemailer = require('nodemailer');

function buildTransport(cfg) {
  if (cfg.smtpHost) {
    return nodemailer.createTransport({
      host: cfg.smtpHost,
      port: parseInt(cfg.smtpPort) || 587,
      secure: parseInt(cfg.smtpPort) === 465,
      auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    });
  }
  // Gmail shorthand
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });
}

async function sendJobAlert({ emailCfg, jobs, connectionName }) {
  if (!emailCfg?.enabled || !emailCfg.address || !emailCfg.smtpUser || !emailCfg.smtpPass) return;
  if (!jobs || jobs.length === 0) return;

  const transport = buildTransport(emailCfg);

  const jobRows = jobs.map(j => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #0d2040;">
        <div style="font-weight:600;color:#e8f4ff;font-size:14px;">${escHtml(j.title)}</div>
        <div style="font-size:12px;color:#4a9abe;margin-top:4px;">${escHtml(connectionName)}</div>
      </td>
      <td style="padding:12px 16px;border-bottom:1px solid #0d2040;text-align:right;white-space:nowrap;">
        <a href="${j.link}" style="display:inline-block;padding:6px 14px;background:#003a6b;color:#00cfff;text-decoration:none;border-radius:6px;font-size:12px;font-family:monospace;letter-spacing:0.05em;">VIEW →</a>
      </td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#000d1a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#001428,#002448);border:1px solid #003a6b;border-radius:12px;padding:28px;margin-bottom:20px;text-align:center;">
      <div style="font-family:monospace;font-size:11px;letter-spacing:0.25em;color:#4a9abe;text-transform:uppercase;margin-bottom:8px;">NEXUS / JOB INTEL</div>
      <div style="font-size:22px;font-weight:700;color:#00cfff;letter-spacing:0.05em;">
        ${jobs.length} New Opening${jobs.length > 1 ? 's' : ''} Detected
      </div>
      <div style="font-size:13px;color:#4a9abe;margin-top:8px;">${escHtml(connectionName)}</div>
    </div>

    <!-- Jobs table -->
    <div style="background:#00111e;border:1px solid #0d2040;border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <div style="padding:14px 16px;background:#001428;border-bottom:1px solid #0d2040;">
        <span style="font-family:monospace;font-size:11px;letter-spacing:0.15em;color:#4a9abe;text-transform:uppercase;">⬡ MATCHED ROLES</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${jobRows}
      </table>
    </div>

    <!-- Footer -->
    <div style="text-align:center;font-family:monospace;font-size:11px;color:#1a3a5a;letter-spacing:0.1em;">
      NEXUS AI CAREER SURVEILLANCE · ${new Date().toUTCString()}
    </div>
  </div>
</body>
</html>`;

  await transport.sendMail({
    from: `"NEXUS Job Intel" <${emailCfg.smtpUser}>`,
    to: emailCfg.address,
    subject: `[NEXUS] ${jobs.length} new opening${jobs.length > 1 ? 's' : ''} at ${connectionName}`,
    html,
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

module.exports = { sendJobAlert };
