// ============================================================
// import-knowledge.ts — Import ChromaDB chunks into Supabase pgvector
// ============================================================
//
// USAGE:
//   1. Export chunks from the Streamlit app's ChromaDB to JSON.
//      In the Streamlit project directory, run a quick Python script:
//
//        import chromadb, json
//        client = chromadb.PersistentClient(path="knowledge_base/chroma_db")
//        col = client.get_collection("ict_transcripts")
//        data = col.get(include=["documents", "embeddings", "metadatas"])
//        chunks = []
//        for i in range(len(data["ids"])):
//            chunks.append({
//                "content": data["documents"][i],
//                "embedding": data["embeddings"][i] if data["embeddings"] else None,
//                "source_video": data["metadatas"][i].get("source", ""),
//                "source_url": data["metadatas"][i].get("url", ""),
//                "tags": data["metadatas"][i].get("tags", "").split(",") if data["metadatas"][i].get("tags") else [],
//                "chunk_index": data["metadatas"][i].get("chunk_index", i),
//            })
//        with open("knowledge_chunks_export.json", "w") as f:
//            json.dump(chunks, f)
//        print(f"Exported {len(chunks)} chunks")
//
//   2. Copy the JSON file to this project:
//        cp "/Users/sarajuana/ict mentor bot/knowledge_chunks_export.json" ./scripts/
//
//   3. Set environment variables:
//        export SUPABASE_URL="https://ovnspzlndkekmvtcrcwt.supabase.co"
//        export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
//
//   4. Run the import:
//        npx tsx scripts/import-knowledge.ts
//
//   5. After import, rebuild the IVFFlat index in the Supabase SQL editor:
//        DROP INDEX IF EXISTS knowledge_chunks_embedding_idx;
//        CREATE INDEX knowledge_chunks_embedding_idx
//          ON public.knowledge_chunks
//          USING ivfflat (embedding vector_cosine_ops)
//          WITH (lists = 50);
//
// ============================================================

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load .env.local
function loadEnv() {
  try {
    const envPath = path.resolve(__dirname, "../.env.local");
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  } catch { /* ignore */ }
}
loadEnv();

interface ChunkData {
  content: string;
  embedding: number[] | null;
  source_video: string;
  source_url: string;
  tags: string[];
  chunk_index: number;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BATCH_SIZE = 50;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "Error: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  const jsonPath =
    process.argv[2] ||
    path.join(__dirname, "knowledge_chunks_export.json");

  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: JSON file not found at ${jsonPath}`);
    console.error(
      "Export chunks from ChromaDB first (see instructions at top of this file)."
    );
    process.exit(1);
  }

  console.log(`Reading chunks from ${jsonPath}...`);
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const chunks: ChunkData[] = JSON.parse(raw);
  console.log(`Found ${chunks.length} chunks to import.`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Check if table already has data
  const { count } = await supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true });

  if (count && count > 0) {
    console.log(
      `Warning: knowledge_chunks table already has ${count} rows.`
    );
    console.log(
      "Continuing will add duplicates. Delete existing rows first if re-importing."
    );
  }

  let imported = 0;
  let errors = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    const rows = batch.map((chunk) => ({
      user_id: null, // shared/system data
      content: chunk.content,
      embedding: chunk.embedding
        ? JSON.stringify(chunk.embedding)
        : null,
      source_video: chunk.source_video || null,
      source_url: chunk.source_url || null,
      tags: chunk.tags?.length > 0 ? chunk.tags : null,
      chunk_index: chunk.chunk_index ?? null,
    }));

    const { error } = await supabase.from("knowledge_chunks").insert(rows);

    if (error) {
      console.error(
        `Error inserting batch ${i / BATCH_SIZE + 1}: ${error.message}`
      );
      errors += batch.length;
    } else {
      imported += batch.length;
    }

    // Progress log every 500 chunks
    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= chunks.length) {
      console.log(
        `Progress: ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} (${imported} imported, ${errors} errors)`
      );
    }
  }

  console.log("\n--- Import Complete ---");
  console.log(`Total chunks: ${chunks.length}`);
  console.log(`Imported: ${imported}`);
  console.log(`Errors: ${errors}`);

  if (imported > 0) {
    console.log(
      "\nNext step: Rebuild the IVFFlat index in Supabase SQL editor:"
    );
    console.log("  DROP INDEX IF EXISTS knowledge_chunks_embedding_idx;");
    console.log("  CREATE INDEX knowledge_chunks_embedding_idx");
    console.log("    ON public.knowledge_chunks");
    console.log("    USING ivfflat (embedding vector_cosine_ops)");
    console.log("    WITH (lists = 50);");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
