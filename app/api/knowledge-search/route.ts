import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const query: string = body.query?.trim();
    const limit: number = Math.min(Math.max(body.limit ?? 5, 1), 20);

    if (!query) {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 }
      );
    }

    // -------------------------------------------------------
    // Use full-text search (keyword-based) as the primary mode.
    // Once embeddings are populated, we can add a vector search
    // path that calls match_knowledge_chunks() with a real
    // query embedding from sentence-transformers.
    // -------------------------------------------------------

    const { data, error } = await supabase.rpc("search_knowledge_text", {
      search_query: query,
      match_count: limit,
    });

    if (error) {
      console.error("Knowledge search RPC error:", error);
      return NextResponse.json(
        { error: "Search failed: " + error.message },
        { status: 500 }
      );
    }

    // If full-text search returns nothing, fall back to a simple ILIKE query
    // so partial matches and short queries still return results.
    if (!data || data.length === 0) {
      const { data: fallback, error: fbError } = await supabase
        .from("knowledge_chunks")
        .select("id, content, source_video, source_url, tags, chunk_index")
        .or(
          `content.ilike.%${query}%,source_video.ilike.%${query}%`
        )
        .limit(limit);

      if (fbError) {
        console.error("Knowledge fallback search error:", fbError);
        return NextResponse.json(
          { error: "Search failed: " + fbError.message },
          { status: 500 }
        );
      }

      const results = (fallback ?? []).map((row) => ({
        ...row,
        rank: 0.1, // low relevance marker for ILIKE fallback
      }));

      return NextResponse.json({ results, mode: "keyword_fallback" });
    }

    return NextResponse.json({ results: data, mode: "fulltext" });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
