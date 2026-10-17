import React, { useState } from "react";
import {
  Printer, Plus, Trash2, Check, Percent, Tag, Ruler, MapPin,
  Zap, X, Server, ChevronRight, Info,
} from "lucide-react";

/**
 * Módulo de Configurações — pop9
 * -------------------------------------------------------------
 * Scaffold de frontend (tema escuro, sotaque laranja do app).
 * Estado em memória (React) — os pontos de gravação estão
 * marcados com  // TODO Supabase  para você ligar depois.
 *
 *   Carregar:  useEffect(() => supabase.from(...).select() ...)
 *   Salvar:    handleSave() -> supabase.from(...).upsert(...)
 * -------------------------------------------------------------
 */

// -------- paleta (do print do app) --------
const C = {
  bg: "#0E0D0C",
  panel: "#171513",
  panel2: "#1E1B18",
  border: "#2A2622",
  input: "#131110",
  accent: "#E8641A",
  accentSoft: "rgba(232,100,26,0.12)",
  primary: "#B9822F",
  primaryHover: "#CB9138",
  text: "#F2EEE9",
  muted: "#A79E96",
  faint: "#6E6862",
  danger: "#C24A3A",
  ok: "#4E9A6B",
};

const SERVER_TYPES = [
  { id: "agente", nome: "Agente local", desc: "Um aparelho sempre ligado no bar escuta os pedidos e envia pras impressoras da rede." },
  { id: "cloudprnt", nome: "CloudPRNT (puxada)", desc: "A própria impressora consulta o servidor e baixa os jobs. Sem aparelho extra." },
  { id: "navegador", nome: "Navegador / Tablet", desc: "O tablet do setor imprime direto. Simples, mas exige o app aberto." },
  { id: "custom", nome: "Personalizado", desc: "Outro método de entrega, configurável depois." },
];
const DESTINOS = ["Cozinha", "Bar", "Caixa"];

const uid = () => Math.random().toString(36).slice(2, 9);

// ---------- primitivos ----------
function Title({ children }) {
  return (
    <h1 style={{ color: C.text, letterSpacing: "0.04em", fontWeight: 800 }}
        className="text-xl uppercase">{children}</h1>
  );
}
function SectionLabel({ icon: Icon, children, hint }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color: C.accent }} />
        <span style={{ color: C.text, letterSpacing: "0.06em", fontWeight: 700 }}
              className="text-xs uppercase">{children}</span>
      </div>
      {hint && <p style={{ color: C.faint }} className="text-xs mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
function Panel({ children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, ...style }}
         className="p-4">{children}</div>
  );
}
function Field({ label, children }) {
  return (
    <label className="block">
      <span style={{ color: C.muted }} className="text-xs">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
const inputStyle = {
  background: C.input, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 12, padding: "10px 12px", width: "100%", fontSize: 14, outline: "none",
};
function TextInput(props) { return <input {...props} style={{ ...inputStyle, ...props.style }} />; }
function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={onChange}
      style={{ ...inputStyle, appearance: "none" }}>
      {options.map((o) => (
        <option key={o.value ?? o} value={o.value ?? o} style={{ background: C.panel2 }}>
          {o.label ?? o}
        </option>
      ))}
    </select>
  );
}
function IconBtn({ onClick, children, danger }) {
  return (
    <button onClick={onClick}
      style={{ border: `1px solid ${C.border}`, background: C.panel2,
               color: danger ? C.danger : C.muted, borderRadius: 10 }}
      className="p-2 flex items-center justify-center active:opacity-70">{children}</button>
  );
}
function GhostBtn({ onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ border: `1px dashed ${C.border}`, color: C.muted, borderRadius: 12 }}
      className="w-full py-2.5 flex items-center justify-center gap-2 text-sm active:opacity-70">
      {children}
    </button>
  );
}
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width: 44, height: 26, borderRadius: 999, padding: 3,
               background: on ? C.accent : C.border, transition: "background .15s" }}
      className="flex items-center">
      <span style={{ width: 20, height: 20, borderRadius: 999, background: "#fff",
                     transform: on ? "translateX(18px)" : "translateX(0)", transition: "transform .15s" }} />
    </button>
  );
}
// removable chip list
function Chips({ items, onAdd, onRemove, placeholder }) {
  const [val, setVal] = useState("");
  const add = () => { const v = val.trim(); if (v) { onAdd(v); setVal(""); } };
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((it) => (
          <span key={it} style={{ background: C.accentSoft, border: `1px solid ${C.border}`, color: C.text, borderRadius: 999 }}
                className="pl-3 pr-1.5 py-1 text-sm flex items-center gap-1">
            {it}
            <button onClick={() => onRemove(it)} style={{ color: C.faint }} className="p-0.5 active:opacity-60"><X size={13} /></button>
          </span>
        ))}
        {items.length === 0 && <span style={{ color: C.faint }} className="text-xs py-1">Nada por aqui ainda.</span>}
      </div>
      <div className="flex gap-2">
        <TextInput value={val} placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add}
          style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.accent, borderRadius: 12 }}
          className="px-4 active:opacity-70"><Plus size={18} /></button>
      </div>
    </div>
  );
}

