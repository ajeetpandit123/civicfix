import { describe, expect, it } from 'vitest';
import {
  createMailer,
  emailVerificationUrl,
  passwordResetMail,
  passwordResetUrl,
  sendPasswordReset,
  verificationMail,
  type MailMessage,
  type MailTransport,
} from '../src/services/emailService.js';

function recordingTransport(): MailTransport & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

function failingTransport(): MailTransport {
  return {
    async send() {
      throw new Error('smtp connection refused');
    },
  };
}

describe('mail transport selection', () => {
  it('uses the injected transport when one is supplied', async () => {
    const spy = recordingTransport();
    const mailer = createMailer({ driver: 'console', from: 'noreply@test' }, spy);

    await mailer.send({ to: 'a@b.c', subject: 's', text: 't' });

    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0]).toEqual({ to: 'a@b.c', subject: 's', text: 't' });
  });

  it('requires SMTP_HOST when the smtp driver is chosen', () => {
    expect(() => createMailer({ driver: 'smtp', from: 'noreply@test' })).toThrow(/SMTP_HOST/);
  });

  it('accepts a complete smtp block without connecting', () => {
    expect(() =>
      createMailer(
        {
          driver: 'smtp',
          from: 'noreply@test',
          smtp: { host: 'smtp.host.gmail.com', port: 587, user: 'u', pass: 'p' },
        },
        recordingTransport(),
      ),
    ).not.toThrow();
  });
});

describe('password reset links', () => {
  it('builds an encoded link carrying the plaintext token', () => {
    const link = passwordResetUrl('http://localhost:4000/', 'tok 123/abc');

    expect(link).toBe('http://localhost:4000/reset-password?token=tok%20123%2Fabc');
  });

  it('puts the link in the body so the recipient can act on it', () => {
    const mail = passwordResetMail('a@b.c', 'https://x/reset?token=abc');

    expect(mail.text).toContain('https://x/reset?token=abc');
    expect(mail.text).toContain('within one hour');
    expect(mail.subject).toMatch(/password/i);
  });

  it('sends the link to the right recipient', async () => {
    const spy = recordingTransport();
    const mailer = createMailer({ driver: 'console', from: 'noreply@test' }, spy);

    await sendPasswordReset(mailer, 'http://api.test', 'user@test', 'secret-token');

    expect(spy.sent).toHaveLength(1);
    expect(spy.sent[0].to).toBe('user@test');
    expect(spy.sent[0].text).toContain('token=secret-token');
  });

  it('propagates a transport failure instead of swallowing it', async () => {
    const mailer = createMailer({ driver: 'smtp', from: 'x', smtp: { host: 'h', port: 587 } }, failingTransport());

    await expect(sendPasswordReset(mailer, 'http://api.test', 'user@test', 'tok')).rejects.toThrow(
      /connection refused/,
    );
  });
});

describe('email verification links', () => {
  it('builds a distinct verification link', () => {
    const link = emailVerificationUrl('http://localhost:4000', 'v1');

    expect(link).toBe('http://localhost:4000/verify-email?token=v1');
  });

  it('mentions the 24 hour expiry', () => {
    expect(verificationMail('a@b.c', 'https://x').text).toContain('24 hours');
  });
});
