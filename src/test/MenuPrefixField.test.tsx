import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MenuPrefixField from '@/components/admin/MenuPrefixField';
import type { MenuSuggestion } from '@/lib/menu-suggestions';
afterEach(cleanup);
const options: MenuSuggestion[] = [{ id: 'r1', label: 'Queijo', value: 'Queijo (g)', unit: 'g', kind: 'material' }];
function Field({ onPick = () => {}, suggestions = options }: { onPick?: (row: MenuSuggestion) => void; suggestions?: MenuSuggestion[] }) {
  const [value, setValue] = useState('');
  return <MenuPrefixField multiline label="Ingredientes" value={value} onChange={setValue} suggestions={suggestions} onPick={onPick} />;
}
describe('autocomplete field', () => {
  it('selects by keyboard, exposes the active option and does not select on typing', () => {
    const picked = vi.fn(); render(<Field onPick={picked} />);
    const field = screen.getByRole('combobox', { name: 'Ingredientes' });
    fireEvent.focus(field); fireEvent.change(field, { target: { value: '150 g de que' } });
    expect(screen.getByRole('listbox')).toBeVisible(); expect(picked).not.toHaveBeenCalled();
    expect(field).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field).toHaveValue('150 g de Queijo (g)');
    expect(picked).toHaveBeenCalledWith(options[0]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
  it('accepts an explicit pointer selection and lets Escape dismiss without changing content', () => {
    render(<Field />); const field = screen.getByLabelText('Ingredientes');
    fireEvent.focus(field); fireEvent.change(field, { target: { value: 'que' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument(); expect(field).toHaveValue('que');
    fireEvent.change(field, { target: { value: 'quei' } });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Queijo g' }));
    fireEvent.click(screen.getByRole('button', { name: 'Queijo g' }));
    expect(field).toHaveValue('Queijo (g)');
  });
  it('does not intercept Enter before an option is chosen, and hides removed suggestions', () => {
    const view = render(<Field />); const field = screen.getByLabelText('Ingredientes');
    fireEvent.focus(field); fireEvent.change(field, { target: { value: 'que' } });
    expect(fireEvent.keyDown(field, { key: 'Enter' })).toBe(true);
    expect(field).toHaveValue('que');
    view.rerender(<Field suggestions={[]} />);
    expect(field).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
