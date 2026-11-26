import {
  Timestamp,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { BIDANG_MAP, isPrimaryAdminEmail } from '../constants/bidang';
import { db } from './firebase';
import {
  formatIndonesianDateTime,
  parseIndonesianDateToIso,
  todayIsoDate,
} from './lifecycle';
import { BidangId, UserProfile } from '../types/archive';

export const LAST_BACKUP_STORAGE_KEY = 'gatra_last_full_backup_v1';
const BATCH_CHUNK_SIZE = 400;
const VALID_DOC_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export interface LastBackupMeta {
  lastBackupAtIso: string;
  lastBackupLabel: string;
  totalRecords: number;
  exportedBy: string;
}

export interface BackupDocumentRecord {
  id: string;
  [key: string]: unknown;
}

export interface FullBackupPayload {
  app: 'GATRA 2.0 Kejari Grobogan';
  version: string;
  exportedAt: string;
  exportedAtWib: string;
  exportedBy: string;
  totalRecords: number;
  collections: Record<string, BackupDocumentRecord[]>;
}

export interface CollectionRestoreSummary {
  key: string;
  targetCollection: string;
  label: string;
  count: number;
}

export interface ValidatedBackupPreview {
  app: string;
  exportedAt: string;
  exportedAtLabel: string;
  exportedBy: string;
  totalRecords: number;
  summaries: CollectionRestoreSummary[];
  raw: FullBackupPayload;
}

export interface RestoreExecutionResult {
  restoredCount: number;
  skippedCount: number;
  details: Array<{ label: string; restored: number; skipped: number }>;
}

const PRIMARY_COLLECTIONS = [
  'archives',
  'users',
  'jra_master',
  'vital_archives',
  'loans',
  'dokumen_kearsipan',
  'library_items',
  'system',
  'metadata',
] as const;

const ALIAS_COLLECTIONS = [
  'arsip',
  'jra',
  'peminjaman',
  'pustaka_materi',
  'materials',
] as const;

const COLLECTION_TARGET_MAP: Record<string, string> = {
  archives: 'archives',
  arsip: 'archives',
  users: 'users',
  jra_master: 'jra_master',
  jra: 'jra_master',
  vital_archives: 'vital_archives',
  loans: 'loans',
  peminjaman: 'loans',
  dokumen_kearsipan: 'dokumen_kearsipan',
  library_items: 'library_items',
  pustaka_materi: 'library_items',
  materials: 'library_items',
  system: 'system',
  metadata: 'metadata',
};

const COLLECTION_LABELS: Record<string, string> = {
  archives: 'Data Arsip Utama (archives)',
  arsip: 'Data Arsip (arsip)',
  users: 'Data Pengguna (users)',
  jra_master: 'Master JRA (jra_master)',
  jra: 'Master JRA (jra)',
  vital_archives: 'Arsip Vital (vital_archives)',
  loans: 'Register Peminjaman (loans)',
  peminjaman: 'Register Peminjaman (peminjaman)',
  dokumen_kearsipan: 'Dokumen Kearsipan (dokumen_kearsipan)',
  library_items: 'Pustaka Materi (library_items)',
  pustaka_materi: 'Pustaka Materi (pustaka_materi)',
  materials: 'Pustaka Materi (materials)',
  system: 'Konfigurasi Sistem (system)',
  metadata: 'Statistik Satker (metadata)',
};

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function serializeFirestoreValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (val instanceof Timestamp) {
    return {
      __firestoreType: 'timestamp',
      seconds: val.seconds,
      nanoseconds: val.nanoseconds,
      iso: val.toDate().toISOString(),
    };
  }
  if (
    typeof val === 'object' &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    const d = (val as { toDate: () => Date }).toDate();
    const seconds = Math.floor(d.getTime() / 1000);
    const nanoseconds = (d.getTime() % 1000) * 1_000_000;
    return {
      __firestoreType: 'timestamp',
      seconds,
      nanoseconds,
      iso: d.toISOString(),
    };
  }
  if (val instanceof Date) {
    const seconds = Math.floor(val.getTime() / 1000);
    const nanoseconds = (val.getTime() % 1000) * 1_000_000;
    return {
      __firestoreType: 'timestamp',
      seconds,
      nanoseconds,
      iso: val.toISOString(),
    };
  }
  if (Array.isArray(val)) {
    return val.map((item) => serializeFirestoreValue(item));
  }
  if (isPlainObject(val)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = serializeFirestoreValue(v);
      }
    }
    return out;
  }
  return val;
}

function deserializeFirestoreValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map((item) => deserializeFirestoreValue(item));
  }
  if (isPlainObject(val)) {
    if (
      val.__firestoreType === 'timestamp' &&
      typeof val.seconds === 'number' &&
      typeof val.nanoseconds === 'number'
    ) {
      return new Timestamp(val.seconds, val.nanoseconds);
    }
    if (
      Object.keys(val).length === 2 &&
      typeof val.seconds === 'number' &&
      typeof val.nanoseconds === 'number'
    ) {
      return new Timestamp(val.seconds, val.nanoseconds);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        out[k] = deserializeFirestoreValue(v);
      }
    }
    return out;
  }
  return val;
}

export function loadLastBackupMeta(): LastBackupMeta | null {
  try {
    const raw = window.localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastBackupMeta>;
    if (!parsed.lastBackupLabel) return null;
    return {
      lastBackupAtIso: parsed.lastBackupAtIso || '',
      lastBackupLabel: parsed.lastBackupLabel,
      totalRecords: Number(parsed.totalRecords || 0),
      exportedBy: parsed.exportedBy || '',
    };
  } catch {
    return null;
  }
}

export function saveLastBackupMeta(meta: LastBackupMeta): void {
  try {
    window.localStorage.setItem(LAST_BACKUP_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ignore storage quota errors
  }
}

async function fetchCollectionSafely(colName: string): Promise<BackupDocumentRecord[]> {
  const docs: BackupDocumentRecord[] = [];
  try {
    const snap = await getDocs(collection(db, colName));
    for (const d of snap.docs) {
      docs.push({
        id: d.id,
        ...(serializeFirestoreValue(d.data()) as Record<string, unknown>),
      });
    }
    return docs;
  } catch {
    // Fallback for collections that disallow list (`allow list: if false`) but allow known doc `get`
    if (colName === 'system') {
      try {
        const bootstrapSnap = await getDoc(doc(db, 'system', 'bootstrap'));
        if (bootstrapSnap.exists()) {
          docs.push({
            id: bootstrapSnap.id,
            ...(serializeFirestoreValue(bootstrapSnap.data()) as Record<string, unknown>),
          });
        }
      } catch {
        // Ignore if missing or inaccessible
      }
    } else if (colName === 'metadata') {
      try {
        const statsSnap = await getDoc(doc(db, 'metadata', 'statistik_satker'));
        if (statsSnap.exists()) {
          docs.push({
            id: statsSnap.id,
            ...(serializeFirestoreValue(statsSnap.data()) as Record<string, unknown>),
          });
        }
      } catch {
        // Ignore if missing or inaccessible
      }
    }
    return docs;
  }
}

export async function exportFullDatabaseBackup(
  userProfile: UserProfile
): Promise<{
  payload: FullBackupPayload;
  fileName: string;
  nonEmptyCollections: number;
  meta: LastBackupMeta;
}> {
  const collectionsData: Record<string, BackupDocumentRecord[]> = {};
  let totalRecords = 0;
  let nonEmptyCollections = 0;

  for (const colName of PRIMARY_COLLECTIONS) {
    const rows = await fetchCollectionSafely(colName);
    collectionsData[colName] = rows;
    totalRecords += rows.length;
    if (rows.length > 0) nonEmptyCollections += 1;
  }

  for (const aliasName of ALIAS_COLLECTIONS) {
    const rows = await fetchCollectionSafely(aliasName);
    if (rows.length > 0) {
      collectionsData[aliasName] = rows;
      totalRecords += rows.length;
      nonEmptyCollections += 1;
    }
  }

  const now = new Date();
  const exportedAt = now.toISOString();
  const exportedAtWib = formatIndonesianDateTime(now);
  const exportedBy = userProfile.displayName
    ? `${userProfile.displayName} (${userProfile.email})`
    : userProfile.email;

  const payload: FullBackupPayload = {
    app: 'GATRA 2.0 Kejari Grobogan',
    version: '2.0',
    exportedAt,
    exportedAtWib,
    exportedBy,
    totalRecords,
    collections: collectionsData,
  };

  const fileName = `Backup_GATRA2_KejariGrobogan_${todayIsoDate()}.json`;
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  const meta: LastBackupMeta = {
    lastBackupAtIso: exportedAt,
    lastBackupLabel: exportedAtWib,
    totalRecords,
    exportedBy,
  };
  saveLastBackupMeta(meta);

  return { payload, fileName, nonEmptyCollections, meta };
}

function formatBackupDateForDisplay(rawIsoOrText: unknown): string {
  if (typeof rawIsoOrText !== 'string' || !rawIsoOrText.trim()) {
    return 'Tidak diketahui';
  }
  const parsed = new Date(rawIsoOrText);
  if (!Number.isNaN(parsed.getTime())) {
    return formatIndonesianDateTime(parsed);
  }
  return rawIsoOrText.trim();
}

export function parseAndValidateBackupJson(jsonText: string): ValidatedBackupPreview {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('File bukan format JSON yang valid.');
  }

  if (!isPlainObject(parsed)) {
    throw new Error('Struktur file backup tidak valid (akar JSON harus berupa objek).');
  }

  if (!isPlainObject(parsed.collections)) {
    throw new Error(
      'Struktur file backup tidak valid: properti "collections" tidak ditemukan atau bukan objek.'
    );
  }

  const summaries: CollectionRestoreSummary[] = [];
  const normalizedCollections: Record<string, BackupDocumentRecord[]> = {};
  let totalRecords = 0;

  for (const [key, value] of Object.entries(parsed.collections)) {
    if (!Array.isArray(value)) {
      throw new Error(`Koleksi "${key}" pada file backup harus berupa array dokumen.`);
    }

    const targetCollection = COLLECTION_TARGET_MAP[key];
    if (!targetCollection) {
      throw new Error(
        `Koleksi "${key}" tidak dikenali oleh skema GATRA 2.0. Pastikan menggunakan file hasil backup aplikasi.`
      );
    }

    const validatedDocs: BackupDocumentRecord[] = [];
    for (let idx = 0; idx < value.length; idx++) {
      const item = value[idx];
      if (!isPlainObject(item)) {
        throw new Error(`Dokumen ke-${idx + 1} pada koleksi "${key}" tidak valid.`);
      }
      if (typeof item.id !== 'string' || !VALID_DOC_ID_RE.test(item.id)) {
        throw new Error(
          `Dokumen ke-${idx + 1} pada koleksi "${key}" memiliki ID tidak valid.`
        );
      }
      validatedDocs.push(item as BackupDocumentRecord);
    }

    normalizedCollections[key] = validatedDocs;
    totalRecords += validatedDocs.length;
    summaries.push({
      key,
      targetCollection,
      label: COLLECTION_LABELS[key] || key,
      count: validatedDocs.length,
    });
  }

  if (totalRecords === 0) {
    throw new Error('File backup tidak memiliki dokumen untuk dipulihkan (0 dokumen).');
  }

  const exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '';
  const exportedAtLabel =
    typeof parsed.exportedAtWib === 'string' && parsed.exportedAtWib.trim()
      ? parsed.exportedAtWib.trim()
      : formatBackupDateForDisplay(exportedAt);

  return {
    app: typeof parsed.app === 'string' ? parsed.app : 'GATRA 2.0 Kejari Grobogan',
    exportedAt,
    exportedAtLabel,
    exportedBy: typeof parsed.exportedBy === 'string' ? parsed.exportedBy : 'Admin',
    totalRecords,
    summaries,
    raw: {
      app: 'GATRA 2.0 Kejari Grobogan',
      version: typeof parsed.version === 'string' ? parsed.version : '2.0',
      exportedAt,
      exportedAtWib: exportedAtLabel,
      exportedBy: typeof parsed.exportedBy === 'string' ? parsed.exportedBy : 'Admin',
      totalRecords,
      collections: normalizedCollections,
    },
  };
}

