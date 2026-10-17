import { describe, it, expect } from 'vitest';
import { parseAgentModelsResponse } from '@/lib/agent-model-response';

describe('agent model response boundary', () => {
  it('accepts only valid unique models and string warnings', () => {
    const model = { id: 'google/gemini-2.5-flash', label: 'Gemini', provider: 'google' };
    expect(parseAgentModelsResponse({ models: [null, 2, {}, { id: 'bad' }, model, model], warnings: [null, 'Aviso', {}] }))
      .toEqual({ models: [model], warnings: ['Aviso'] });
  });
  it('handles absent or malformed responses without accessing unknown items', () => {
    for (const value of [null, undefined, [], { models: 'bad', warnings: {} }]) {
      expect(parseAgentModelsResponse(value)).toEqual({ models: [], warnings: [] });
    }
  });
});
