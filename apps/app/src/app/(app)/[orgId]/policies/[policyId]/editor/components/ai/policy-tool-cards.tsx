import type { ChatStatus } from 'ai';
import type { PolicyChatUIMessage } from '../../types';
import { getPolicyMessageParts } from './policy-message-parts';

export function PolicyToolCard({ state, stopped }: { state: string; stopped: boolean }) {
  const isCompleted = state === 'output-available';
  const isError = state === 'output-error';
  const isWorking = !isCompleted && !isError;

  // Interrupted — streaming stopped while tool was in progress
  if (isWorking && stopped) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <span>Interrupted</span>
      </div>
    );
  }

  // Working state: same compact style as data tool cards
  if (isWorking) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <svg
          className="h-3 w-3 shrink-0 animate-spin text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <span>Updating policy…</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Something went wrong while generating updates. Please try again.
      </p>
    );
  }

  // Completed state: the AI's text response already explains the changes,
  // so just show a minimal checkmark — no redundant alert banner.
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
      <svg
        className="h-3 w-3 text-primary/60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 6L9 17l-5-5" />
      </svg>
      <span>Policy updated</span>
    </div>
  );
}

const TOOL_LABELS: Record<string, { loading: string; done: string }> = {
  'tool-listVendors': { loading: 'Fetching vendors', done: 'Fetched vendors' },
  'tool-getVendor': { loading: 'Looking up vendor details', done: 'Looked up vendor details' },
  'tool-listPolicies': { loading: 'Fetching policies', done: 'Fetched policies' },
  'tool-getPolicy': { loading: 'Reading policy content', done: 'Read policy content' },
  'tool-listEvidence': { loading: 'Fetching evidence', done: 'Fetched evidence' },
};

export function DataToolCard({
  toolName,
  state,
  stopped,
}: {
  toolName: string;
  state: string;
  stopped: boolean;
}) {
  const isComplete = state === 'output-available';
  const labels = TOOL_LABELS[toolName] ?? { loading: 'Fetching data', done: 'Fetched data' };

  // Once complete, show a compact done state
  if (isComplete) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <svg
          className="h-3 w-3 text-primary/60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
        <span>{labels.done}</span>
      </div>
    );
  }

  // Interrupted
  if (stopped) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
        <span>{labels.done}</span>
      </div>
    );
  }

  // Loading state
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <svg
        className="h-3 w-3 shrink-0 animate-spin text-primary"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      <span>{labels.loading}…</span>
    </div>
  );
}

export function ThinkingIndicator({
  status,
  messages,
}: {
  status: ChatStatus;
  messages: PolicyChatUIMessage[];
}) {
  // Show when streaming/submitted but the last message is still the user's
  // (AI hasn't started responding yet), or the AI message has no visible parts
  if (status !== 'streaming' && status !== 'submitted') return null;

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return null;

  // If the last message is from the user, AI hasn't started yet
  // If it's from the assistant but has no parts, it's still thinking
  const isThinking =
    lastMessage.role === 'user' ||
    (lastMessage.role === 'assistant' && getPolicyMessageParts(lastMessage).length === 0);

  if (!isThinking) return null;

  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
