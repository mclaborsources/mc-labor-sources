export function messageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const bracketed = value.match(/<[^>]+>/g);
  return [...new Set((bracketed?.length ? bracketed : value.split(/\s+/)).map((item) => item.trim()).filter(Boolean))];
}

export function threadMessageIds(inReplyTo: string | null | undefined, references: string | null | undefined): string[] {
  return [...new Set([...messageIds(inReplyTo), ...messageIds(references)])];
}

export function messageIdVariants(value: string): string[] {
  return [...new Set([value, value.replace(/^<|>$/g, "")])];
}
