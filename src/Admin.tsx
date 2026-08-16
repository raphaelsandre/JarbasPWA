import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  AdminApiError,
  adminApi,
  DatabaseTable,
  ModelCatalog,
  Overview,
  TableData,
  ToolDefinition,
  ToolPayload,
} from "./adminApi";

type AdminSection = "overview" | "database" | "models" | "tools";

const EMPTY_TOOL: ToolPayload = {
  name: "",
  description: "",
  endpoint: "",
  method: "POST",
  timeout_seconds: 20,
  enabled: true,
};

function readableError(error: unknown): string {
  if (error instanceof AdminApiError && (error.status === 401 || error.status === 403)) {
    return "Sua sessão não tem permissão para administrar o Jarbas.";
  }
  return error instanceof Error ? error.message : "Não foi possível carregar o backend.";
}

function Loading() {
  return <div className="admin-loading"><span /><span /><span /> Carregando backend</div>;
}

function ErrorNotice({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="admin-error" role="alert">
      <div><strong>Algo não respondeu</strong><p>{message}</p></div>
      <button type="button" onClick={retry}>Tentar novamente</button>
    </div>
  );
}

function OverviewPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    void adminApi.overview().then(setData).catch((cause) => setError(readableError(cause)));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNotice message={error} retry={load} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="admin-heading">
        <div><span className="section-kicker">Visão geral</span><h1>Backend sob controle.</h1></div>
        <span className="live-pill"><i /> Operacional</span>
      </div>
      <div className="metric-grid">
        <article className="metric-card metric-card--primary">
          <span>Modelo ativo</span><strong>{data.model}</strong><small>Aplicado ao thinking e responder</small>
        </article>
        <article className="metric-card"><span>Registros</span><strong>{data.rows}</strong><small>em {data.tables} tabelas</small></article>
        <article className="metric-card"><span>Tools ativas</span><strong>{data.tools_enabled}</strong><small>{data.tools} cadastradas</small></article>
      </div>
      <section className="admin-card system-card">
        <div className="system-orb"><img src="/icons/jarbas-logo.jpg" alt="" /></div>
        <div><span className="section-kicker">Sandre AI Core</span><h2>Jarbas conectado ao seu ecossistema</h2>
          <p>Mensagens em tempo real pelo PieSocket, estado persistente e administração centralizada.</p></div>
      </section>
    </>
  );
}

function ModelsPanel() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    setNotice(null);
    void adminApi.models()
      .then((value) => { setCatalog(value); setSelected(value.active); })
      .catch((cause) => setNotice(readableError(cause)));
  }, []);
  useEffect(load, [load]);

  const save = async () => {
    if (!selected || selected === catalog?.active) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await adminApi.selectModel(selected);
      setCatalog(result);
      setNotice("Modelo alterado e persistido.");
    } catch (cause) {
      setNotice(readableError(cause));
    } finally {
      setSaving(false);
    }
  };

  if (!catalog && !notice) return <Loading />;
  return (
    <>
      <div className="admin-heading"><div><span className="section-kicker">Inferência</span><h1>Escolha o cérebro.</h1>
        <p>O modelo muda em runtime e permanece ativo após reiniciar o Jarbas.</p></div></div>
      {notice && <div className="inline-notice" role="status">{notice}</div>}
      {catalog && (
        <section className="admin-card model-picker">
          <label htmlFor="model-select">Modelo disponível no provedor</label>
          <select id="model-select" value={selected} onChange={(event) => setSelected(event.target.value)}>
            {catalog.available.map((model) => <option key={model} value={model}>{model}</option>)}
          </select>
          <div className="model-current"><span>Em uso agora</span><strong>{catalog.active}</strong></div>
          <button className="primary-action" type="button" disabled={saving || selected === catalog.active} onClick={() => void save()}>
            {saving ? "Aplicando…" : "Usar este modelo"}
          </button>
        </section>
      )}
    </>
  );
}

function displayCell(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
  }
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

