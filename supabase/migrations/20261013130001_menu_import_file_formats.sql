-- Expande formatos de importação da IA sem publicar cardápios ou afetar estoque.
-- O bucket privado e as políticas de upload da unidade vêm da migration de importação original.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/plain',
  'text/markdown'
]
where id = 'menu-imports';
