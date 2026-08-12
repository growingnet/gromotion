import type { RunBundle, RunSummary } from "../types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText} ${detail}`.trim());
  }
  return (await response.json()) as T;
}

export const listRuns = () => getJson<RunSummary[]>("/api/runs");

export const fetchRunBundle = (runId: string) =>
  getJson<RunBundle>(`/api/runs/${encodeURIComponent(runId)}/bundle`);
