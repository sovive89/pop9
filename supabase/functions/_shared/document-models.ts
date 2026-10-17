import { CHAT_MODELS } from './assistant-help.ts';
export const DOCUMENT_MODELS = [
  { id: 'openai/gpt-6-astra', provider: 'openai', model: 'gpt-6-astra', label: 'GPT-6 Astra — OCR principal' },
  { id: 'openai/gpt-5.6-luna', provider: 'openai', model: 'gpt-5.6-luna', label: 'GPT-5.6 Luna — OCR alternativo' },
  ...CHAT_MODELS,
];