function pickKeys(
  source: Record<string, unknown>,
  allowedKeys: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in source && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

interface PendingBatchOp {
  collectionName: string;
  docId: string;
  payload: Record<string, unknown>;
}

async function commitOperationsInBatches(ops: PendingBatchOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_CHUNK_SIZE) {
    const slice = ops.slice(i, i + BATCH_CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of slice) {
      batch.set(doc(db, op.collectionName, op.docId), op.payload, { merge: true });
    }
    await batch.commit();
  }
}

function hasCompleteDestructionMetadata(data: Record<string, unknown>): boolean {
  const metode = data.metodePemusnahan;
  const validMetode =
    metode === 'Peleburan / Pulping' ||
    metode === 'Pencacahan' ||
    metode === 'Pembakaran' ||
    metode === 'Lainnya';
  return (
    typeof data.nomorSuratAnri === 'string' &&
    data.nomorSuratAnri.trim().length > 0 &&
    typeof data.tanggalPersetujuanAnri === 'string' &&
    data.tanggalPersetujuanAnri.trim().length > 0 &&
    typeof data.nomorBaPemusnahan === 'string' &&
    data.nomorBaPemusnahan.trim().length > 0 &&
    typeof data.tanggalPemusnahan === 'string' &&
    data.tanggalPemusnahan.trim().length > 0 &&
    validMetode
  );
}

