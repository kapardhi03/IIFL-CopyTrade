-- Storage Buckets Configuration
-- Migration: 004_storage_buckets
-- Description: Create storage buckets and policies for file uploads

-- =====================================================
-- CREATE STORAGE BUCKETS
-- =====================================================

-- Bucket for user avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for KYC documents (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kyc-documents',
  'kyc-documents',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Bucket for strategy reports and documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'strategy-documents',
  'strategy-documents',
  false,
  5242880, -- 5MB
  ARRAY['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- STORAGE POLICIES
-- =====================================================

-- Avatars bucket policies
CREATE POLICY "Users can view all avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- KYC documents bucket policies
CREATE POLICY "Users can view their own KYC documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'kyc-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload their own KYC documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'kyc-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own KYC documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'kyc-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own KYC documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'kyc-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Strategy documents bucket policies
CREATE POLICY "Masters can upload strategy documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'strategy-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text AND
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'master'
  );

CREATE POLICY "Masters can view their strategy documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'strategy-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Followers can view subscribed strategy documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'strategy-documents' AND
    EXISTS (
      SELECT 1 FROM strategy_subscriptions ss
      JOIN strategies s ON s.id = ss.strategy_id
      WHERE ss.follower_id = auth.uid()
        AND ss.is_active = true
        AND (storage.foldername(name))[1] = s.master_id::text
    )
  );

CREATE POLICY "Masters can update their strategy documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'strategy-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Masters can delete their strategy documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'strategy-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
