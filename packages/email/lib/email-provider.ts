import { createBrevoProvider } from './brevo';
import { renderEmailHtml } from './email-content';
import type {
  EmailBatchResult,
  EmailProvider,
  EmailSendResult,
  SendEmailPayload,
} from './email-provider.types';

type RenderedEmailPayload = Omit<SendEmailPayload, 'react' | 'html'> & { html: string };

interface ResendTransport {
  send(payload: RenderedEmailPayload): Promise<EmailSendResult>;
  sendBatch(params: {
    payloads: RenderedEmailPayload[];
    options?: { batchValidation: 'permissive' };
  }): Promise<EmailBatchResult>;
}

async function toResendPayload(payload: SendEmailPayload): Promise<RenderedEmailPayload> {
  const { react: _react, ...options } = payload;
  return { ...options, html: await renderEmailHtml(payload) };
}

export function createEmailProvider({
  resendTransport,
}: {
  resendTransport: ResendTransport | null;
}): EmailProvider | null {
  if (process.env.BREVO_API_KEY) return createBrevoProvider();
  if (!resendTransport) return null;
  return {
    emails: { send: async (payload) => resendTransport.send(await toResendPayload(payload)) },
    batch: {
      send: async (payloads, options) =>
        resendTransport.sendBatch({
          payloads: await Promise.all(payloads.map(toResendPayload)),
          options,
        }),
    },
  };
}
