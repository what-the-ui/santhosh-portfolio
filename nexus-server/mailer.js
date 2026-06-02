const { Resend } = require('resend');

async function sendJobAlert({ emailCfg, jobs, connectionName }) {
  const apiKey = emailCfg?.resendApiKey || process.env.RESEND_API_KEY;
  const toAddress = emailCfg?.address || process.env.ALERT_EMAIL;

  if (!apiKey) throw new Error('No Resend API key configured. Set RESEND_API_KEY in Render environment variables.');
  if (!toAddress) throw new Error('No alert email address configured. Set ALERT_EMAIL in Render environment variables.');
  if (!jobs || jobs.length === 0) return;

  const resend = new Resend(apiKey);

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
    <div style="background:linear-gradient(135deg,#001428,#002448);border:1px solid #003a6b;border-radius:12px;padding:28px;margin-bottom:20px;text-align:center;">
      <div style="font-family:monospace;font-size:11px;letter-spacing:0.25em;color:#4a9abe;text-transform:uppercase;margin-bottom:8px;">Santhosh's Job Tracker</div>
      <div style="font-size:22px;font-weight:700;color:#00cfff;letter-spacing:0.05em;">
        ${jobs.length} New Opening${jobs.length > 1 ? 's' : ''} Detected
      </div>
      <div style="font-size:13px;color:#4a9abe;margin-top:8px;">${escHtml(connectionName)}</div>
    </div>
    <div style="background:#00111e;border:1px solid #0d2040;border-radius:12px;overflow:hidden;margin-bottom:20px;">
      <div style="padding:14px 16px;background:#001428;border-bottom:1px solid #0d2040;">
        <span style="font-family:monospace;font-size:11px;letter-spacing:0.15em;color:#4a9abe;text-transform:uppercase;">⬡ MATCHED ROLES</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${jobRows}
      </table>
    </div>
    <div style="text-align:center;font-family:monospace;font-size:11px;color:#1a3a5a;letter-spacing:0.1em;">
      Santhosh's Job Tracker · ${new Date().toUTCString()}
    </div>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: "Santhosh's Job Tracker <onboarding@resend.dev>",
    to: toAddress,
    subject: `Boss, your job recommendation${jobs.length > 1 ? 's' : ''} — ${connectionName}`,
    html,
  });
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function sendColdEmail({ hiringManager, jobTitle, companyName }) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.COLD_EMAIL_FROM || 'Santhosh Rajendran <santhosh@santhoshr.com>';

  if (!apiKey) throw new Error('No Resend API key configured');
  if (!hiringManager?.email) throw new Error('No hiring manager email');

  const resend = new Resend(apiKey);

  const firstName = hiringManager.name || 'there';
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;color:#1a1a1a;font-size:15px;line-height:1.7;">
    <p>Hi ${escHtml(firstName)},</p>
    <p>I've been following ${escHtml(companyName)}'s work and genuinely admire the product direction you're taking. I'm a Product Design Manager currently exploring new opportunities, and I'd love to get your perspective on my portfolio if you have a few minutes. Attached my resume for reference as well.</p>
    <p><a href="https://www.santhoshr.com" style="color:#003a6b;">www.santhoshr.com</a> (Password for case study: w3lcome!)</p>
    <p>No pressure at all, even a quick gut reaction would be valuable. Thanks for considering it!</p>
    <p>Thanks,<br>Santhosh</p>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: fromAddress,
    to: hiringManager.email,
    subject: `Product Design Manager — ${escHtml(companyName)}`,
    html,
  });
}

module.exports = { sendJobAlert, sendColdEmail };
