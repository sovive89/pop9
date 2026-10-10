import { useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { applyMenuSuggestion, matchMenuSuggestions, type MenuSuggestion, type SuggestionMatch } from '@/lib/menu-suggestions';

type Props = {
  value: string; onChange: (value: string) => void; suggestions: readonly MenuSuggestion[];
  label: string; id?: string; placeholder?: string; disabled?: boolean; multiline?: boolean;
  mode?: 'word' | 'whole'; className?: string; onPick?: (suggestion: MenuSuggestion) => void;
};
export default function MenuPrefixField({ value, onChange, suggestions, label, id, placeholder, disabled, multiline = false, mode = 'word', className, onPick }: Props) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const field = () => multiline ? textarea.current : input.current;
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(value.length);
  const [active, setActive] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const matches = focused && !disabled && !dismissed ? matchMenuSuggestions(value, caret, suggestions, mode) : [];
  const selected = active >= 0 && active < matches.length ? active : -1;
  const pick = (match: SuggestionMatch) => {
    const applied = applyMenuSuggestion(value, match);
    onChange(applied.value); onPick?.(match.suggestion);
    setDismissed(true); setActive(-1); setCaret(applied.caret);
    requestAnimationFrame(() => { const element = field(); if (element) { element.focus(); element.setSelectionRange(applied.caret, applied.caret); } });
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape' && matches.length) { event.preventDefault(); event.stopPropagation(); setDismissed(true); return; }
    if (!matches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setActive(event.key === 'ArrowDown' ? (selected + 1) % matches.length : (selected <= 0 ? matches.length - 1 : selected - 1));
    } else if (event.key === 'Enter' && selected >= 0) { event.preventDefault(); pick(matches[selected]); }
  };
  const props = {
    id, value, placeholder, disabled, className, 'aria-label': label, role: 'combobox', 'aria-autocomplete': 'list' as const,
    'aria-expanded': matches.length > 0, 'aria-controls': matches.length ? listId : undefined,
    'aria-activedescendant': selected >= 0 ? `${listId}-${selected}` : undefined, autoComplete: 'off',
    onFocus: () => { setFocused(true); setDismissed(false); setCaret(field()?.selectionStart ?? value.length); },
    onBlur: () => { setFocused(false); setActive(-1); },
    onSelect: () => setCaret(field()?.selectionStart ?? value.length),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { onChange(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); setActive(-1); setDismissed(false); },
    onKeyDown: keyDown,
  };
  return <div className="min-w-0">
    {multiline ? <Textarea ref={textarea} {...props} /> : <Input ref={input} {...props} />}
    {matches.length > 0 && <ul id={listId} role="listbox" aria-label={`Sugestões para ${label}`} className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-sm">
      {matches.map((match, index) => <li key={match.suggestion.id} id={`${listId}-${index}`} role="option" aria-selected={selected === index}>
        <button type="button" tabIndex={-1} onPointerDown={event => event.preventDefault()} onMouseDown={event => event.preventDefault()} onClick={() => pick(match)} className={`flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent ${selected === index ? 'bg-accent' : ''}`}>
          <span className="min-w-0 break-words">{match.suggestion.label}</span><span className="shrink-0 text-xs text-muted-foreground">{match.suggestion.unit ?? ({ category: 'Categoria', product: 'Produto', word: 'Palavra', material: 'Insumo' }[match.suggestion.kind])}</span>
        </button>
      </li>)}
    </ul>}
  </div>;
}
