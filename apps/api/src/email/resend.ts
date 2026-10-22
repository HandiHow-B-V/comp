import { Resend } from 'resend';
import {
  createEmailProvider,
  sendEmailWithProvider,
  type SendEmailParams,
} from '@trycompai/email';

export type { EmailAttachment } from '@trycompai/email';
const client = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
export const resend = createEmailProvider({
  resendTransport: client
    ? {
        send: (payload) => client.emails.send(payload),
        sendBatch: ({ payloads, options }) =>
          client.batch.send(payloads, options),
      }
    : null,
});

export const sendEmail = (params: SendEmailParams) =>
  sendEmailWithProvider({ provider: resend, ...params });
