import { Resend } from 'resend';
import { createEmailProvider } from './email-provider';
import { sendEmailWithProvider, type SendEmailParams } from './send-email';

export type { EmailAttachment } from './email-provider.types';
export type { SendEmailParams } from './send-email';

const client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
export const resend = createEmailProvider({
  resendTransport: client
    ? {
        send: (payload) => client.emails.send(payload),
        sendBatch: ({ payloads }) => client.batch.send(payloads),
      }
    : null,
});

export const sendEmail = (params: SendEmailParams) =>
  sendEmailWithProvider({ provider: resend, ...params });
