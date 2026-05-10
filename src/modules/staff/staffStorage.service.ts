// Thin wrapper around Supabase Storage for the `staff-documents` bucket.
// Mirrors student storage.service.ts. Path convention enforced by RLS in
// migration 0021:
//
//     <school_id>/<staff_id>/<doc_type>/<timestamp>-<safe_filename>

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export const STAFF_DOCS_BUCKET = 'staff-documents';

// Per-doc-type ceilings — same policy as student documents.
//   PHOTO     → 1 MB
//   most docs → 2 MB
//   absolute  → 5 MB hard cap
const MAX_BYTES_PHOTO    = 1 * 1024 * 1024;
const MAX_BYTES_DOC      = 2 * 1024 * 1024;
const ABSOLUTE_MAX_BYTES = 5 * 1024 * 1024;
const limitFor = (docType: string): number =>
  docType === 'PHOTO' ? MAX_BYTES_PHOTO : MAX_BYTES_DOC;
const fmtSize = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`;
const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
]);

function getSchoolId(): string {
  const id = useAuthStore.getState().session?.schoolId;
  if (!id) throw new Error('No school in session');
  return id;
}

function safeFilename(original: string): string {
  const ext = (original.split('.').pop() ?? '').toLowerCase().slice(0, 5);
  const stem = original.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60);
  return `${Date.now()}-${stem || 'file'}${ext ? '.' + ext : ''}`;
}

export const staffStorageService = {
  async uploadStaffDocument(
    staffId: string,
    docType: string,
    file: File,
  ): Promise<{ path: string }> {
    if (!staffId) throw new Error('Staff id required');
    if (!file) throw new Error('File required');
    if (file.size > ABSOLUTE_MAX_BYTES) {
      throw new Error(`File too large — absolute max ${fmtSize(ABSOLUTE_MAX_BYTES)}, got ${fmtSize(file.size)}. Please compress before uploading.`);
    }
    const cap = limitFor(docType);
    if (file.size > cap) {
      throw new Error(`File must be < ${fmtSize(cap)} (got ${fmtSize(file.size)})`);
    }
    // Reject empty MIME and unknown MIME both. Earlier the `file.type && ...`
    // guard short-circuited on an empty string and let any file with
    // browser-stripped MIME (HEIC on some Linux browsers, raw blobs,
    // .exe renamed to .pdf in some browsers) bypass the type check.
    // Mirrors the stricter check in shared/utils/storage.service.ts.
    if (!file.type) {
      throw new Error('File type missing — please re-pick the file');
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    const schoolId = getSchoolId();
    const safeType = (docType || 'OTHER').replace(/[^a-zA-Z0-9_-]+/g, '_').toUpperCase();
    const path = `${schoolId}/${staffId}/${safeType}/${safeFilename(file.name)}`;

    const { error } = await supabase.storage
      .from(STAFF_DOCS_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
    if (error) throw new Error(`Upload failed: ${error.message}`);

    return { path };
  },

  async getStaffDocumentSignedUrl(
    storagePath: string | null,
    ttlSeconds = 300,
  ): Promise<string | null> {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage
      .from(STAFF_DOCS_BUCKET)
      .createSignedUrl(storagePath, ttlSeconds);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[staff-documents] signed URL failed', error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  },

  async removeStaffDocument(storagePath: string): Promise<void> {
    const { error } = await supabase.storage
      .from(STAFF_DOCS_BUCKET)
      .remove([storagePath]);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[staff-documents] delete failed', error.message);
    }
  },
};
