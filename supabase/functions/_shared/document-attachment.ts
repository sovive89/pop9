/** Arquivo enviado ao modelo; planilhas e texto são enviados como texto. */
export type ModelAttachment = {
  kind: 'pdf' | 'image';
  mime: string;
  data: string;
  name: string;
};
