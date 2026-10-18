import nodemailer from 'nodemailer';

// Sends email through Resend (RESEND_API_KEY) or any SMTP account (SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS). EMAIL_FROM sets the sender. With neither set, emails are only logged.
// Email problems never break the action that triggered them.
export function siteUrl() {
  const raw = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'pipp-zeta.vercel.app';
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw}`;
}

let transport;

export async function sendEmail({ to, subject, text }) {
  if (!to) return false;
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'pipp <onboarding@resend.dev>';
  const body = `${text}\n\n—\npipp · ${siteUrl()}`;
  try {
    if (process.env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, text: body }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return true;
    }
    if (process.env.SMTP_HOST) {
      transport ||= nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transport.sendMail({ from, to, subject, text: body });
      return true;
    }
    console.log(`[email not configured] to=${to} subject="${subject}"`);
    return false;
  } catch (err) {
    console.error('Email failed:', err.message);
    return false;
  }
}
