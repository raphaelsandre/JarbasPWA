export class AdminApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface Overview {
  model: string;
  tables: number;
  rows: number;
  tools: number;
  tools_enabled: number;
}

export interface ModelCatalog {
  active: string;
  available: string[];
}

export interface DatabaseTable {
  name: string;
  rows: number;
}

export interface TableData {
  table: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  endpoint: string;
  method: "POST" | "PUT" | "PATCH";
  timeout_seconds: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type ToolPayload = Omit<ToolDefinition, "id" | "created_at" | "updated_at">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const payload = await response.json() as { detail?: string };
        if (payload.detail) message = payload.detail;
      } catch {
        // Respostas de proxy podem não ser JSON.
      }
      throw new AdminApiError(response.status, message);
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const adminApi = {
  overview: () => request<Overview>("/admin/overview"),
  models: () => request<ModelCatalog>("/admin/models"),
  selectModel: (model: string) => request<ModelCatalog>("/admin/models", {
    method: "PUT",
    body: JSON.stringify({ model }),
  }),
  tables: () => request<DatabaseTable[]>("/admin/database"),
  table: (name: string, offset = 0) =>
    request<TableData>(`/admin/database/${encodeURIComponent(name)}?limit=50&offset=${offset}`),
  tools: () => request<ToolDefinition[]>("/admin/tools"),
  createTool: (payload: ToolPayload) => request<ToolDefinition>("/admin/tools", {
    method: "POST",
    body: JSON.stringify(payload),
  }),
  updateTool: (id: string, payload: ToolPayload) =>
    request<ToolDefinition>(`/admin/tools/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTool: (id: string) => request<void>(`/admin/tools/${id}`, {
    method: "DELETE",
  }),
};
