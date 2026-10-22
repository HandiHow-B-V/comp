import { randomUUID } from 'node:crypto';
import type * as React from 'react';
import type { EmailAttachment, EmailProvider } from './email-provider.types';

export interface SendEmailParams {
  to: string;
  subject: string;
  react: React.ReactNode;
  marketing?: boolean;
  system?: boolean;
  test?: boolean;
  cc?: string | string[];
  scheduledAt?: string;
  attachments?: EmailAttachment[];
}

function maskEmail(value: string): string {
  const [name = '', domain = ''] = value.toLowerCase().split('@');
  if (!domain) return 'invalid-email';
  const safeName =
    name.length <= 2 ? (name[0] ?? '') : `${name[0]}${'*'.repeat(name.length - 2)}${name.at(-1)}`;
  return `${safeName}@${domain}`;
}

function maskEmailList(value: string): string {
  return value
    .split(',')
    .map((email) => maskEmail(email.trim()))
    .join(', ');
}

export async function sendEmailWithProvider({
  provider,
  to,
  subject,
  react,
  marketing,
  system,
  test,
  cc,
  scheduledAt,
  attachments,
}: SendEmailParams & { provider: EmailProvider | null }) {
  if (!provider) {
    throw new Error('Email provider not initialized - missing API key');
  }

  const fromMarketing = process.env.BREVO_FROM_MARKETING ?? process.env.RESEND_FROM_MARKETING;
  const fromSystem = process.env.BREVO_FROM_SYSTEM ?? process.env.RESEND_FROM_SYSTEM;
  const fromDefault = process.env.BREVO_FROM_DEFAULT ?? process.env.RESEND_FROM_DEFAULT;
  const toTest = process.env.BREVO_TO_TEST ?? process.env.RESEND_TO_TEST;
  const replyMarketing =
    process.env.BREVO_REPLY_TO_MARKETING ?? process.env.RESEND_REPLY_TO_MARKETING;

  let fromAddress = fromDefault;
  if (system) fromAddress = fromSystem;
  if (marketing) fromAddress = fromMarketing;

  const toAddress = test ? toTest : to;

  const replyTo = marketing ? replyMarketing : undefined;

  if (!fromAddress) {
    throw new Error('Missing FROM address in environment variables');
  }
  if (!toAddress) {
    throw new Error('Missing TO address in environment variables');
  }

  const requestId = randomUUID();
  const startTime = Date.now();

  try {
    console.info('[email] send start', {
      requestId,
      provider: process.env.BREVO_API_KEY ? 'brevo' : 'resend',
      from: fromAddress,
      to: maskEmailList(toAddress),
      subject,
      scheduledAt,
      flags: {
        marketing: Boolean(marketing),
        system: Boolean(system),
        test: Boolean(test),
      },
    });

    const { data, error } = await provider.emails.send({
      from: fromAddress,
      to: toAddress,
      cc,
      replyTo,
      subject,
      react,
      scheduledAt,
      attachments: attachments?.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      })),
    });

    if (error) {
      console.error('Email provider API error:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.info('[email] send success', {
      requestId,
      provider: process.env.BREVO_API_KEY ? 'brevo' : 'resend',
      to: maskEmailList(toAddress),
      messageId: data?.id,
      durationMs: Date.now() - startTime,
    });

    return {
      message: 'Email sent successfully',
      id: data?.id,
    };
  } catch (error) {
    console.error('[email] send failure', {
      requestId,
      provider: process.env.BREVO_API_KEY ? 'brevo' : 'resend',
      to: maskEmailList(toAddress),
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error('Failed to send email');
  }
}
