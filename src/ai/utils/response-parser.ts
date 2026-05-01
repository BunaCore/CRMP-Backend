export function parseOutline(text: string): string[] {
  // Simple heuristic: split by lines, remove empty lines
  return text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('Here is an outline') && !line.startsWith('Outline:'));
}
