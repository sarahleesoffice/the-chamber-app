/**
 * Import Gamma cards and Discord references from the Streamlit app's concept_index.json
 *
 * Usage:
 *   npx tsx scripts/import-gamma-discord.ts
 *
 * Prerequisites:
 *   1. Run migration 005_gamma_and_discord.sql in Supabase SQL Editor
 *   2. Set SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local manually (no dotenv dependency needed)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, "../.env.local");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

interface Collection {
  label: string;
  folder: string;
  discord_thread: string | null;
  gamma_url: string | null;
  slides?: Array<{
    file: string;
    title: string;
    keywords?: string[];
  }>;
}

interface ConceptIndex {
  _meta: Record<string, string>;
  collections: Record<string, Collection>;
}

async function main() {
  // Load concept_index.json from the Streamlit app
  const indexPath = resolve(__dirname, "../../ict mentor bot/knowledge_base/concept_index.json");

  let data: ConceptIndex;
  try {
    data = JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch {
    console.error("Could not read concept_index.json at:", indexPath);
    console.error("Make sure the Streamlit app is at /Users/sarajuana/ict mentor bot/");
    process.exit(1);
  }

  const collections = data.collections || {};
  console.log(`Found ${Object.keys(collections).length} collections\n`);

  const discordRows: Array<{
    concept: string;
    thread_title: string;
    thread_url: string;
    channel_name: string;
    description: string;
    tags: string[];
  }> = [];

  const gammaRows: Array<{
    title: string;
    content: string;
    category: string;
    deck_name: string;
    gamma_url: string;
    tags: string[];
  }> = [];

  for (const [key, coll] of Object.entries(collections)) {
    // Discord references
    if (coll.discord_thread) {
      discordRows.push({
        concept: coll.label,
        thread_title: `${coll.label} — Study Thread`,
        thread_url: coll.discord_thread,
        channel_name: "#ict-study-materials",
        description: `Discussion thread for ${coll.label} with study cards, chart examples, and concept breakdowns.`,
        tags: key.split("-").filter(w => w.length > 2),
      });
    }

    // Gamma cards — create entries from slides
    if (coll.slides && coll.slides.length > 0) {
      for (const slide of coll.slides) {
        gammaRows.push({
          title: slide.title || `${coll.label} Slide`,
          content: slide.title || "",  // We'll enrich this later with actual slide content
          category: coll.label,
          deck_name: coll.label,
          gamma_url: coll.gamma_url || "",
          tags: slide.keywords || key.split("-").filter(w => w.length > 2),
        });
      }
    } else if (coll.gamma_url) {
      // Collection has a Gamma URL but no individual slides — create one entry
      gammaRows.push({
        title: coll.label,
        content: `${coll.label} — Gamma study deck covering SMC concepts.`,
        category: coll.label,
        deck_name: coll.label,
        gamma_url: coll.gamma_url,
        tags: key.split("-").filter(w => w.length > 2),
      });
    }
  }

  // Insert Discord references
  if (discordRows.length > 0) {
    console.log(`Inserting ${discordRows.length} Discord references...`);
    const { error } = await supabase.from("discord_references").insert(discordRows);
    if (error) {
      console.error("Discord insert error:", error.message);
    } else {
      console.log(`✅ ${discordRows.length} Discord references inserted`);
    }
  }

  // Insert Gamma cards
  if (gammaRows.length > 0) {
    console.log(`Inserting ${gammaRows.length} Gamma cards...`);
    const { error } = await supabase.from("gamma_cards").insert(gammaRows);
    if (error) {
      console.error("Gamma insert error:", error.message);
    } else {
      console.log(`✅ ${gammaRows.length} Gamma cards inserted`);
    }
  }

  console.log("\nDone! The AI Chat will now reference these when answering SMC questions.");
}

main().catch(console.error);
