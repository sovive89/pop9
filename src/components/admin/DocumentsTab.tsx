import { FileText, ClipboardList, Receipt, FolderOpen } from "lucide-react";

const groups = [
  { title: "Fichas técnicas", description: "Receitas, ingredientes e instruções de preparo.", icon: ClipboardList },
  { title: "Relatórios", description: "Documentos e relatórios exportados do ERP.", icon: FileText },
  { title: "Documentos fiscais", description: "Notas e arquivos fiscais vinculados à operação.", icon: Receipt },
  { title: "Arquivos administrativos", description: "Contratos e outros documentos do estabelecimento.", icon: FolderOpen },
];

export default function DocumentsTab() {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Central de Documentos</h2>
        <p className="text-sm text-muted-foreground">Organização dos documentos do estabelecimento em um único lugar.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        Estrutura inicial da central. A consulta, o upload e o armazenamento no Supabase ainda não estão disponíveis nesta tela.
        As informações operacionais continuam nos módulos de origem.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {groups.map(({ title, description, icon: Icon }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <h3 className="font-medium text-foreground">{title}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
            <p className="mt-3 text-xs text-muted-foreground">Em preparação</p>
          </div>
        ))}
      </div>
    </section>
  );
}
