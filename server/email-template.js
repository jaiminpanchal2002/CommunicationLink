// Branded HTML for notification emails. Email clients are unforgiving, so this
// uses table layout, inline styles, and web-safe fonts (Georgia for the serif
// wordmark, system sans for body) with the app's sage palette.

const HEADINGS = {
  topic: 'A new conversation',
  schedule: 'Your time together is set',
  appreciation: 'A little note for you',
  monthly: 'Your monthly check-in',
  discussion_reminder: 'Coming up soon',
};

const escape = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderNotificationEmail({ title, type, appUrl } = {}) {
  const heading = HEADINGS[type] || 'A gentle update';
  const message = escape(title);
  const url = appUrl ? escape(appUrl) : '';
  const button = url ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 4px;">
                <tr><td align="center" bgcolor="#466553" style="border-radius:10px;">
                  <a href="${url}" style="display:inline-block;padding:14px 30px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Open Together &rarr;</a>
                </td></tr>
              </table>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>Together</title>
</head>
<body style="margin:0;padding:0;background:#eef1e8;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${message}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1e8;">
  <tr><td align="center" style="padding:36px 16px;">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:100%;">
      <tr><td align="center" style="padding-bottom:22px;">
        <span style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:bold;letter-spacing:-0.5px;color:#3a4a3f;">
          <span style="color:#466553;">&#9829;</span>&nbsp;together<span style="color:#7c9b80;">.</span>
        </span>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e3e9dd;border-radius:16px;padding:38px 34px;">
        <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;color:#93a08f;text-transform:uppercase;text-align:center;">A little closer, every day</div>
        <h1 style="margin:14px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:26px;line-height:1.25;color:#33413a;text-align:center;">${heading}</h1>
        <p style="margin:18px 0 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#5c6b5a;text-align:center;">${message}</p>
        ${button}
        <div style="height:1px;background:#ecefe6;margin:30px 0 0;"></div>
        <p style="margin:22px 0 0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:15px;line-height:1.6;color:#8a9885;text-align:center;">&ldquo;You&rsquo;re on the same team.<br>Even on the hard days.&rdquo;</p>
      </td></tr>
      <tr><td align="center" style="padding-top:22px;">
        <div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#93a08f;">&#128274;&nbsp; Private, just for the two of you.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
