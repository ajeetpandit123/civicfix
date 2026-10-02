import { logger } from '../lib/logger.js';

/**
 * Transport-agnostic mail sending. The transport is injectable so tests never
 * open a socket and so the provider stays swappable.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export interface MailerConfig {
  driver: 'console' | 'smtp';
  from: string;
  smtp?: { host: string; port: number; user?: string; pass?: string };
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Logs the message instead of sending it. Default driver. */
export function consoleTransport(): MailTransport {
  return {
    async send(message) {
      logger.info({ to: message.to, subject: message.subject }, 'email_console');
    },
  };
}

/**
 * Real SMTP delivery via nodemailer (STARTTLS on 587). Loaded lazily so the
 * console driver works without the dependency being resolvable.
 */
export function smtpTransport(cfg: NonNullable<MailerConfig['smtp']>, from: string): MailTransport {
  return {
    async send(message) {
      const { createTransport } = await import('nodemailer');
      const transport = createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      });
      await transport.sendMail({ from, ...message });
    },
  };
}

/** Selects the transport from config and fails loudly on an incomplete smtp block. */
export function createMailer(cfg: MailerConfig, transport?: MailTransport): Mailer {
  const chosen =
    transport ??
    (cfg.driver === 'smtp'
      ? (() => {
          if (!cfg.smtp?.host) {
            throw new Error('EMAIL_DRIVER=smtp requires SMTP_HOST (and SMTP_PORT)');
          }
          return smtpTransport(cfg.smtp, cfg.from);
        })()
      : consoleTransport());

  return {
    async send(message) {
      await chosen.send({ ...message });
    },
  };
}

export function passwordResetUrl(apiPublicUrl: string, token: string): string {
  return `${apiPublicUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}

export function emailVerificationUrl(apiPublicUrl: string, token: string): string {
  return `${apiPublicUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Composes the password-reset mail. The token is passed in plaintext here and
 * only here — callers persist solely its hash, so this is the one chance to
 * deliver it.
 */
export function passwordResetMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Reset your CivicFix password',
    text: [
      'Someone asked to reset the password for this CivicFix account.',
      '',
      'Open the link below within one hour to choose a new password:',
      link,
      '',
      'If this was not you, no action is needed — the link expires on its own.',
    ].join('\n'),
  };
}

export function verificationMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Confirm your CivicFix email address',
    text: [
      'Welcome to CivicFix.',
      '',
      'Confirm your email address to activate your account:',
      link,
      '',
      'The link expires in 24 hours.',
    ].join('\n'),
  };
}

/** Sends a password reset link. Never throws into the caller's request path. */
export async function sendPasswordReset(
  mailer: Mailer,
  apiPublicUrl: string,
  to: string,
  token: string,
): Promise<void> {
  const link = passwordResetUrl(apiPublicUrl, token);
  try {
    await mailer.send(passwordResetMail(to, link));
  } catch (err) {
    logger.error({ err, to }, 'password_reset_email_failed');
    throw err;
  }
}

export async function sendVerification(
  mailer: Mailer,
  apiPublicUrl: string,
  to: string,
  token: string,
): Promise<void> {
  const link = emailVerificationUrl(apiPublicUrl, token);
  try {
    await mailer.send(verificationMail(to, link));
  } catch (err) {
    logger.error({ err, to }, 'verification_email_failed');
    throw err;
  }
}
