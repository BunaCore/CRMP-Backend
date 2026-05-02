export function cleanAiOutput(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  // Remove enclosing quotes if the AI added them to the whole output
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1).trim();
  }
  // Remove markdown code blocks if the AI tried to wrap it
  cleaned = cleaned.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
  return cleaned.trim();
}
