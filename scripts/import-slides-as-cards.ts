/**
 * Import concept slide filenames as Gamma cards from the Streamlit app's concept_slides directory
 * Maps each slide to its collection's Discord thread and Gamma URL
 *
 * Usage: npx tsx scripts/import-slides-as-cards.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve, basename } from "path";

// Load .env.local
function loadEnv() {
  try {
    const lines = readFileSync(resolve(__dirname, "../.env.local"), "utf-8").split("\n");
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

// Load concept_index.json to get discord/gamma URLs per collection
const indexPath = resolve(__dirname, "../../ict mentor bot/knowledge_base/concept_index.json");
const conceptIndex = JSON.parse(readFileSync(indexPath, "utf-8"));
const collections = conceptIndex.collections || {};

// Map folder names to collection data
const folderToCollection: Record<string, { label: string; discord_thread: string | null; gamma_url: string | null }> = {};
for (const [, coll] of Object.entries(collections) as [string, any][]) {
  if (coll.folder) {
    folderToCollection[coll.folder] = {
      label: coll.label,
      discord_thread: coll.discord_thread,
      gamma_url: coll.gamma_url,
    };
  }
}

async function main() {
  const slidesDir = resolve(__dirname, "../../ict mentor bot/knowledge_base/concept_slides");
  const folders = readdirSync(slidesDir);

  const cards: Array<{
    title: string;
    content: string;
    category: string;
    slide_number: number;
    deck_name: string;
    gamma_url: string;
    tags: string[];
  }> = [];

  for (const folder of folders) {
    const folderPath = resolve(slidesDir, folder);
    const files = readdirSync(folderPath).filter(f => f.endsWith(".png")).sort();

    // Find matching collection
    const coll = folderToCollection[folder];
    const label = coll?.label || folder.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const discordUrl = coll?.discord_thread || "";
    const gammaUrl = coll?.gamma_url || "";

    for (const file of files) {
      // Extract slide number and title from filename like "10_Rejection-Blocks.png"
      const nameWithoutExt = file.replace(".png", "");
      const match = nameWithoutExt.match(/^(\d+)_(.+)$/);
      const slideNum = match ? parseInt(match[1]) : 0;
      const rawTitle = match ? match[2] : nameWithoutExt;
      const title = rawTitle.replace(/-/g, " ").replace(/_/g, " ");

      // Generate tags from the title
      const tags = title.toLowerCase().split(/\s+/).filter(w => w.length > 2);

      // Content description
      const content = `${title} — Study card from ${label}. ${discordUrl ? `Discussed in Discord thread.` : ""}`;

      cards.push({
        title,
        content,
        category: label,
        slide_number: slideNum,
        deck_name: label,
        gamma_url: gammaUrl,
        tags,
      });
    }
  }

  console.log(`Found ${cards.length} slide cards across ${folders.length} collections\n`);

  // Insert in batches of 50
  for (let i = 0; i < cards.length; i += 50) {
    const batch = cards.slice(i, i + 50);
    const { error } = await supabase.from("gamma_cards").insert(batch);
    if (error) {
      console.error(`Batch ${i}-${i + batch.length} error:`, error.message);
    } else {
      console.log(`✅ Inserted cards ${i + 1}-${i + batch.length}`);
    }
  }

  // Also update discord_references with slide counts
  console.log(`\nDone! ${cards.length} study cards imported.`);
  console.log("The AI Chat will now reference these SMC concept cards when answering questions.");
}

main().catch(console.error);
