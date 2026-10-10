export type MenuSuggestion = { id: string; label: string; value: string; kind: 'material' | 'category' | 'product' | 'word'; unit?: string };
export type SuggestionMatch = { suggestion: MenuSuggestion; start: number; end: number };
export const normalizePrefix = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Replace only the prefix at the caret. Never overwrite the rest of the draft. */
export function matchMenuSuggestions(value: string, caret: number, suggestions: readonly MenuSuggestion[], mode: 'word' | 'whole' = 'word'): SuggestionMatch[] {
  const end = Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, end);
  const token = before.match(/[\p{L}\p{M}][\p{L}\p{M}\d-]*$/u)?.[0] ?? '';
  const segment = before.split(/[\n,;:]/).pop()?.replace(/^\s+/, '') ?? '';
  const prefixes = mode === 'whole' ? [{ text: before.trimStart(), start: before.length - before.trimStart().length }] : [
    { text: segment, start: before.length - segment.length },
    { text: token, start: before.length - token.length },
  ];
  const result: SuggestionMatch[] = [];
  const seen = new Set<string>();
  for (const prefix of prefixes) {
    if (prefix.text.length < 2) continue;
    const query = normalizePrefix(prefix.text);
    for (const suggestion of suggestions) {
      if (seen.has(suggestion.id) || !normalizePrefix(suggestion.label).startsWith(query)) continue;
      seen.add(suggestion.id); result.push({ suggestion, start: prefix.start, end });
      if (result.length === 8) return result;
    }
  }
  return result;
}
export function applyMenuSuggestion(value: string, match: SuggestionMatch): { value: string; caret: number } {
  // Complete the remainder of a word when the caret sits inside it.
  const tail = value.slice(match.end).match(/^[\p{L}\p{M}\d-]+/u)?.[0] ?? '';
  return { value: value.slice(0, match.start) + match.suggestion.value + value.slice(match.end + tail.length), caret: match.start + match.suggestion.value.length };
}

const STOP_WORDS = new Set(['com', 'para', 'uma', 'dos', 'das', 'por', 'sem', 'que', 'nos', 'nas']);
export function catalogWords(texts: readonly string[]): MenuSuggestion[] {
  const words = new Map<string, string>();
  for (const text of texts) {
    for (const word of text.slice(0, 2000).match(/[\p{L}\p{M}][\p{L}\p{M}-]{2,}/gu) ?? []) {
      const key = normalizePrefix(word);
      if (!STOP_WORDS.has(key) && !words.has(key)) words.set(key, word);
      if (words.size >= 5000) break;
    }
    if (words.size >= 5000) break;
  }
  return [...words].map(([id, word]) => ({ id: `word:${id}`, label: word, value: word, kind: 'word' }));
}