// ================= módulo =================
export default function ConfiguracoesModule() {
  const [tab, setTab] = useState("impressao");
  const [saved, setSaved] = useState(false);

  // --- impressão ---
  const [servidores, setServidores] = useState([
    { id: "srv1", nome: "Servidor da cozinha", tipo: "agente", ativo: true },
  ]);
  const [impressoras, setImpressoras] = useState([
    { id: "imp1", nome: "Impressora Cozinha", destino: "Cozinha", servidorId: "srv1", ativo: true },
    { id: "imp2", nome: "Impressora Caixa", destino: "Caixa", servidorId: "srv1", ativo: true },
  ]);
  const [gatilhos, setGatilhos] = useState([
    { id: "g1", nome: "Pedido confirmado", imprime: "Ficha de preparo (KOT)", destinos: "Cozinha · Bar", on: true },
    { id: "g2", nome: "Conta fechada", imprime: "Comanda / conta", destinos: "Caixa", on: true },
  ]);

  // --- operação / catálogo ---
  const [taxa, setTaxa] = useState(10);
  const [zonas, setZonas] = useState(["Salão", "Varanda", "Bar"]);
  const [categorias, setCategorias] = useState(["Carnes", "Hortifruti", "Bebidas", "Laticínios", "Mercearia"]);
  const [unidades, setUnidades] = useState([
    { u: "kg", on: true }, { u: "L", on: true }, { u: "un", on: true }, { u: "g", on: true }, { u: "ml", on: true },
  ]);

  const handleSave = () => {
    // TODO Supabase: upsert das configs (servidores, impressoras, gatilhos, taxa, zonas, categorias, unidades)
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const tipoNome = (id) => SERVER_TYPES.find((t) => t.id === id)?.nome ?? id;

  const TABS = [
    { id: "impressao", label: "Impressão" },
    { id: "operacao", label: "Operação" },
    { id: "catalogo", label: "Catálogo" },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}
         className="mx-auto max-w-md px-4 pt-6 pb-28">
      <div className="flex items-center gap-2 mb-1">
        <Server size={18} style={{ color: C.accent }} />
        <Title>Configurações</Title>
      </div>
      <p style={{ color: C.faint }} className="text-xs mb-5">Como o sistema imprime, cobra e organiza o estoque.</p>

      {/* tabs */}
      <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 14 }}
           className="flex p-1 mb-5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ background: tab === t.id ? C.accent : "transparent",
                     color: tab === t.id ? "#fff" : C.muted, borderRadius: 10, fontWeight: 600 }}
            className="flex-1 py-2 text-sm transition-colors">{t.label}</button>
        ))}
      </div>

      {/* ---------------- IMPRESSÃO ---------------- */}
      {tab === "impressao" && (
        <div className="space-y-5">
          {/* servidores */}
          <Panel>
            <SectionLabel icon={Server} hint="Como o job de impressão chega até a impressora. Aberto a vários tipos — troque o método sem mexer no resto.">
              Servidores de impressão
            </SectionLabel>
            <div className="space-y-3">
              {servidores.map((s) => (
                <div key={s.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12 }} className="p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <TextInput value={s.nome} onChange={(e) =>
                      setServidores((prev) => prev.map((x) => x.id === s.id ? { ...x, nome: e.target.value } : x))} />
                    <Toggle on={s.ativo} onClick={() =>
                      setServidores((prev) => prev.map((x) => x.id === s.id ? { ...x, ativo: !x.ativo } : x))} />
                    <IconBtn danger onClick={() => setServidores((prev) => prev.filter((x) => x.id !== s.id))}><Trash2 size={16} /></IconBtn>
                  </div>
                  <Field label="Tipo de servidor">
                    <Select value={s.tipo}
                      onChange={(e) => setServidores((prev) => prev.map((x) => x.id === s.id ? { ...x, tipo: e.target.value } : x))}
                      options={SERVER_TYPES.map((t) => ({ value: t.id, label: t.nome }))} />
                  </Field>
                  <p style={{ color: C.faint }} className="text-xs mt-2 leading-snug flex gap-1.5">
                    <Info size={13} style={{ marginTop: 1, flexShrink: 0 }} />
                    {SERVER_TYPES.find((t) => t.id === s.tipo)?.desc}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <GhostBtn onClick={() => setServidores((p) => [...p, { id: uid(), nome: "Novo servidor", tipo: "agente", ativo: true }])}>
                <Plus size={16} /> Adicionar servidor
              </GhostBtn>
            </div>
          </Panel>

          {/* impressoras */}
          <Panel>
            <SectionLabel icon={Printer} hint="O destino físico. Cada impressora usa um servidor acima.">
              Impressoras
            </SectionLabel>
            <div className="space-y-3">
              {impressoras.map((imp) => (
                <div key={imp.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12 }} className="p-3">
                  <div className="flex items-center gap-2 mb-3">
                    <TextInput value={imp.nome} onChange={(e) =>
                      setImpressoras((prev) => prev.map((x) => x.id === imp.id ? { ...x, nome: e.target.value } : x))} />
                    <IconBtn danger onClick={() => setImpressoras((prev) => prev.filter((x) => x.id !== imp.id))}><Trash2 size={16} /></IconBtn>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Destino">
                      <Select value={imp.destino}
                        onChange={(e) => setImpressoras((prev) => prev.map((x) => x.id === imp.id ? { ...x, destino: e.target.value } : x))}
                        options={DESTINOS} />
                    </Field>
                    <Field label="Servidor">
                      <Select value={imp.servidorId}
                        onChange={(e) => setImpressoras((prev) => prev.map((x) => x.id === imp.id ? { ...x, servidorId: e.target.value } : x))}
                        options={servidores.map((s) => ({ value: s.id, label: s.nome }))} />
                    </Field>
                  </div>
                  <button
                    style={{ color: C.accent, border: `1px solid ${C.border}`, borderRadius: 10, background: C.accentSoft }}
                    className="mt-3 w-full py-2 text-sm flex items-center justify-center gap-2 active:opacity-70"
                    onClick={() => { /* TODO Supabase: inserir print_job de teste */ }}>
                    <Printer size={15} /> Imprimir teste
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <GhostBtn onClick={() => setImpressoras((p) => [...p, { id: uid(), nome: "Nova impressora", destino: "Cozinha", servidorId: servidores[0]?.id, ativo: true }])}>
                <Plus size={16} /> Adicionar impressora
              </GhostBtn>
            </div>
          </Panel>

          {/* gatilhos */}
          <Panel>
            <SectionLabel icon={Zap} hint="Quando cada impressão dispara. O gatilho só enfileira o job — a impressora física puxa depois.">
              Gatilhos de impressão
            </SectionLabel>
            <div className="space-y-2">
              {gatilhos.map((g) => (
                <div key={g.id} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12 }}
                     className="p-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div style={{ color: C.text }} className="text-sm font-semibold">{g.nome}</div>
                    <div style={{ color: C.faint }} className="text-xs mt-0.5">{g.imprime} → {g.destinos}</div>
                  </div>
                  <Toggle on={g.on} onClick={() => setGatilhos((prev) => prev.map((x) => x.id === g.id ? { ...x, on: !x.on } : x))} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* ---------------- OPERAÇÃO ---------------- */}
      {tab === "operacao" && (
        <div className="space-y-5">
          <Panel>
            <SectionLabel icon={Percent} hint="Entra no cálculo da conta (total_servico em session_balances).">
              Taxa de serviço
            </SectionLabel>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <TextInput type="number" value={taxa} onChange={(e) => setTaxa(e.target.value)} style={{ paddingRight: 34 }} />
                <span style={{ color: C.faint, position: "absolute", right: 12, top: 10 }} className="text-sm">%</span>
              </div>
              <span style={{ color: C.faint }} className="text-xs">aplicada sobre o consumo</span>
            </div>
          </Panel>

          <Panel>
            <SectionLabel icon={MapPin} hint="Áreas do salão para organizar as mesas (sessions.zone).">
              Zonas / setores
            </SectionLabel>
            <Chips items={zonas} placeholder="Ex.: Mezanino"
              onAdd={(v) => setZonas((p) => [...p, v])}
              onRemove={(v) => setZonas((p) => p.filter((x) => x !== v))} />
          </Panel>
        </div>
      )}

      {/* ---------------- CATÁLOGO ---------------- */}
      {tab === "catalogo" && (
        <div className="space-y-5">
          <Panel>
            <SectionLabel icon={Tag} hint="Agrupam os itens do estoque (raw_materials.categoria).">
              Categorias de item
            </SectionLabel>
            <Chips items={categorias} placeholder="Ex.: Congelados"
              onAdd={(v) => setCategorias((p) => [...p, v])}
              onRemove={(v) => setCategorias((p) => p.filter((x) => x !== v))} />
          </Panel>

          <Panel>
            <SectionLabel icon={Ruler} hint="As unidades disponíveis no cadastro de itens.">
              Unidades base
            </SectionLabel>
            <div className="space-y-2">
              {unidades.map((it, i) => (
                <div key={it.u} style={{ background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12 }}
                     className="p-3 flex items-center justify-between">
                  <span style={{ color: C.text }} className="text-sm font-medium">{it.u}</span>
                  <Toggle on={it.on} onClick={() => setUnidades((p) => p.map((x, j) => j === i ? { ...x, on: !x.on } : x))} />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* barra salvar */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0,
                    background: "linear-gradient(to top, " + C.bg + " 70%, transparent)" }}
           className="px-4 pt-6 pb-5">
        <div className="mx-auto max-w-md">
          <button onClick={handleSave}
            style={{ background: saved ? C.ok : C.primary, color: "#fff", borderRadius: 14, fontWeight: 700, letterSpacing: "0.02em" }}
            className="w-full py-3.5 flex items-center justify-center gap-2 active:opacity-90">
            {saved ? (<><Check size={18} /> Salvo</>) : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
