import type { SpanRef } from "./results";

export interface MessageForSpan {
  readonly index: number;
  readonly text: string;
}

export function spanText(messages: readonly MessageForSpan[], span: SpanRef): string | null {
  const message = messages.find((item) => item.index === span.msg_index);
  if (!message) return null;
  if (span.start < 0 || span.end > message.text.length || span.start >= span.end) return null;
  return message.text.slice(span.start, span.end);
}

export function spanMatchesText(messages: readonly MessageForSpan[], span: SpanRef): boolean {
  return spanText(messages, span) === span.text;
}
