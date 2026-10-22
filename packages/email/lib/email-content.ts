import { render } from '@react-email/render';
import { createElement, Fragment } from 'react';
import type { SendEmailPayload } from './email-provider.types';

export async function renderEmailHtml(payload: SendEmailPayload): Promise<string> {
  if (payload.html !== undefined) return payload.html;
  if (!payload.react) throw new Error('Missing email html or react content');
  return render(createElement(Fragment, null, payload.react));
}
