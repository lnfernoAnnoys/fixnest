import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Mail } from './mailer.js'

/** Everything typed by a person goes through this before it is put into HTML. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** The logo is sent inside the email itself (not linked), so it shows even when a mail app blocks remote images. */
export const LOGO_PATH = fileURLToPath(new URL('../../assets/email-logo.png', import.meta.url))
const LOGO_CID = 'fixnest-logo'

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const INK = '#1f2430'
const MUTED = '#5b6272'
const BRAND = '#4f46e5'

export interface WelcomeInput {
  name: string
  hostel: string | null
  room: string | null
  appUrl: string
}

/** A friendly first email for a new student: what FixNest is, three steps to use it, and what to keep in mind. */
export function welcomeEmail(p: WelcomeInput): Pick<Mail, 'subject' | 'text' | 'html' | 'attachments'> {
  const first = p.name.trim().split(/\s+/)[0] || 'there'
  const where = p.hostel && p.room ? `${p.hostel} · Room ${p.room}` : null
  const open = p.appUrl
  const report = `${p.appUrl}/new`
  const settings = `${p.appUrl}/settings`
  const privacy = `${p.appUrl}/privacy`
  const terms = `${p.appUrl}/terms`
  const subject = `Welcome to FixNest, ${first}!`

  const steps: [string, string, string][] = [
    ['📝', 'Describe the problem', 'Pick what kind of problem it is, say what is wrong, and choose how urgent it is.'],
    ['📷', 'Add a photo or a short video', 'A picture helps the technician arrive with the right tools the first time.'],
    ['🔔', 'Follow it until it is fixed', 'You get an update, in the app and by email, when it is assigned, started and fixed.'],
  ]

  const text = [
    `Hi ${first},`,
    '',
    'Welcome to FixNest! Your account is ready.',
    ...(where ? [`You are set up in ${where}.`] : []),
    '',
    'FixNest is where you report a broken fan, a leaking tap or slow Wi-Fi in the hostel, and follow it until it is fixed.',
    '',
    'How it works',
    ...steps.map(([, title, body], i) => `${i + 1}. ${title}: ${body}`),
    '',
    `Report your first problem: ${report}`,
    `Open FixNest: ${open}`,
    '',
    'Good to know',
    '- High and Urgent are for real problems that cannot wait, like sparks or flooding. Please choose the priority honestly.',
    '- For fire, injury or any danger to people, call the warden or the emergency services. Do not use FixNest for emergencies.',
    '',
    'Need help? Just reply to this email.',
    '',
    '--',
    `Update emails can be turned off any time in Settings: ${settings}`,
    `Privacy policy: ${privacy}  |  Terms: ${terms}`,
  ].join('\n')

  const stepRows = steps
    .map(
      ([icon, title, body]) => `
              <tr>
                <td width="52" valign="top" style="padding:0 0 18px 0;">
                  <div style="width:40px;height:40px;line-height:40px;text-align:center;border-radius:12px;background:#eef2ff;font-size:20px;">${icon}</div>
                </td>
                <td valign="top" style="padding:0 0 18px 0;font-family:${FONT};">
                  <div style="font-size:16px;font-weight:600;color:${INK};line-height:22px;">${escapeHtml(title)}</div>
                  <div style="font-size:14px;color:${MUTED};line-height:21px;margin-top:2px;">${escapeHtml(body)}</div>
                </td>
              </tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Report hostel problems in a few taps and follow them until they are fixed.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f8;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e5e7ee;border-radius:18px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND};padding:26px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="middle"><img src="cid:${LOGO_CID}" width="44" height="44" alt="FixNest logo" style="display:block;width:40px;height:40px;border-radius:11px;border:2px solid #9a95f2;"></td>
                <td valign="middle" style="padding-left:12px;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.3px;color:#ffffff;">FixNest</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 8px 32px;font-family:${FONT};">
            <h1 style="margin:0;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.5px;color:${INK};">Welcome, ${escapeHtml(first)} 👋</h1>
            <p style="margin:14px 0 0 0;font-size:16px;line-height:25px;color:${INK};">Your FixNest account is ready. This is where you report a broken fan, a leaking tap or slow Wi-Fi in the hostel, and follow it until it is fixed. No more chasing people.</p>
            ${where ? `<p style="margin:18px 0 0 0;"><span style="display:inline-block;padding:7px 14px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:14px;font-weight:600;">📍 ${escapeHtml(where)}</span></p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:10px;background:${BRAND};"><a href="${escapeHtml(report)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:10px;">Report your first problem</a></td>
              </tr>
            </table>
            <p style="margin:14px 0 0 0;font-family:${FONT};font-size:14px;line-height:20px;color:${MUTED};">or <a href="${escapeHtml(open)}" style="color:#4338ca;text-decoration:underline;">open FixNest</a> and log in</p>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 32px 6px 32px;font-family:${FONT};">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-bottom:16px;">How it works</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 32px 30px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff7ed;border-left:4px solid #f59e0b;border-radius:10px;">
              <tr>
                <td style="padding:16px 18px;font-family:${FONT};font-size:14px;line-height:22px;color:#7c2d12;">
                  <strong>Good to know</strong><br>
                  Choose <strong>High</strong> or <strong>Urgent</strong> only for problems that cannot wait, like sparks or flooding, so the real emergencies get fixed first.<br>
                  <strong>For fire, injury or any danger to people, call the warden or the emergency services.</strong> FixNest is not for emergencies.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px 28px 32px;border-top:1px solid #e5e7ee;font-family:${FONT};font-size:12px;line-height:19px;color:${MUTED};">
            Need help? Just reply to this email.<br>
            You can turn update emails off any time in <a href="${escapeHtml(settings)}" style="color:#4338ca;">Settings</a>.<br>
            <a href="${escapeHtml(privacy)}" style="color:#4338ca;">Privacy policy</a> &nbsp;·&nbsp; <a href="${escapeHtml(terms)}" style="color:#4338ca;">Terms of service</a>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0 0;font-family:${FONT};font-size:12px;color:#8b91a1;">FixNest · Hostel maintenance and complaints, I2IT</p>
    </td>
  </tr>
</table>
</body>
</html>`

  return { subject, text, html, attachments: [{ filename: 'fixnest-logo.png', path: LOGO_PATH, cid: LOGO_CID }] }
}

/** For checking the design on screen: the same page, with the logo inlined so it opens without the email around it. */
export function welcomePreviewHtml(p: WelcomeInput): string {
  const { html } = welcomeEmail(p)
  const logo = `data:image/png;base64,${fs.readFileSync(LOGO_PATH).toString('base64')}`
  return html!.replace(`cid:${LOGO_CID}`, logo)
}