const ARCHIVE_CREATE_KEYS = [
  'nomorBerkas',
  'nomorItem',
  'kodeKlasifikasi',
  'uraian',
  'kurunWaktu',
  'tingkatPerkembangan',
  'jumlah',
  'filingCabinet',
  'laci',
  'folder',
  'klasifikasiKeamanan',
  'kondisiFisik',
  'penataan',
  'retensiAktif',
  'retensiInaktif',
  'keteranganAkhir',
  'dasarRetensi',
  'tanggalInput',
  'tanggalInputISO',
  'diinputOleh',
  'nomorBoks',
  'catatanRecordCenter',
  'keterangan',
  'bidang',
] as const;

const ARCHIVE_UPDATE_KEYS = [
  'nomorBerkas',
  'nomorItem',
  'kodeKlasifikasi',
  'uraian',
  'kurunWaktu',
  'tingkatPerkembangan',
  'jumlah',
  'filingCabinet',
  'laci',
  'folder',
  'klasifikasiKeamanan',
  'kondisiFisik',
  'penataan',
  'retensiAktif',
  'retensiInaktif',
  'keteranganAkhir',
  'dasarRetensi',
  'nomorBoks',
  'catatanRecordCenter',
  'keterangan',
  'nomorSuratAnri',
  'tanggalPersetujuanAnri',
  'nomorBaPemusnahan',
  'tanggalPemusnahan',
  'metodePemusnahan',
  'bidang',
] as const;

const JRA_MUTABLE_KEYS = [
  'nomor',
  'kodeKlasifikasi',
  'uraian',
  'retensiAktif',
  'retensiInaktif',
  'keteranganAkhir',
  'bidang',
] as const;

const VITAL_MUTABLE_KEYS = [
  'nomor',
  'bidang',
  'kodeKlasifikasi',
  'uraian',
  'kurunWaktu',
  'mediaSimpan',
  'jumlah',
  'jangkaSimpan',
  'metodePerlindungan',
  'lokasiSimpan',
  'tingkatKerawanan',
  'tautanBackup',
  'keterangan',
] as const;

const LOAN_MUTABLE_KEYS = [
  'nomor',
  'tanggalPinjam',
  'kodeKlasifikasi',
  'uraianBerkas',
  'namaPeminjam',
  'bidang',
  'targetKembali',
  'realisasiKembali',
  'keterangan',
] as const;

