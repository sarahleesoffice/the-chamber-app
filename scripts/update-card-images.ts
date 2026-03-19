/**
 * Update gamma_cards content field to include slide image paths.
 * Prepends "IMG:/slides/{folder}/{file}.png\n" to the content field
 * so the AI Chat frontend can render the slide image.
 *
 * Usage: npx tsx scripts/update-card-images.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

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

async function main() {
  const slidesDir = resolve(__dirname, "../../ict mentor bot/knowledge_base/concept_slides");
  const folders = readdirSync(slidesDir);

  // Build a map: normalized title -> image path
  const titleToImage: Map<string, string> = new Map();

  for (const folder of folders) {
    const folderPath = resolve(slidesDir, folder);
    const files = readdirSync(folderPath).filter(f => f.endsWith(".png"));

    for (const file of files) {
      // Extract title from filename like "10_Rejection-Blocks.png"
      const nameWithoutExt = file.replace(".png", "");
      const match = nameWithoutExt.match(/^(\d+)_(.+)$/);
      const rawTitle = match ? match[2] : nameWithoutExt;
      const title = rawTitle.replace(/-/g, " ").replace(/_/g, " ").toLowerCase().trim();

      const imagePath = `/slides/${folder}/${file}`;
      titleToImage.set(title, imagePath);
    }
  }

  console.log(`Built image map with ${titleToImage.size} entries\n`);

  // Fetch all gamma_cards
  const { data: cards, error } = await supabase
    .from("gamma_cards")
    .select("id, title, content")
    .order("id");

  if (error) {
    console.error("Error fetching cards:", error.message);
    return;
  }

  console.log(`Found ${cards?.length || 0} gamma cards in database\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const card of cards || []) {
    // Skip if content already has an image path
    if (card.content && card.content.startsWith("IMG:")) {
      skipped++;
      continue;
    }

    // Try to find matching image by normalized title
    const normalizedTitle = card.title.toLowerCase().trim();
    let imagePath = titleToImage.get(normalizedTitle);

    // If exact match fails, try fuzzy: remove parentheses content and try again
    if (!imagePath) {
      const simplified = normalizedTitle.replace(/\s*\(.*?\)\s*/g, " ").trim();
      imagePath = titleToImage.get(simplified);
    }

    // Try matching with "FVG" -> "Fair Value Gaps FVG" style
    if (!imagePath) {
      for (const [mapTitle, mapPath] of titleToImage) {
        if (mapTitle.includes(normalizedTitle) || normalizedTitle.includes(mapTitle)) {
          imagePath = mapPath;
          break;
        }
      }
    }

    if (imagePath) {
      const newContent = `IMG:${imagePath}\n${card.content || ""}`;
      const { error: updateError } = await supabase
        .from("gamma_cards")
        .update({ content: newContent })
        .eq("id", card.id);

      if (updateError) {
        console.error(`Error updating "${card.title}":`, updateError.message);
      } else {
        updated++;
        console.log(`Updated: "${card.title}" -> ${imagePath}`);
      }
    } else {
      notFound++;
      console.log(`No image found for: "${card.title}"`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Skipped (already had image): ${skipped}, No match: ${notFound}`);
}

main().catch(console.error);
