import { describe, expect, it } from 'vitest';
import type { PolicyChatUIMessage } from '../../types';
import { getPolicyMessageParts } from './policy-message-parts';

const message = { id: 'message-1', role: 'assistant' as const };

describe('stored policy chat messages', () => {
  it('keeps modern message parts ahead of legacy content', () => {
    const parts: PolicyChatUIMessage['parts'] = [{ type: 'text', text: 'Current answer' }];
    expect(getPolicyMessageParts({ ...message, parts, content: 'Older answer' })).toBe(parts);
  });

  it('renders legacy content when parts are absent', () => {
    expect(getPolicyMessageParts({ ...message, content: 'Stored policy advice' })).toEqual([
      { type: 'text', text: 'Stored policy advice' },
    ]);
  });

  it('renders legacy text when the SDK supplied empty parts', () => {
    expect(getPolicyMessageParts({ ...message, parts: [], text: 'Stored update' })).toEqual([
      { type: 'text', text: 'Stored update' },
    ]);
  });

  it('prefers content when both legacy formats are populated', () => {
    expect(getPolicyMessageParts({ ...message, content: 'Content', text: 'Text' })).toEqual([
      { type: 'text', text: 'Content' },
    ]);
  });

  it('ignores non-text legacy values without crashing the conversation', () => {
    expect(
      getPolicyMessageParts({ ...message, content: { secret: 'not text' }, text: null }),
    ).toEqual([]);
  });

  it('does not invent visible content for an empty assistant response', () => {
    expect(getPolicyMessageParts({ ...message, parts: [], content: '', text: '' })).toEqual([]);
  });
});
