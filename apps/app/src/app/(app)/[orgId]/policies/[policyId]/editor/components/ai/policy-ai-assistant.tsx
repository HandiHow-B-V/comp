'use client';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@trycompai/design-system';
import { Close, MagicWand } from '@trycompai/design-system/icons';
import type { ChatStatus } from 'ai';
import type { PolicyChatUIMessage } from '../../types';
import { getPolicyMessageParts } from './policy-message-parts';
import { DataToolCard, PolicyToolCard, ThinkingIndicator } from './policy-tool-cards';

interface PolicyAiAssistantProps {
  messages: PolicyChatUIMessage[];
  status: ChatStatus;
  errorMessage?: string | null;
  sendMessage: (payload: { text: string }) => void;
  stop?: () => void;
  close?: () => void;
}

export function PolicyAiAssistant({
  messages,
  status,
  errorMessage,
  sendMessage,
  stop,
  close,
}: PolicyAiAssistantProps) {
  const isBusy = status === 'streaming' || status === 'submitted';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      {close && (
        <div className="flex items-center justify-between bg-primary px-3 py-2 text-primary-foreground">
          <span className="text-sm font-semibold">AI Assistant</span>
          <div className="text-primary-foreground [&_button]:text-primary-foreground/70 [&_button:hover]:text-primary-foreground">
            <Button variant="ghost" size="icon" onClick={close} iconLeft={<Close size={14} />} />
          </div>
        </div>
      )}

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="!gap-4 px-3 py-3">
          {messages.length === 0 ? (
            <ConversationEmptyState>
              <div className="text-muted-foreground">
                <MagicWand size={24} />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-medium">Policy AI Assistant</h3>
                <p className="text-xs text-muted-foreground">
                  I can help you edit, adapt, or check this policy for compliance.
                </p>
              </div>
              <div className="space-y-0.5 text-center text-xs italic text-muted-foreground/70">
                <p>&quot;Add a section covering third-party vendor access controls.&quot;</p>
                <p>&quot;Update the incident response steps to align with SOC 2.&quot;</p>
                <p>&quot;Rewrite the data retention clause for GDPR compliance.&quot;</p>
              </div>
            </ConversationEmptyState>
          ) : (
            <>
              {messages.map((message, messageIndex) => {
                // A tool in an older message that never completed was interrupted.
                // A tool in the latest message is only interrupted if we're no longer busy.
                const isLastMessage = messageIndex === messages.length - 1;
                const isMessageStopped = isLastMessage ? !isBusy : true;

                return (
                  <Message from={message.role} key={message.id}>
                    <MessageContent>
                      {getPolicyMessageParts(message).map((part, index) => {
                        if (part.type === 'text') {
                          if (message.role === 'user') {
                            return (
                              <div key={`${message.id}-${index}`} className="flex justify-end">
                                <div className="rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                                  {part.text}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <MessageResponse key={`${message.id}-${index}`}>
                              {part.text}
                            </MessageResponse>
                          );
                        }

                        if (part.type === 'tool-proposePolicy') {
                          return (
                            <PolicyToolCard
                              key={`${message.id}-${index}`}
                              state={part.state}
                              stopped={isMessageStopped}
                            />
                          );
                        }

                        if (
                          part.type === 'tool-listVendors' ||
                          part.type === 'tool-getVendor' ||
                          part.type === 'tool-listPolicies' ||
                          part.type === 'tool-getPolicy' ||
                          part.type === 'tool-listEvidence'
                        ) {
                          return (
                            <DataToolCard
                              key={`${message.id}-${index}`}
                              toolName={part.type}
                              state={part.state}
                              stopped={isMessageStopped}
                            />
                          );
                        }

                        return null;
                      })}
                    </MessageContent>
                  </Message>
                );
              })}
              <ThinkingIndicator status={status} messages={messages} />
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t px-3 py-2">
        {errorMessage && (
          <div className="mb-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMessage}
          </div>
        )}

        <PromptInput
          onSubmit={({ text }) => {
            if (!text.trim() || isBusy) return;
            sendMessage({ text });
          }}
        >
          <PromptInputTextarea
            placeholder="Let me know what to edit..."
            disabled={isBusy}
            className="min-h-[2rem] max-h-[4rem]"
          />
          <PromptInputFooter>
            <div />
            {isBusy && stop ? (
              <Button variant="outline" size="sm" onClick={stop}>
                Stop
              </Button>
            ) : (
              <PromptInputSubmit status={status} />
            )}
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
