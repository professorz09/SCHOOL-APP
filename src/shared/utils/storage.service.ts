// Thin wrapper around Supabase Storage for the `student-documents` bucket.
// All callers go through here so the path convention
//
//     <school_id>/<student_id>/<doc_type>/<timestamp>-<safe_filename>
//
// stays consistent — the storage RLS policies in 0019 derive the school
// and student from these path segments without joining back through
// `student_documents`.

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import type { StudentDoc } from '@/modules/students/student.types';

export const STUDENT_DOCS_BUCKET = 'student-documents';

// Per-doc-type upload ceilings. Practical balance between mobile-friendly
// upload speed and the resolution staff actually need for proof documents:
//   PHOTO         → 1 MB  (passport headshot — JPG at this size is plenty)
//   TRANSFER_CERT → 3 MB  (sometimes multi-page scan)
//   most docs     → 2 MB  (Aadhaar, birth cert — single-page PDFs)
//   absolute cap  → 5 MB  (anything bigger should be compressed first)
const MAX_BYTES_PHOTO     = 1 * 1024 * 1024;
const MAX_BYTES_DOC       = 2 * 1024 * 1024;
const MAX_BYTES_HIGH_RES  = 3 * 1024 * 1024;
const ABSOLUTE_MAX_BYTES  = 5 * 1024 * 1024;
const limitFor = (docType: StudentDoc['type']): number => {
  if (docType === 'PHOTO')         return MAX_BYTES_PHOTO;
  if (docType === 'TRANSFER_CERT') return MAX_BYTES_HIGH_RES;
  return MAX_BYTES_DOC;
};
const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
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

export const storageService = {
  /**
   * Uploads a single document for a student.  Returns the storage path
   * (relative to the bucket) which is what we persist on
   * `student_documents.doc_url`.  Caller is responsible for inserting
   * the corresponding `student_documents` row — typically via
   * `studentService.addDocument()`.
   */
  async uploadStudentDocument(
    studentId: string,
    docType: StudentDoc['type'],
    file: File,
  ): Promise<{ path: string }> {
    if (!studentId) throw new Error('Student id required');
    if (!file) throw new Error('File required');
    // Absolute cap is the floor — anything past 5 MB is rejected outright.
    if (file.size > ABSOLUTE_MAX_BYTES) {
      throw new Error(`File too large — absolute max ${fmtSize(ABSOLUTE_MAX_BYTES)}, got ${fmtSize(file.size)}. Please compress before uploading.`);
    }
    const cap = limitFor(docType);
    if (file.size > cap) {
      throw new Error(`File must be < ${fmtSize(cap)} (got ${fmtSize(file.size)})`);
    }
    // Reject empty MIME outright. The `if (file.type && ...)` guard let any
    // file with browser-stripped MIME (HEIC on some Linux browsers, blobs,
    // renamed binaries) bypass the allowlist. Also catches the renamed-.exe
    // case where browsers may not assign a type.
    if (!file.type) {
      throw new Error('Could not detect file type — please re-save as PDF/JPEG/PNG and try again.');
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    const schoolId = getSchoolId();
    const path = `${schoolId}/${studentId}/${docType}/${safeFilename(file.name)}`;

    const { error } = await supabase.storage
      .from(STUDENT_DOCS_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
    if (error) throw new Error(`Upload failed: ${error.message}`);

    return { path };
  },

  /**
   * Mints a short-lived signed URL for previewing/downloading a
   * stored document.  Returns null on failure so callers can degrade
   * gracefully (e.g. show a "missing" placeholder).
   */
  async getStudentDocumentSignedUrl(
    storagePath: string | null,
    ttlSeconds = 300,
  ): Promise<string | null> {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage
      .from(STUDENT_DOCS_BUCKET)
      .createSignedUrl(storagePath, ttlSeconds);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[student-documents] signed URL failed', error.message);
      return null;
    }
    return data?.signedUrl ?? null;
  },

  /**
   * Best-effort delete used when removing a document.  The 0019
   * DELETE policy restricts this to same-school principals.
   */
  async removeStudentDocument(storagePath: string): Promise<void> {
    const { error } = await supabase.storage
      .from(STUDENT_DOCS_BUCKET)
      .remove([storagePath]);
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[student-documents] delete failed', error.message);
    }
  },
};
