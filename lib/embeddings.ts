// ============================================================
// Knowledge Base search helper
// ============================================================
// Two search modes:
//   1. Text search (keyword-based, always available) — uses Postgres full-text search
//   2. Vector search (semantic, requires embeddings) — uses pgvector cosine similarity
//
// Text search is the default until embeddings are populated.
// ============================================================

import { KnowledgeChunk } from "@/lib/types";

/**
 * Search the knowledge base via the /api/knowledge-search endpoint.
 * Works from both client and server components (calls the API route).
 */
export async function searchKnowledge(
  query: string,
  limit: number = 5
): Promise<KnowledgeChunk[]> {
  const res = await fetch("/api/knowledge-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Knowledge search failed");
  }

  const data = await res.json();
  return data.results as KnowledgeChunk[];
}
