-- ============================================================
-- Storage bucket for chart screenshot uploads
-- ============================================================

-- Create the charts bucket (public so URLs can be used in AI prompts)
INSERT INTO storage.buckets (id, name, public)
VALUES ('charts', 'charts', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- RLS Policies — path-based auth: charts/{user_id}/filename
-- ============================================================

-- Users can upload charts to their own folder
CREATE POLICY "Users can upload their own charts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'charts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can view their own charts
CREATE POLICY "Users can view their own charts"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'charts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can update their own charts
CREATE POLICY "Users can update their own charts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'charts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own charts
CREATE POLICY "Users can delete their own charts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'charts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access (needed for AI providers to fetch chart images)
CREATE POLICY "Public read access for charts"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'charts');