function DatabasePanel() {
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [selected, setSelected] = useState("");
  const [data, setData] = useState<TableData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTables = useCallback(() => {
    setError(null);
    void adminApi.tables().then((items) => {
      setTables(items);
      if (items.length && !selected) setSelected(items[0].name);
    }).catch((cause) => setError(readableError(cause)));
  }, [selected]);
  useEffect(loadTables, []);
  useEffect(() => {
    if (!selected) return;
    setData(null);
    void adminApi.table(selected)
      .then(setData)
      .catch((cause) => setError(readableError(cause)));
  }, [selected]);

  return (
    <>
      <div className="admin-heading"><div><span className="section-kicker">SQLite</span><h1>Dados sem caixa-preta.</h1>
        <p>Visualização paginada e somente leitura das tabelas do Jarbas.</p></div></div>
      {error && <ErrorNotice message={error} retry={loadTables} />}
      <div className="database-layout">
        <aside className="table-list" aria-label="Tabelas do banco">
          {tables.map((table) => (
            <button className={selected === table.name ? "active" : ""} type="button" key={table.name} onClick={() => setSelected(table.name)}>
              <span>{table.name}</span><small>{table.rows}</small>
            </button>
          ))}
        </aside>
        <section className="admin-card data-card">
          {!data ? <Loading /> : (
            <>
              <div className="data-card-head"><div><strong>{data.table}</strong><span>{data.total} registros</span></div>
                <button type="button" onClick={() => void adminApi.table(selected).then(setData)}>Atualizar</button></div>
              <div className="data-table-scroll">
                <table><thead><tr>{data.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                  <tbody>{data.rows.map((row, index) => (
                    <tr key={String(row.id ?? index)}>{data.columns.map((column) => <td key={column}><pre>{displayCell(row[column])}</pre></td>)}</tr>
                  ))}</tbody></table>
                {!data.rows.length && <p className="empty-state">Esta tabela ainda está vazia.</p>}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function ToolsPanel() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [form, setForm] = useState<ToolPayload>(EMPTY_TOOL);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    void adminApi.tools().then(setTools).catch((cause) => setNotice(readableError(cause)));
  }, []);
  useEffect(load, [load]);

  const edit = (tool: ToolDefinition) => {
    setEditing(tool.id);
    setForm({
      name: tool.name, description: tool.description, endpoint: tool.endpoint,
      method: tool.method, timeout_seconds: tool.timeout_seconds, enabled: tool.enabled,
    });
    setOpen(true);
  };
  const reset = () => { setOpen(false); setEditing(null); setForm(EMPTY_TOOL); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      if (editing) await adminApi.updateTool(editing, form);
      else await adminApi.createTool(form);
      reset();
      load();
    } catch (cause) {
      setNotice(readableError(cause));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (tool: ToolDefinition) => {
    await adminApi.updateTool(tool.id, {
      name: tool.name, description: tool.description, endpoint: tool.endpoint,
      method: tool.method, timeout_seconds: tool.timeout_seconds, enabled: !tool.enabled,
    });
    load();
  };

  const remove = async (tool: ToolDefinition) => {
    if (!window.confirm(`Remover a tool ${tool.name}?`)) return;
    await adminApi.deleteTool(tool.id);
    load();
  };

  return (
    <>
      <div className="admin-heading"><div><span className="section-kicker">Orchestrator</span><h1>Tools do seu jeito.</h1>
        <p>Cadastre webhooks em origens autorizadas pelo servidor e ligue cada um a uma intent.</p></div>
        <button className="primary-action" type="button" onClick={() => { reset(); setOpen(true); }}>Nova tool</button></div>
      {notice && <div className="inline-notice" role="status">{notice}</div>}
      {open && (
        <form className="admin-card tool-form" onSubmit={(event) => void submit(event)}>
          <div className="form-head"><h2>{editing ? "Editar tool" : "Cadastrar tool"}</h2><button type="button" onClick={reset} aria-label="Fechar">×</button></div>
          <div className="form-grid">
            <label>Nome da intent<input required pattern="[a-z][a-z0-9_.-]+" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="casa.luzes" /></label>
            <label>Método<select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as ToolPayload["method"] })}><option>POST</option><option>PUT</option><option>PATCH</option></select></label>
            <label className="span-2">Descrição para o thinking<input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Liga e desliga as luzes da casa" /></label>
            <label className="span-2">Endpoint autorizado<input required type="url" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} placeholder="https://automacao.exemplo/webhook/luzes" /></label>
            <label>Timeout (segundos)<input required type="number" min="1" max="120" value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) })} /></label>
            <label className="toggle-label"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />Ativa</label>
          </div>
          <div className="form-actions"><button type="button" onClick={reset}>Cancelar</button><button className="primary-action" disabled={saving}>{saving ? "Salvando…" : "Salvar tool"}</button></div>
        </form>
      )}
      <div className="tool-grid">
        {tools.map((tool) => (
          <article className={`admin-card tool-card ${tool.enabled ? "" : "disabled"}`} key={tool.id}>
            <div className="tool-card-head"><span className="tool-glyph">⌁</span><span className={`status-dot ${tool.enabled ? "on" : ""}`} /></div>
            <h2>{tool.name}</h2><p>{tool.description}</p><code>{tool.method} {tool.endpoint}</code>
            <div className="tool-actions"><button type="button" onClick={() => void toggle(tool)}>{tool.enabled ? "Desativar" : "Ativar"}</button><button type="button" onClick={() => edit(tool)}>Editar</button><button className="danger-link" type="button" onClick={() => void remove(tool)}>Remover</button></div>
          </article>
        ))}
        {!tools.length && <div className="admin-card empty-tool"><strong>Nenhuma tool cadastrada</strong><p>Adicione um webhook para ampliar o orchestrator.</p></div>}
      </div>
    </>
  );
}

export default function AdminConsole() {
  const [section, setSection] = useState<AdminSection>("overview");
  const items: Array<[AdminSection, string, string]> = [
    ["overview", "◈", "Visão geral"], ["database", "▦", "Banco de dados"],
    ["models", "◎", "Modelos"], ["tools", "⌁", "Tools"],
  ];
  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Administração">
        {items.map(([id, icon, label]) => <button type="button" key={id} className={section === id ? "active" : ""} onClick={() => setSection(id)}><i>{icon}</i><span>{label}</span></button>)}
      </nav>
      <main className="admin-content">
        {section === "overview" && <OverviewPanel />}
        {section === "database" && <DatabasePanel />}
        {section === "models" && <ModelsPanel />}
        {section === "tools" && <ToolsPanel />}
      </main>
    </div>
  );
}
