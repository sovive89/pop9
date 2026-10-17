import { describe, it, expect } from 'vitest';
import { parseOpenAIImageResponse } from '../../supabase/functions/_shared/openai-image-response';

describe('OpenAI image response', () => {
  it('preserves nonempty image strings', () => {
    expect(parseOpenAIImageResponse({ data: [{ b64_json: 'YWJj' }] })).toEqual({ b64_json: 'YWJj' });
    expect(parseOpenAIImageResponse({ data: [{ url: 'https://example.com/image.png' }] })).toEqual({ url: 'https://example.com/image.png' });
  });
  it('rejects malformed images before decoding or fetching', () => {
    for (const value of [null, [], {}, { data: null }, { data: [null] }, { data: [{ b64_json: 5, url: {} }] }, { data: [{ b64_json: '' }] }]) {
      expect(parseOpenAIImageResponse(value)).toBeNull();
    }
  });
});
