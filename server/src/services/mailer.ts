import nodemailer, { type Transporter } from 'nodemailer'
import { config } from '../config.js'
import { HttpError } from '../lib/errors.js'

/**
 * Outgoing email.
 *  - With SMTP_HOST set, mail is really sent.
 *  - Without it, outside production, the message is printed to the server console (handy for local development).
 *  - Without it, in production, sending fails loudly. Printing would put login codes into the server logs.
 * Callers only use sendMail(), so adding another provider later touches nothing else.
 */
/** A file sent inside the email; with a cid, the HTML can show it with <img src="cid:...">. */
export interface MailAttachment {
  filename: string
  path: string
  cid?: string
}
export interface Mail {
  to: string
  subject: string
  /** Always sent. Mail apps that cannot show HTML (and the dev console) use this. */
  text: string
  /** Optional designed version. */
  html?: string
  attachments?: MailAttachment[]
}

let transport: Transporter | null = null
let sink: ((mail: Mail) => void | Promise<void>) | null = null

/** For tests: capture emails in memory instead of sending them. Pass null to go back to normal. */
export function setMailSink(fn: ((mail: Mail) => void | Promise<void>) | null) {
  sink = fn
}

export async function sendMail(mail: Mail): Promise<void> {
  if (sink) return void (await sink(mail))
  if (config.smtp) {
    const { host, port, user, pass, from } = config.smtp
    transport ??= nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined })
    try {
      await transport.sendMail({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments })
    } catch (e) {
      console.error('[mail] SMTP send failed:', e instanceof Error ? e.message : e)
      throw new HttpError(503, "We couldn't send the email right now. Please try again in a few minutes.", 'EMAIL_UNAVAILABLE')
    }
    return
  }
  if (config.isProd) {
    console.error('[mail] SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM), so no email can be sent.')
    throw new HttpError(503, "We couldn't send the email right now. Please try again later.", 'EMAIL_UNAVAILABLE')
  }
  console.log(`\n[mail] To: ${mail.to}\n[mail] Subject: ${mail.subject}\n[mail] ${mail.text}\n`)
}
