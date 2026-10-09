import { useRef, useState } from "react";
import { FileText, ClipboardList, Receipt, FolderOpen, Download, ImageIcon, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMenuDocuments } from "@/hooks/useMenuDocuments";
import { downloadBlob, safeFileName } from "@/utils/fileExport";
import { formatCurrency } from "@/utils/orders";

const groups = [
  { title: "Fichas técnicas", description: "Receitas, ingredientes e instruções de preparo.", icon: ClipboardList },
  { title: "Relatórios", description: "Documentos e relatórios exportados do ERP.", icon: FileText },
  { title: "Documentos fiscais", description: "Notas e arquivos fiscais vinculados à operação.", icon: Receipt },
  { title: "Arquivos administrativos", description: "Contratos e outros documentos do estabelecimento.", icon: FolderOpen },
];

export default function DocumentsTab() {
  const { items, loading, error, unitName, businessUnitId, reload, scope } = useMenuDocuments();
  const [search,setSearch] = useState("");
  const [exportState,setExportState] = useState({ scope,busy:false,progress:"",warning:"" });
  const activeScope = useRef(scope); activeScope.current=scope;
  const inProgress = useRef<string | null>(null);
  const busy = exportState.scope===scope && exportState.busy;
  const disabled = loading || error || !businessUnitId || !items.length || busy;
  const exportMenu = async (format:"pdf"|"ifood"|"99food") => {
    if(disabled || inProgress.current===scope)return;
    const requestScope=scope;
    inProgress.current=requestScope;
    setExportState({scope:requestScope,busy:true,progress:"Preparando arquivos...",warning:""});
    try {
      const {collectMenuImages,buildMenuPdf,buildMenuPackage}=await import("@/utils/menuExport");
      const {images,missing}=await collectMenuImages(items,(completed,total)=>{
        if(activeScope.current===requestScope)setExportState(prev=>({...prev,progress:`Preparando imagens: ${completed}/${total}`}));
      });
      const bytes=format==="pdf" ? await buildMenuPdf(unitName,items,images,message=>missing.push(message)) : await buildMenuPackage(format,unitName,items,images,missing);
      if(activeScope.current!==requestScope)return;
      downloadBlob(new Blob([bytes],{type:format==="pdf" ? "application/pdf" : "application/zip"}),`${safeFileName(unitName)}-cardapio${format==="pdf" ? "" : `-${format}`}.${format==="pdf" ? "pdf" : "zip"}`);
      setExportState({scope:requestScope,busy:false,progress:"",warning:missing.length ? `Observações sobre ${missing.length} imagem(ns): ${missing.join("; ")}` : ""});
      toast.success(format==="pdf" ? "Cardápio em PDF gerado" : `Pacote ${format==="ifood" ? "iFood" : "99Food"} gerado`);
    } catch {if(activeScope.current===requestScope){setExportState({scope:requestScope,busy:false,progress:"",warning:""});toast.error("Não foi possível gerar os arquivos. Tente novamente.");}}
    finally {if(inProgress.current===requestScope)inProgress.current=null;}
  };
  const downloadImage = async (id:string) => {
    const index=items.findIndex(item=>item.id===id);const item=items[index];const requestScope=scope;
    if(!item || !businessUnitId || busy)return;
    try {
      const {fetchMenuImage}=await import("@/utils/menuExport");
      const image=await fetchMenuImage(item,index);
      if(activeScope.current!==requestScope)return;
      downloadBlob(new Blob([image.bytes],{type:image.mime}),image.fileName.replace("imagens/",""));
    } catch {if(activeScope.current===requestScope)toast.error("Não foi possível baixar a imagem. Verifique o arquivo cadastrado.");}
  };
  const visibleItems=items.filter(item=>`${item.name} ${item.categoryLabel}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <section className="space-y-6">
    <div><h2 className="text-lg font-semibold text-foreground">Central de Documentos</h2><p className="text-sm text-muted-foreground">Cardápio, imagens dos itens e documentos do estabelecimento.</p></div>
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <h3 className="flex items-center gap-2 font-semibold"><UtensilsCrossed className="h-5 w-5 text-primary" />Cardápio e exportações</h3>
      <p className="text-sm text-muted-foreground">{unitName || "Selecione uma unidade"} · {items.length} {items.length === 1 ? "item ativo e publicado" : "itens ativos e publicados"}. Os arquivos usam o cadastro atual, incluindo categorias, descrições, preços, variações e adicionais.</p>
      {loading && <p role="status">Carregando cardápio...</p>}
      {error && <div role="alert">Não foi possível carregar o cardápio. <Button variant="outline" onClick={reload}>Tentar novamente</Button></div>}
      {!loading && !error && businessUnitId && !items.length && <p>Nenhum item ativo e publicado para exportar.</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled} onClick={()=>void exportMenu("pdf")}><FileText className="mr-2 h-4 w-4" />Baixar cardápio PDF</Button>
        <Button variant="outline" disabled={disabled} onClick={()=>void exportMenu("ifood")}><Download className="mr-2 h-4 w-4" />Exportar para iFood (ZIP)</Button>
        <Button variant="outline" disabled={disabled} onClick={()=>void exportMenu("99food")}><Download className="mr-2 h-4 w-4" />Exportar para 99Food (ZIP)</Button>
      </div>
      <p className="text-sm text-muted-foreground">Os pacotes incluem PDF, imagens, planilha de apoio e instruções. Extraia o ZIP e envie o PDF na opção de digitalização/envio de cardápio da plataforma. Revise os itens e vincule as fotos antes de publicar.</p>
      <p className="text-xs text-muted-foreground">O CSV serve para conferência e cadastro. A disponibilidade da importação por PDF no iFood depende da sua conta; a exportação não publica produtos automaticamente.</p>
      <div className="flex flex-wrap gap-4 text-xs"><a className="text-primary underline" href="https://blog-parceiros.ifood.com.br/files/relatorio_ifood_para_restaurantes.pdf" target="_blank" rel="noreferrer">Orientações iFood: digitalização de cardápio</a><a className="text-primary underline" href="https://99app.com/99food/restaurantes/guias/como-construir-o-seu-cardapio/" target="_blank" rel="noreferrer">Orientações 99Food: envio de cardápio</a></div>
      {busy && <p role="status" className="text-sm">{exportState.progress}</p>}
      {exportState.scope===scope && exportState.warning && <p role="alert" className="text-sm text-amber-500">{exportState.warning}</p>}
    </section>
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold"><ImageIcon className="h-5 w-5 text-primary" />Imagens dos itens</h3>
      <input aria-label="Buscar imagens por item ou categoria" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar item ou categoria" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleItems.map(item=><article key={item.id} className="overflow-hidden rounded-xl border border-border bg-card">
        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-36 w-full object-cover" /> : <div className="flex h-36 items-center justify-center bg-muted text-sm text-muted-foreground">Sem imagem cadastrada</div>}
        <div className="space-y-2 p-3"><h4 className="font-medium">{item.name}</h4><p className="text-xs text-muted-foreground">{item.categoryLabel} · {formatCurrency(item.price)}</p><Button size="sm" variant="outline" disabled={!item.imageUrl || busy} onClick={()=>void downloadImage(item.id)}>Baixar imagem</Button></div>
      </article>)}</div>
      {items.length>0 && !visibleItems.length && <p className="text-sm text-muted-foreground">Nenhum item corresponde à busca.</p>}
    </section>
    <section className="space-y-3"><h3 className="font-semibold">Outros documentos</h3><p className="text-sm text-muted-foreground">As informações operacionais continuam nos módulos de origem. O upload e o armazenamento de documentos administrativos ainda estão em preparação.</p>
      <div className="grid gap-3 sm:grid-cols-2">{groups.map(({title,description,icon:Icon})=><div key={title} className="rounded-xl border border-border bg-card p-5"><div className="flex items-center gap-3"><Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" /><h4 className="font-medium">{title}</h4></div><p className="mt-2 text-sm text-muted-foreground">{description}</p><p className="mt-3 text-xs text-muted-foreground">Em preparação</p></div>)}</div>
    </section>
  </section>;
}
