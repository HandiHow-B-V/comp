import type { PolicyChatUIMessage } from '../../types';

type PolicyMessageWithLegacyContent = Omit<PolicyChatUIMessage, 'parts'> & {
  parts?: PolicyChatUIMessage['parts'];
  content?: unknown;
  text?: unknown;
};

export function getPolicyMessageParts(
  message: PolicyMessageWithLegacyContent,
): PolicyChatUIMessage['parts'] {
  if (Array.isArray(message.parts) && message.parts.length > 0) {
    return message.parts;
  }

  if (typeof message.content === 'string' && message.content.length > 0) {
    return [{ type: 'text', text: message.content }];
  }

  if (typeof message.text === 'string' && message.text.length > 0) {
    return [{ type: 'text', text: message.text }];
  }

  return [];
}
