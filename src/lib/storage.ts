import { supabase } from './supabase';

// =====================================================
// STORAGE UTILITIES
// =====================================================

export type BucketName = 'avatars' | 'kyc-documents' | 'strategy-documents';

/**
 * Upload a file to storage
 */
export async function uploadFile(
  bucket: BucketName,
  path: string,
  file: File
): Promise<{ data: { path: string } | null; error: Error | null }> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  return { data, error };
}

/**
 * Upload or update a file (upsert)
 */
export async function upsertFile(
  bucket: BucketName,
  path: string,
  file: File
): Promise<{ data: { path: string } | null; error: Error | null }> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });

  return { data, error };
}

/**
 * Download a file from storage
 */
export async function downloadFile(
  bucket: BucketName,
  path: string
): Promise<{ data: Blob | null; error: Error | null }> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  return { data, error };
}

/**
 * Delete a file from storage
 */
export async function deleteFile(
  bucket: BucketName,
  path: string
): Promise<{ data: any; error: Error | null }> {
  const { data, error } = await supabase.storage.from(bucket).remove([path]);

  return { data, error };
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(bucket: BucketName, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Create a signed URL for private file access
 */
export async function createSignedUrl(
  bucket: BucketName,
  path: string,
  expiresIn: number = 3600
): Promise<{ data: { signedUrl: string } | null; error: Error | null }> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  return { data, error };
}

/**
 * List files in a directory
 */
export async function listFiles(
  bucket: BucketName,
  path: string = '',
  options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }
): Promise<{ data: any[] | null; error: Error | null }> {
  const { data, error } = await supabase.storage.from(bucket).list(path, options);

  return { data, error };
}

// =====================================================
// AVATAR UTILITIES
// =====================================================

/**
 * Upload user avatar
 */
export async function uploadAvatar(
  userId: string,
  file: File
): Promise<{ url: string | null; error: Error | null }> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/avatar.${fileExt}`;

  const { data, error } = await upsertFile('avatars', fileName, file);

  if (error) {
    return { url: null, error };
  }

  const url = getPublicUrl('avatars', fileName);
  return { url, error: null };
}

/**
 * Delete user avatar
 */
export async function deleteAvatar(userId: string): Promise<{ error: Error | null }> {
  const { data: files, error: listError } = await listFiles('avatars', userId);

  if (listError) {
    return { error: listError };
  }

  if (files && files.length > 0) {
    const paths = files.map((file) => `${userId}/${file.name}`);
    const { error } = await supabase.storage.from('avatars').remove(paths);
    return { error };
  }

  return { error: null };
}

// =====================================================
// KYC DOCUMENT UTILITIES
// =====================================================

/**
 * Upload KYC document
 */
export async function uploadKYCDocument(
  userId: string,
  documentType: string,
  file: File
): Promise<{ url: string | null; error: Error | null }> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${documentType}.${fileExt}`;

  const { data, error } = await uploadFile('kyc-documents', fileName, file);

  if (error) {
    return { url: null, error };
  }

  // Create signed URL for private access
  const { data: signedData, error: signedError } = await createSignedUrl(
    'kyc-documents',
    fileName,
    31536000 // 1 year
  );

  if (signedError) {
    return { url: null, error: signedError };
  }

  return { url: signedData?.signedUrl || null, error: null };
}

/**
 * Get KYC document signed URL
 */
export async function getKYCDocumentUrl(
  userId: string,
  documentType: string,
  fileExtension: string = 'pdf'
): Promise<{ url: string | null; error: Error | null }> {
  const fileName = `${userId}/${documentType}.${fileExtension}`;

  const { data, error } = await createSignedUrl('kyc-documents', fileName, 3600);

  if (error) {
    return { url: null, error };
  }

  return { url: data?.signedUrl || null, error: null };
}

// =====================================================
// STRATEGY DOCUMENT UTILITIES
// =====================================================

/**
 * Upload strategy document
 */
export async function uploadStrategyDocument(
  masterId: string,
  strategyId: string,
  file: File
): Promise<{ path: string | null; error: Error | null }> {
  const fileExt = file.name.split('.').pop();
  const timestamp = Date.now();
  const fileName = `${masterId}/${strategyId}/${timestamp}.${fileExt}`;

  const { data, error } = await uploadFile('strategy-documents', fileName, file);

  if (error) {
    return { path: null, error };
  }

  return { path: fileName, error: null };
}

/**
 * Get strategy document signed URL
 */
export async function getStrategyDocumentUrl(
  path: string
): Promise<{ url: string | null; error: Error | null }> {
  const { data, error } = await createSignedUrl('strategy-documents', path, 3600);

  if (error) {
    return { url: null, error };
  }

  return { url: data?.signedUrl || null, error: null };
}

/**
 * List strategy documents
 */
export async function listStrategyDocuments(
  masterId: string,
  strategyId: string
): Promise<{ files: any[] | null; error: Error | null }> {
  const { data, error } = await listFiles(
    'strategy-documents',
    `${masterId}/${strategyId}`
  );

  return { files: data, error };
}

// =====================================================
// FILE VALIDATION
// =====================================================

/**
 * Validate file type
 */
export function validateFileType(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.includes(file.type);
}

/**
 * Validate file size
 */
export function validateFileSize(file: File, maxSizeBytes: number): boolean {
  return file.size <= maxSizeBytes;
}

/**
 * Validate image file
 */
export function validateImageFile(
  file: File,
  maxSizeMB: number = 2
): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (!validateFileType(file, allowedTypes)) {
    return { valid: false, error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' };
  }

  if (!validateFileSize(file, maxSizeBytes)) {
    return { valid: false, error: `File size must be less than ${maxSizeMB}MB.` };
  }

  return { valid: true };
}

/**
 * Validate document file (PDF/images)
 */
export function validateDocumentFile(
  file: File,
  maxSizeMB: number = 10
): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (!validateFileType(file, allowedTypes)) {
    return { valid: false, error: 'Invalid file type. Only JPEG, PNG, and PDF are allowed.' };
  }

  if (!validateFileSize(file, maxSizeBytes)) {
    return { valid: false, error: `File size must be less than ${maxSizeMB}MB.` };
  }

  return { valid: true };
}
