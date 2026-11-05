// Branded email helpers: the cream-card layout from docs/local-current-emails.html
// written with inline styles (email clients ignore <style> blocks), plus sending
// through Resend, recipient lookup, de-duplication and unsubscribe links.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Buttons open the app on the right screen. localcurrentapp.com/open is a small
// page that hands off to localcurrent://<path> (email apps block custom-scheme
// links) and sends people without the app to the App Store.
export const appLink = (path = 'home') => `https://localcurrentapp.com/open?to=${encodeURIComponent(path)}`;
export const APP_URL = appLink('home');
export const APP_STORE_URL = 'https://apps.apple.com/us/app/local-current/id6781426256';
export const ADMIN_EMAIL = 'hello@localcurrentapp.com';
const FROM = 'Local Current <hello@localcurrentapp.com>';

const ACCENT = '#C4664A';
const INK = '#1C1917';
const MUTED = '#7D6F64';
const LINE = '#EDE3D6';
const BG = '#FBF6F0';
const DISPLAY = "'Outfit','Helvetica Neue',Arial,sans-serif";
const BODY = "'DM Sans','Helvetica Neue',Arial,sans-serif";

export const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Building blocks (all take already-escaped HTML unless noted) ──────────────
export const hi = (t: string) =>
  `<p style="margin:0 0 16px;font-family:${DISPLAY};font-size:24px;line-height:1.2;font-weight:700;color:${INK}">${t}</p>`;
export const p = (t: string) =>
  `<p style="margin:0 0 16px;font-family:${BODY};font-size:15px;line-height:1.55;color:${INK}">${t}</p>`;
export const fine = (t: string) =>
  `<p style="margin:0 0 16px;font-family:${BODY};font-size:13px;line-height:1.5;color:${MUTED}">${t}</p>`;
export const b = (t: unknown) => `<strong>${esc(t)}</strong>`;
export const link = (href: string, t: string) =>
  `<a href="${esc(href)}" style="color:${ACCENT};font-weight:600">${t}</a>`;

export const btn = (label: string, href = APP_URL) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td style="background:${ACCENT};border-radius:999px">
  <a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font-family:${DISPLAY};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">${esc(label)}</a>
  </td></tr></table>`;

export const ol = (items: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${items.map(([title, text], i) => `
  <tr><td valign="top" style="padding:0 12px 12px 0"><div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${ACCENT};color:#fff;text-align:center;font-family:${DISPLAY};font-weight:700;font-size:13px">${i + 1}</div></td>
  <td valign="top" style="padding:3px 0 12px;font-family:${BODY};font-size:15px;line-height:1.5;color:${INK}"><strong>${title}</strong> ${text}</td></tr>`).join('')}</table>`;

export const ul = (items: string[]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${items.map((t) => `
  <tr><td valign="top" style="padding:8px 10px 8px 4px"><div style="width:6px;height:6px;border-radius:3px;background:${ACCENT}"></div></td>
  <td valign="top" style="padding:2px 0 8px;font-family:${BODY};font-size:15px;line-height:1.5;color:${INK}">${t}</td></tr>`).join('')}</table>`;

export const card = (eyebrow: string, title: string, left = '', pill = '') =>
  `<div style="background:#fff;border:1px solid ${LINE};border-radius:14px;padding:14px 16px;margin:0 0 16px">
  <div style="font-family:${BODY};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">${eyebrow}</div>
  <div style="font-family:${DISPLAY};font-size:18px;font-weight:700;color:${INK};margin:4px 0">${title}</div>
  ${left || pill ? `<div style="font-family:${BODY};font-size:14px;color:${MUTED}">${left}${pill ? ` &nbsp;<span style="background:#DCEAD5;color:#3E6B3A;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600">${pill}</span>` : ''}</div>` : ''}
  </div>`;

export const codeBox = (code: string) =>
  `<div style="background:#fff;border:2px dashed ${ACCENT};border-radius:14px;padding:14px;text-align:center;margin:0 0 16px">
  <div style="font-family:${BODY};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">Your code</div>
  <div style="font-family:${DISPLAY};font-size:28px;font-weight:800;letter-spacing:2px;color:${ACCENT}">${esc(code)}</div></div>`;

export const stats = (items: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>${items.map(([n, label]) => `
  <td style="padding:0 4px"><div style="background:#fff;border:1px solid ${LINE};border-radius:12px;padding:12px 8px;text-align:center">
  <div style="font-family:${DISPLAY};font-size:22px;font-weight:800;color:${INK}">${esc(n)}</div>
  <div style="font-family:${BODY};font-size:12px;color:${MUTED}">${esc(label)}</div></div></td>`).join('')}</tr></table>`;

const QUESTIONS = 'Questions? Just reply to this email. A real person reads every one.';

/** Wraps body HTML in the branded layout. `footer` = null uses the standard "questions" line. */
export function layout(opts: { tag: string; preview: string; body: string; footer?: string | null }) {
  const footer = opts.footer ?? QUESTIONS;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
<tr><td style="padding:0 0 16px;border-bottom:1px solid ${LINE}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
  <td style="font-family:${DISPLAY};line-height:1"><div style="font-size:10px;letter-spacing:3px;color:${ACCENT};font-weight:600">LOCAL</div><div style="font-size:18px;font-weight:800;color:${INK}">Current</div></td>
  <td align="right" style="font-family:${BODY};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${MUTED}">${esc(opts.tag)}</td>
  </tr></table></td></tr>
<tr><td style="padding:20px 0 4px">${opts.body}</td></tr>
<tr><td style="padding:16px 0 0;border-top:1px solid ${LINE};font-family:${BODY};font-size:12px;line-height:1.5;color:${MUTED}">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

// ── Unsubscribe (alert and recap emails only) ────────────────────────────────
async function sign(id: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('CRON_SECRET') ?? ''),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(id));
  return Array.from(new Uint8Array(sig)).slice(0, 16).map((x) => x.toString(16).padStart(2, '0')).join('');
}
export async function verifyUnsub(id: string, token: string) { return (await sign(id)) === token; }
export async function unsubUrl(profileId: string) {
  return `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-email?unsub=${profileId}&t=${await sign(profileId)}`;
}
export async function prefsFooter(reason: string, profileId: string) {
  return `${esc(reason)} <a href="${await unsubUrl(profileId)}" style="color:${MUTED}">Email preferences</a>`;
}

// ── Recipients, de-dupe, sending ─────────────────────────────────────────────
export async function recipient(db: SupabaseClient, profileId: string, alert = false) {
  const { data: prof } = await db.from('profiles').select('full_name, email_opt_out').eq('id', profileId).single();
  if (alert && prof?.email_opt_out) return null;
  const { data } = await db.auth.admin.getUserById(profileId);
  const email = data?.user?.email;
  if (!email) return null;
  const first = (prof?.full_name ?? '').trim().split(/\s+/)[0] || 'there';
  return { email, first };
}

/** True the first time a key is seen, so each email goes out once. */
export async function once(db: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await db.from('email_log').insert({ key });
  return !error;
}

export async function send(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: ADMIN_EMAIL, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** Plain admin note (emails 14–15): no branding, just the facts. */
export async function sendAdmin(subject: string, lines: string[]) {
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1C1917">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;
  await send(ADMIN_EMAIL, subject, html);
}
