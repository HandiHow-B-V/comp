import type { ReactNode } from 'react';

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendEmailPayload {
  from: string;
  to: string | string[];
  cc?: string | string[];
  replyTo?: string;
  subject: string;
  html?: string;
  react?: ReactNode;
  headers?: Record<string, string>;
  scheduledAt?: string;
  attachments?: EmailAttachment[];
}

export type EmailSendResult =
  | { data: { id?: string }; error: null }
  | { data: null; error: { message: string } };

export type EmailBatchResult =
  | {
      data: {
        data: Array<{ id?: string } | null>;
        errors?: Array<{ index: number; message: string }>;
      };
      error: null;
    }
  | { data: null; error: { message: string } };

export interface EmailProvider {
  emails: { send(payload: SendEmailPayload): Promise<EmailSendResult> };
  batch: {
    send(
      payloads: SendEmailPayload[],
      options?: { batchValidation: 'permissive' },
    ): Promise<EmailBatchResult>;
  };
}
