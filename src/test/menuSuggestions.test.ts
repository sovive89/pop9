import { describe, expect, it } from 'vitest';
import { applyMenuSuggestion, catalogWords, matchMenuSuggestions, type MenuSuggestion } from '@/lib/menu-suggestions';
const suggestions: MenuSuggestion[] = [
  { id: 'p1', label: 'Pão brioche', value: 'Pão brioche (un)', kind: 'material', unit: 'un' },
  { id: 'q1', label: 'Queijo muçarela', value: 'Queijo muçarela (g)', kind: 'material', unit: 'g' },
  { id: 'c1', label: 'Hambúrgueres', value: 'Hambúrgueres', kind: 'category' },
];
describe('menu prefix suggestions', () => {
  it('matches the beginning of the name ignoring accents/case, not an interior substring', () => {
    expect(matchMenuSuggestions('PAO', 3, suggestions)[0].suggestion.id).toBe('p1');
    expect(matchMenuSuggestions('bri', 3, suggestions)).toEqual([]);
    expect(matchMenuSuggestions('p', 1, suggestions)).toEqual([]);
    expect(matchMenuSuggestions('ham', 3, suggestions)[0].suggestion.label).toBe('Hambúrgueres');
  });
  it('completes a multiword prefix without duplicating the beginning', () => {
    const match = matchMenuSuggestions('Pao bri', 7, suggestions)[0];
    expect(applyMenuSuggestion('Pao bri', match).value).toBe('Pão brioche (un)');
  });
  it('preserves quantities, surrounding text and a second line when completing the word at the caret', () => {
    const value = '150 g de que, fatiado\n20 g de tomate';
    const caret = value.indexOf(',');
    const match = matchMenuSuggestions(value, caret, suggestions)[0];
    expect(applyMenuSuggestion(value, match)).toEqual({ value: '150 g de Queijo muçarela (g), fatiado\n20 g de tomate', caret: 28 });
  });
  it('replaces the rest of a word when the caret is in the middle', () => {
    const match = matchMenuSuggestions('queijxx fresco', 5, suggestions)[0];
    expect(applyMenuSuggestion('queijxx fresco', match).value).toBe('Queijo muçarela (g) fresco');
  });
  it('keeps homonyms separate by ID and caps the options', () => {
    const options = Array.from({ length: 12 }, (_, i) => ({ ...suggestions[1], id: `q${i}`, unit: i ? 'kg' : 'g' }));
    expect(matchMenuSuggestions('que', 3, options)).toHaveLength(8);
    expect(new Set(matchMenuSuggestions('que', 3, options).map(row => row.suggestion.id)).size).toBe(8);
  });
  it('deduplicates catalog words and keeps original spelling', () => {
    const words = catalogWords(['Pão artesanal com queijo', 'pao e Queijo']);
    expect(words.map(row => row.label)).toEqual(['Pão', 'artesanal', 'queijo']);
  });
});
