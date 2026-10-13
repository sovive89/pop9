import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { preprocessDocumentImage } from '@/lib/ocr-image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { RawMaterial } from '@/hooks/useStockData';

export type StockOCRItem = { descricao: string; quantidade: number | null; unidade: string; valorUnitario: number | null; lote?: string | null; validade?: string | null };
export default function StockOCRDialog({ open, onOpenChange, businessUnitId, materials, onReview }: { open: boolean; onOpenChange: (value: boolean) => void; businessUnitId: string; materials: RawMaterial[]; onReview: (item: StockOCRItem, materialId: string, mode: 'documento' | 'produtos') => void }) {
  const [mode, setMode] = useState<'documento' | 'produtos'>('documento');
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<StockOCRItem[]>([]);
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  async function read(file?: File) {
    if (!file || !businessUnitId || reading) return;
    setReading(true); setError(''); setItems([]); setTargets({}); setPreview(''); setWarnings([]);
    try {
      const prepared = file.type.startsWith('image/') ? await preprocessDocumentImage(file, { preserveColor: mode === 'produtos' }) : file;
      if (!prepared.size || prepared.size > 3 * 1024 * 1024) throw Error('Envie um arquivo de até 3 MB.');
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(prepared); });
      if (prepared.type.startsWith('image/')) setPreview(dataUrl);
      const { data, error: apiError } = await supabase.functions.invoke('stock-ocr', { body: { businessUnitId, requestId: crypto.randomUUID(), mode, base64: dataUrl.split(',')[1], mimeType: prepared.type, fileName: file.name } });
      if (apiError) { let message = 'Não foi possível consultar o OCR.'; try { const body = await apiError.context?.json(); if (typeof body?.error === 'string') message = body.error; } catch { /* sem corpo JSON */ } throw Error(message); }
      if (data?.error) throw Error(data.error);
      if (!Array.isArray(data?.draft?.itens)) throw Error('A IA retornou uma leitura inválida.');
      setItems(data.draft.itens); setWarnings(data.draft.avisos ?? []);
      if (!data.draft.itens.length) setError('Nenhum item identificado. Tente uma imagem mais próxima.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao ler o arquivo.'); }
    finally { setReading(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (reading) return; onOpenChange(value); if (!value) { setItems([]); setPreview(''); setError(''); setTargets({}); setWarnings([]); } }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Entrada por foto ou nota</DialogTitle><DialogDescription>A IA sugere os itens. Vincule ao cadastro e confira cada entrada antes de salvar.</DialogDescription></DialogHeader>
      <label className="space-y-1 text-sm">Tipo de leitura<select className="block w-full rounded border bg-background p-2" disabled={reading} value={mode} onChange={e => { setMode(e.target.value as typeof mode); setItems([]); setTargets({}); setPreview(''); setError(''); setWarnings([]); }}><option value="documento">Nota, cupom ou PDF</option><option value="produtos">Produtos, caixas ou geladeira</option></select></label>
      {mode === 'produtos' && <p className="text-sm text-muted-foreground">Escolha apenas mercadoria recém-colocada. Não conte novamente o estoque anterior. Caixas fechadas não revelam quantas unidades há dentro.</p>}
      <label className="space-y-1 text-sm">Escolher foto{mode === 'documento' ? ' ou PDF' : ''}<input className="block w-full text-sm" type="file" disabled={reading} accept={mode === 'documento' ? 'image/jpeg,image/png,image/webp,application/pdf' : 'image/jpeg,image/png,image/webp'} onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <label className="space-y-1 text-sm">Tirar foto<input className="block w-full text-sm" type="file" accept="image/*" capture="environment" disabled={reading} onChange={e => { void read(e.target.files?.[0]); e.target.value = ''; }} /></label>
      {reading && <p role="status">Lendo imagem...</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {preview && <img src={preview} alt="Imagem enviada para conferência" className="max-h-64 w-full rounded object-contain" />}
      {warnings.map((warning, i) => <p key={i} className="text-sm text-muted-foreground">{warning}</p>)}
      {items.map((item, index) => <div key={index} className="space-y-2 rounded border p-3"><p className="text-sm font-medium">{item.descricao}</p><p className="text-xs text-muted-foreground">Quantidade sugerida: {item.quantidade ?? 'não identificada'} {item.unidade}. Confira a unidade e a conversão.</p><label className="block text-xs">Item cadastrado<select aria-label={`Vincular ${item.descricao}`} className="mt-1 block w-full rounded border bg-background p-2" value={targets[index] ?? ''} onChange={e => setTargets(prev => ({ ...prev, [index]: e.target.value }))}><option value="">Selecione o item do estoque</option>{materials.filter(m => m.active && !m.isProduced).map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select></label><Button type="button" disabled={!targets[index] || reading} onClick={() => onReview(item, targets[index], mode)}>Conferir entrada deste item</Button></div>)}
    </DialogContent>
  </Dialog>;
}
