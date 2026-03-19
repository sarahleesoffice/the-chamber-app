import { createClient } from "@/lib/supabase/client";

const BUCKET = "charts";

/**
 * Upload a chart screenshot to Supabase Storage.
 * Files are stored at: charts/{userId}/{timestamp}_{filename}
 * Returns the public URL of the uploaded file.
 */
export async function uploadChart(
  file: File,
  userId: string
): Promise<string> {
  const supabase = createClient();

  // Sanitise filename — strip spaces, keep extension
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`Chart upload failed: ${error.message}`);
  }

  return getChartUrl(path);
}

/**
 * Delete a chart from Supabase Storage by its path
 * (the portion after the bucket name, e.g. "{userId}/{timestamp}_{file}").
 */
export async function deleteChart(path: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([path]);

  if (error) {
    throw new Error(`Chart delete failed: ${error.message}`);
  }
}

/**
 * Get the public URL for a chart path.
 */
export function getChartUrl(path: string): string {
  const supabase = createClient();

  const { data } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}
