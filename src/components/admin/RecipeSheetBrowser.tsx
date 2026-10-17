import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { exportJsonFiles } from "@/utils/recipeSheets";

type Sheet = {
  id: string; nome: string; tipo: string; descricao?: string;
  saida?: { quantidade: number; unidade: string | null };
  componentes: { nome: string | null; quantidade: number; unidade: string | null; ficha_id?: string }[];
};

export default function RecipeSheetBrowser({ businessUnitId }: { businessUnitId: string | null }) {
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<{ unit: string | null; sheets: Sheet[]; error: boolean }>({ unit: null, sheets: [], error: false });
  useEffect(() => {
    if (!businessUnitId) return;
    let disposed = false;
    void exportJsonFiles(businessUnitId).then(files => {
      if (!disposed) setState({ unit: businessUnitId, sheets: Object.values(files).map(file => JSON.parse(file) as Sheet), error: false });
    }).catch(() => { if (!disposed) setState({ unit: businessUnitId, sheets: [], error: true }); });
    return () => { disposed = true; };
  }, [businessUnitId, revision]);
  if (!businessUnitId) return <p>Selecione uma unidade para consultar as fichas.</p>;
  const visible = state.unit === businessUnitId;
  const sheets = visible ? state.sheets : [];
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><input aria-label="Buscar ficha técnica" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar ficha técnica" className="min-w-0 flex-1 rounded-md border bg-background p-2 text-sm" /><Button variant="outline" onClick={() => { setState({ unit: null, sheets: [], error: false }); setRevision(value => value + 1); }}>Atualizar fichas</Button></div>
    {!visible ? <p role="status">Carregando fichas...</p> : state.error ? <p role="alert">Não foi possível carregar as fichas. Tente atualizar.</p> : !sheets.length ? <p>Nenhuma ficha cadastrada nesta unidade.</p> : <>
      {sheets.filter(sheet => sheet.nome.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(sheet => <details key={sheet.id} className="rounded-lg border p-3">
        <summary className="cursor-pointer font-medium">{sheet.nome} · {sheet.tipo === "cardapio" ? "Cardápio" : "Produção"}</summary>
        <div className="mt-3 space-y-3 text-sm">
          {sheet.descricao && <p>{sheet.descricao}</p>}
          <p>Rendimento: {sheet.saida ? `${sheet.saida.quantidade} ${sheet.saida.unidade ?? ""}` : "1 item vendido"}</p>
          {sheet.componentes.length ? <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Ingrediente</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>{sheet.componentes.map((line, index) => <tr key={index} className="border-t"><td className="py-2">{line.nome ?? "Insumo não informado"}{line.ficha_id && <span className="block text-xs text-muted-foreground">Preparo com ficha própria</span>}</td><td>{line.quantidade}</td><td>{line.unidade ?? "—"}</td></tr>)}</tbody></table></div> : <p>Sem ingredientes cadastrados.</p>}
          <p className="text-muted-foreground">Modo de preparo: ainda não cadastrado.</p>
        </div>
      </details>)}
      {!sheets.some(sheet => sheet.nome.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))) && <p>Nenhuma ficha corresponde à busca.</p>}
    </>}
  </div>;
}
