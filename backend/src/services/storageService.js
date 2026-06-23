// ─────────────────────────────────────────────────────────────────────────────
// File storage abstraction with two interchangeable backends:
//
//   • local  (default) — files live on the API/worker machine's disk under
//                        backend/uploads/. Zero setup; the original behaviour.
//   • minio            — files live in a self-hosted, S3-compatible object store
//                        (MinIO). Required once you run workers across more than
//                        one machine: a worker on host B can't read a file that
//                        was uploaded to host A's local disk. MinIO gives every
//                        process one shared source of truth.
//
// GRACEFUL DEGRADATION: if STORAGE_BACKEND is unset (or 'local'), the `minio`
// npm package is never even required, so existing installs keep working with no
// new dependency. If STORAGE_BACKEND='minio' but the server is unreachable at
// startup, we log loudly and fall back to local rather than failing to boot.
//
// Multer still writes the incoming upload to local disk first (see
// middleware/upload.js). In minio mode we then push that file to the bucket and
// remove the local temp copy, so the object store is authoritative. Readers
// (OCR, ML extraction, file preview) go through getLocalPath()/createReadStream()
// and never need to know which backend is active.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

let backend = (process.env.STORAGE_BACKEND || 'local').toLowerCase();
const BUCKET = process.env.MINIO_BUCKET || 'invoices';

let minioClient = null;

// Resolve the on-disk path for a file that lives locally (local backend, or a
// minio-mode temp download). uploadedFile.path is stored relative to the backend
// root (e.g. "uploads/invoice-123.pdf"); fall back to the filename if absent.
function diskPathFor(uploadedFile) {
  if (uploadedFile.path) return path.join(__dirname, '../../', uploadedFile.path);
  return path.join(UPLOADS_DIR, uploadedFile.filename);
}

function isMinio() {
  return backend === 'minio' && minioClient != null;
}

// Called once at process startup (API and worker). Safe to call when local —
// it just returns immediately. On any minio setup error we fall back to local.
async function init() {
  if (backend !== 'minio') {
    console.log('[storage] backend: local (files on disk)');
    return;
  }
  try {
    // Lazy require so 'minio' is only needed when actually used.
    const { Client } = require('minio');
    const endPoint = process.env.MINIO_ENDPOINT || '127.0.0.1';
    const port = Number(process.env.MINIO_PORT) || 9000;
    const useSSL = process.env.MINIO_USE_SSL === 'true';

    minioClient = new Client({
      endPoint,
      port,
      useSSL,
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });

    const exists = await minioClient.bucketExists(BUCKET).catch(() => false);
    if (!exists) {
      await minioClient.makeBucket(BUCKET, process.env.MINIO_REGION || 'us-east-1');
      console.log(`[storage] created MinIO bucket "${BUCKET}"`);
    }
    console.log(`[storage] backend: minio (${endPoint}:${port}, bucket "${BUCKET}")`);
  } catch (err) {
    backend = 'local';
    minioClient = null;
    console.warn(
      `[storage] MinIO unavailable (${err.message}) — falling back to local disk storage`
    );
  }
}

// Compute the SHA-256 of a freshly-uploaded file from its local temp path.
// Done before any backend move, so it's identical regardless of storage mode.
function computeHash(localPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
}

// After multer has written the upload to local disk, make storage authoritative.
// Returns the storage descriptor fields to persist on the invoice's uploadedFile.
// In local mode this is a no-op that just records storage: 'local'.
async function persistUpload(file) {
  const localPath = path.join(UPLOADS_DIR, file.filename);
  if (!isMinio()) {
    return { storage: 'local', path: path.join('uploads', file.filename) };
  }
  // key in the bucket == the unique filename multer generated
  await minioClient.fPutObject(BUCKET, file.filename, localPath, {
    'Content-Type': file.mimetype,
  });
  // Remove the local temp copy — the bucket is now the source of truth.
  fs.promises.unlink(localPath).catch(() => {});
  return { storage: 'minio', path: file.filename };
}

// Give callers a real on-disk path they can read (OCR/Tesseract and the ML
// extract upload both need a file path, not a stream). For local that's the
// existing file. For minio we download to a temp file and hand back a cleanup()
// the caller MUST invoke (in a finally) to avoid leaking temp files.
async function getLocalPath(uploadedFile) {
  if (uploadedFile.storage !== 'minio' || !isMinio()) {
    return { path: diskPathFor(uploadedFile), cleanup: async () => {} };
  }
  // If a local cached copy happens to exist (e.g. same machine), use it.
  const cached = diskPathFor(uploadedFile);
  if (fs.existsSync(cached)) {
    return { path: cached, cleanup: async () => {} };
  }
  const tmp = path.join(os.tmpdir(), `inv-${Date.now()}-${uploadedFile.filename}`);
  await minioClient.fGetObject(BUCKET, uploadedFile.filename, tmp);
  return { path: tmp, cleanup: async () => { await fs.promises.unlink(tmp).catch(() => {}); } };
}

// Stream a file for serving over HTTP (the /uploads route). Works for both
// backends so the route handler stays backend-agnostic.
async function createReadStream(uploadedFile) {
  if (uploadedFile.storage === 'minio' && isMinio()) {
    return minioClient.getObject(BUCKET, uploadedFile.filename);
  }
  const p = diskPathFor(uploadedFile);
  if (!fs.existsSync(p)) throw new Error('File not found');
  return fs.createReadStream(p);
}

// Delete the stored file when its invoice is deleted. Best-effort on both sides.
async function remove(uploadedFile) {
  if (!uploadedFile) return;
  if (uploadedFile.storage === 'minio' && isMinio()) {
    await minioClient.removeObject(BUCKET, uploadedFile.filename).catch(() => {});
  }
  // Always try the local path too (covers local mode and any minio cache copy).
  await fs.promises.unlink(diskPathFor(uploadedFile)).catch(() => {});
}

module.exports = {
  init,
  computeHash,
  persistUpload,
  getLocalPath,
  createReadStream,
  remove,
  isMinio: () => isMinio(),
  currentBackend: () => backend,
};
