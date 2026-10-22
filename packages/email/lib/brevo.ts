import { renderEmailHtml } from './email-content';
import type {
  EmailAttachment,
  EmailProvider,
  EmailSendResult,
  SendEmailPayload,
} from './email-provider.types';

function parseAddress(value: string): { email: string; name?: string } {
  const match = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!match) return { email: value.trim() };
  const name = match[1]?.replace(/^"|"$/g, '').trim();
  const email = match[2]?.trim();
  if (!email) return { email: value.trim() };
  return { email, ...(name ? { name } : {}) };
}

function toAddressList(value: string | string[]) {
  const values = Array.isArray(value) ? value : value.split(',');
  return values
    .map((address) => address.trim())
    .filter(Boolean)
    .map(parseAddress);
}

function toBrevoAttachment(attachment: EmailAttachment) {
  return {
    name: attachment.filename,
    content:
      typeof attachment.content === 'string'
        ? attachment.content
        : attachment.content.toString('base64'),
  };
}

function readStringField({ value, field }: { value: unknown; field: string }) {
  if (!value || typeof value !== 'object' || !(field in value)) return undefined;
  const result: unknown = Reflect.get(value, field);
  return typeof result === 'string' ? result : undefined;
}

async function sendWithBrevo(payload: SendEmailPayload): Promise<EmailSendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { data: null, error: { message: 'Brevo not initialized - missing API key' } };
  if (!payload.html && !payload.react) {
    return { data: null, error: { message: 'Missing email html or react content' } };
  }
  const htmlContent = await renderEmailHtml(payload);
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: parseAddress(payload.from),
      to: toAddressList(payload.to),
      ...(payload.cc ? { cc: toAddressList(payload.cc) } : {}),
      ...(payload.replyTo ? { replyTo: parseAddress(payload.replyTo) } : {}),
      subject: payload.subject,
      htmlContent,
      ...(payload.headers ? { headers: payload.headers } : {}),
      ...(payload.scheduledAt ? { scheduledAt: payload.scheduledAt } : {}),
      ...(payload.attachments?.length
        ? { attachment: payload.attachments.map(toBrevoAttachment) }
        : {}),
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      data: null,
      error: {
        message:
          readStringField({ value: body, field: 'message' }) ??
          readStringField({ value: body, field: 'error' }) ??
          `Brevo API request failed with status ${response.status}`,
      },
    };
  }
  return {
    data: {
      id:
        readStringField({ value: body, field: 'messageId' }) ??
        readStringField({ value: body, field: 'id' }),
    },
    error: null,
  };
}

export function createBrevoProvider(): EmailProvider {
  return {
    emails: { send: sendWithBrevo },
    batch: {
      send: async (payloads) => {
        const data: Array<{ id?: string } | null> = [];
        const errors: Array<{ index: number; message: string }> = [];
        for (const [index, payload] of payloads.entries()) {
          const result = await sendWithBrevo(payload);
          if (result.error) errors.push({ index, message: result.error.message });
          else data.push(result.data);
        }
        return { data: { data, errors }, error: null };
      },
    },
  };
}