const LIBRARY_MUTABLE_KEYS = ['judul', 'kategori', 'deskripsi', 'url'] as const;

export async function restoreDatabaseFromBackup(
  preview: ValidatedBackupPreview,
  currentUser: UserProfile
): Promise<RestoreExecutionResult> {
  if (currentUser.role !== 'admin') {
    throw new Error('Hanya Admin yang diizinkan melakukan pemulihan database.');
  }

  const actorName = (currentUser.displayName || currentUser.email || 'Admin').slice(0, 150);
  const diinputOlehFallback = (
    currentUser.displayName &&
    currentUser.email &&
    currentUser.displayName !== currentUser.email
      ? `${currentUser.displayName} (${currentUser.email})`
      : actorName
  ).slice(0, 200);

  // Merge alias collections into their canonical target collections
  const groupedDocs = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [rawCol, docs] of Object.entries(preview.raw.collections)) {
    const targetCol = COLLECTION_TARGET_MAP[rawCol];
    if (!targetCol || docs.length === 0) continue;
    if (!groupedDocs.has(targetCol)) {
      groupedDocs.set(targetCol, new Map());
    }
    const targetMap = groupedDocs.get(targetCol)!;
    for (const rawDoc of docs) {
      const { id, ...rest } = rawDoc;
      targetMap.set(id, deserializeFirestoreValue(rest) as Record<string, unknown>);
    }
  }

  const phase1Ops: PendingBatchOp[] = [];
  const phase2Ops: PendingBatchOp[] = [];
  const details: Array<{ label: string; restored: number; skipped: number }> = [];
  let totalRestored = 0;
  let totalSkipped = 0;

  for (const [targetCol, docMap] of groupedDocs.entries()) {
    let colRestored = 0;
    let colSkipped = 0;

    // Fetch existing document state so merge respects immutable fields & security rules
    const existingDocs = new Map<string, Record<string, unknown>>();
    if (targetCol === 'metadata') {
      try {
        const snap = await getDoc(doc(db, 'metadata', 'statistik_satker'));
        if (snap.exists()) existingDocs.set(snap.id, snap.data());
      } catch {
        // Ignore
      }
    } else if (targetCol === 'system') {
      try {
        const snap = await getDoc(doc(db, 'system', 'bootstrap'));
        if (snap.exists()) existingDocs.set(snap.id, snap.data());
      } catch {
        // Ignore
      }
    } else {
      try {
        const snap = await getDocs(collection(db, targetCol));
        for (const d of snap.docs) {
          existingDocs.set(d.id, d.data());
        }
      } catch {
        // Proceed as if none exist if collection read is empty/unavailable
      }
    }

    for (const [docId, rawData] of docMap.entries()) {
      const existing = existingDocs.get(docId);

      if (targetCol === 'archives') {
        if (existing) {
          if (String(existing.keterangan || '').trim().toLowerCase() === 'musnah') {
            colSkipped++;
            continue;
          }
          const payload = pickKeys(rawData, ARCHIVE_UPDATE_KEYS);
          if (
            payload.keterangan === 'Musnah' &&
            !hasCompleteDestructionMetadata(payload)
          ) {
            payload.keterangan = 'Usul Musnah';
          }
          if (payload.keterangan !== 'Musnah') {
            delete payload.nomorSuratAnri;
            delete payload.tanggalPersetujuanAnri;
            delete payload.nomorBaPemusnahan;
            delete payload.tanggalPemusnahan;
            delete payload.metodePemusnahan;
          }
          payload.updatedByUid = currentUser.uid;
          payload.updatedByName = actorName;
          payload.updatedAt = serverTimestamp();
          phase1Ops.push({ collectionName: targetCol, docId, payload });
          colRestored++;
        } else {
          const payload = pickKeys(rawData, ARCHIVE_CREATE_KEYS);
          const wantsMusnah = rawData.keterangan === 'Musnah';
          if (wantsMusnah) {
            payload.keterangan = 'Usul Musnah';
          }
          const tanggalInput =
            typeof payload.tanggalInput === 'string' && payload.tanggalInput.trim()
              ? payload.tanggalInput.trim().slice(0, 60)
              : formatIndonesianDateTime();
          payload.tanggalInput = tanggalInput;
          if (
            typeof payload.tanggalInputISO !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}$/.test(payload.tanggalInputISO)
          ) {
            payload.tanggalInputISO =
              parseIndonesianDateToIso(tanggalInput) || todayIsoDate();
          }
          if (
            typeof payload.diinputOleh !== 'string' ||
            !payload.diinputOleh.trim()
          ) {
            payload.diinputOleh = diinputOlehFallback;
          }
          payload.createdByUid = currentUser.uid;
          payload.createdByName = actorName;
          payload.updatedByUid = currentUser.uid;
          payload.updatedByName = actorName;
          payload.createdAt = serverTimestamp();
          payload.updatedAt = serverTimestamp();
          phase1Ops.push({ collectionName: targetCol, docId, payload });

          if (wantsMusnah && hasCompleteDestructionMetadata(rawData)) {
            phase2Ops.push({
              collectionName: targetCol,
              docId,
              payload: {
                keterangan: 'Musnah',
                nomorSuratAnri: String(rawData.nomorSuratAnri).slice(0, 120),
                tanggalPersetujuanAnri: String(rawData.tanggalPersetujuanAnri).slice(0, 30),
                nomorBaPemusnahan: String(rawData.nomorBaPemusnahan).slice(0, 120),
                tanggalPemusnahan: String(rawData.tanggalPemusnahan).slice(0, 30),
                metodePemusnahan: rawData.metodePemusnahan,
                updatedByUid: currentUser.uid,
                updatedByName: actorName,
                updatedAt: serverTimestamp(),
              },
            });
          }
          colRestored++;
        }
      } else if (targetCol === 'jra_master') {
        const payload = pickKeys(rawData, JRA_MUTABLE_KEYS);
        if (existing) {
          payload.updatedAt = serverTimestamp();
        } else {
          payload.createdByUid = currentUser.uid;
          payload.createdAt = serverTimestamp();
          payload.updatedAt = serverTimestamp();
        }
        phase1Ops.push({ collectionName: targetCol, docId, payload });
        colRestored++;
      } else if (targetCol === 'vital_archives') {
        const payload = pickKeys(rawData, VITAL_MUTABLE_KEYS);
        if (existing) {
          payload.updatedByUid = currentUser.uid;
          payload.updatedByName = actorName;
          payload.updatedAt = serverTimestamp();
        } else {
          payload.createdByUid = currentUser.uid;
          payload.createdByName = actorName;
          payload.updatedByUid = currentUser.uid;
          payload.updatedByName = actorName;
          payload.createdAt = serverTimestamp();
          payload.updatedAt = serverTimestamp();
        }
        phase1Ops.push({ collectionName: targetCol, docId, payload });
        colRestored++;
      } else if (targetCol === 'loans') {
        const payload = pickKeys(rawData, LOAN_MUTABLE_KEYS);
        if (existing) {
          payload.updatedAt = serverTimestamp();
        } else {
          payload.createdByUid = currentUser.uid;
          payload.createdAt = serverTimestamp();
          payload.updatedAt = serverTimestamp();
        }
        phase1Ops.push({ collectionName: targetCol, docId, payload });
        colRestored++;
      } else if (targetCol === 'library_items') {
        const payload = pickKeys(rawData, LIBRARY_MUTABLE_KEYS);
        if (existing) {
          payload.updatedAt = serverTimestamp();
        } else {
          payload.createdByUid = currentUser.uid;
          payload.createdAt = serverTimestamp();
          payload.updatedAt = serverTimestamp();
        }
        phase1Ops.push({ collectionName: targetCol, docId, payload });
        colRestored++;
      } else if (targetCol === 'dokumen_kearsipan') {
        const baseKeys = [
          'judul',
          'kategori',
          'nomorSurat',
          'tanggalDokumen',
          'bidangTerkait',
          'tipeLampiran',
        ] as const;
        const payload = pickKeys(rawData, baseKeys);
        if (rawData.tipeLampiran === 'gdrive') {
          payload.urlGoogleDrive = rawData.urlGoogleDrive;
          if (existing) {
            payload.fileName = deleteField();
            payload.fileMimeType = deleteField();
            payload.fileSize = deleteField();
            payload.fileBase64 = deleteField();
          }
        } else if (rawData.tipeLampiran === 'upload') {
          payload.fileName = rawData.fileName;
          payload.fileMimeType = rawData.fileMimeType;
          payload.fileSize = rawData.fileSize;
          payload.fileBase64 = rawData.fileBase64;
          if (existing) {
            payload.urlGoogleDrive = deleteField();
          }
        }
        if (existing) {
          payload.updatedAt = serverTimestamp();
        } else {
          payload.createdByUid = currentUser.uid;
          payload.createdByName = actorName;
          payload.createdAt = serverTimestamp();
          payload.updatedAt = serverTimestamp();
        }
        phase1Ops.push({ collectionName: targetCol, docId, payload });
        colRestored++;
      } else if (targetCol === 'users') {
        if (!existing) {
          // Security rules only allow creating a user document for request.auth.uid == userId
          colSkipped++;
          continue;
        }
        const isTargetPrimary = isPrimaryAdminEmail(
          typeof existing.email === 'string' ? existing.email : undefined
        );
        const rawBidang = typeof rawData.bidang === 'string' ? rawData.bidang : '';
        const validBidang: BidangId | '' =
          rawBidang && rawBidang in BIDANG_MAP ? (rawBidang as BidangId) : '';
        const payload: Record<string, unknown> = {
          role: isTargetPrimary
            ? 'admin'
            : rawData.role === 'admin' || rawData.role === 'pimpinan' || rawData.role === 'staf'
              ? rawData.role
              : existing.role || 'staf',
          bidang: isTargetPrimary ? validBidang || 'pembinaan' : validBidang,
          status: isTargetPrimary
            ? 'Aktif'
            : rawData.status === 'Aktif' ||
                rawData.status === 'Pending' ||
                rawData.status === 'Diblokir'
              ? rawData.status
              : existing.status || 'Pending',
          updatedAt: serverTimestamp(),
        };
        if (typeof rawData.displayName === 'string' && rawData.displayName.trim()) {
          payload.displayName = rawData.displayName.trim().slice(0, 150);
        }
        if (typeof rawData.photoURL === 'string') {
          payload.photoURL = rawData.photoURL.slice(0, 500);
        }
        if (!('lastLogin' in existing)) {
          payload.lastLogin = serverTimestamp();
        }
        phase1Ops.push({ collectionName: targetCol, docId, payload });
        colRestored++;
      } else if (targetCol === 'metadata') {
        if (docId !== 'statistik_satker') {
          colSkipped++;
          continue;
        }
        const payload = pickKeys(rawData, [
          'pembinaan',
          'datun',
          'papbb',
          'pidum',
          'pidsus',
          'intelijen',
        ]);
        payload.updatedByUid = currentUser.uid;
        payload.updatedAt = serverTimestamp();
        phase1Ops.push({ collectionName: targetCol, docId, payload });
        colRestored++;
      } else if (targetCol === 'system') {
        if (docId !== 'bootstrap' || existing) {
          colSkipped++;
          continue;
        }
        phase1Ops.push({
          collectionName: targetCol,
          docId,
          payload: {
            firstAdminUid: currentUser.uid,
            createdAt: serverTimestamp(),
          },
        });
        colRestored++;
      }
    }

    totalRestored += colRestored;
    totalSkipped += colSkipped;
    details.push({
      label: COLLECTION_LABELS[targetCol] || targetCol,
      restored: colRestored,
      skipped: colSkipped,
    });
  }

  await commitOperationsInBatches(phase1Ops);
  if (phase2Ops.length > 0) {
    await commitOperationsInBatches(phase2Ops);
  }

  return {
    restoredCount: totalRestored,
    skippedCount: totalSkipped,
    details,
  };
}
