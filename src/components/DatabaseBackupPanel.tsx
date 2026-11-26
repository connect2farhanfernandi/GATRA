import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileJson,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import {
  LastBackupMeta,
  ValidatedBackupPreview,
  exportFullDatabaseBackup,
  loadLastBackupMeta,
  parseAndValidateBackupJson,
  restoreDatabaseFromBackup,
} from '../lib/backupRestore';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

export function DatabaseBackupPanel() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [lastBackup, setLastBackup] = useState<LastBackupMeta | null>(() => loadLastBackupMeta());
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<ValidatedBackupPreview | null>(null);

  if (userProfile?.role !== 'admin') {
    return null;
  }

  const handleExportBackup = async () => {
    if (exporting || restoring) return;
    setExporting(true);
    try {
      const result = await exportFullDatabaseBackup(userProfile);
      setLastBackup(result.meta);
      showToast(
        `Full backup berhasil diunduh (${result.payload.totalRecords} dokumen dari ${result.nonEmptyCollections} koleksi).`
      );
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Gagal membuat file cadangan database.',
        'error'
      );
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const validated = parseAndValidateBackupJson(text);
      setPendingRestore(validated);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'File backup JSON tidak valid atau rusak.',
        'error'
      );
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestore || restoring) return;
    setRestoring(true);
    try {
      const result = await restoreDatabaseFromBackup(pendingRestore, userProfile);
      setPendingRestore(null);
      if (result.skippedCount > 0) {
        showToast(
          `Pemulihan selesai: ${result.restoredCount} dokumen dipulihkan (${result.skippedCount} dokumen sistem/terkunci dilewati).`,
          'info'
        );
      } else {
        showToast(
          `Pemulihan berhasil: ${result.restoredCount} dokumen telah dipulihkan ke database.`
        );
      }
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Gagal memulihkan data dari file backup.',
        'error'
      );
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-emerald-700" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold font-display text-slate-900">
                  Cadangan &amp; Pemulihan Database (Full Backup)
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                  <ShieldCheck className="w-3 h-3 text-emerald-700" />
                  Khusus Admin
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                Ekspor seluruh koleksi Firestore GATRA 2.0 (Arsip, Master JRA, Arsip Vital,
                Peminjaman, Dokumen Kearsipan, Pustaka, Pengguna, dan Statistik) ke file JSON atau
                pulihkan kembali data yang terhapus secara aman tanpa menggandakan data yang ada.
              </p>

              <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {lastBackup ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>
                      Terakhir dicadangkan: {lastBackup.lastBackupLabel} ({lastBackup.totalRecords}{' '}
                      dokumen)
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md font-medium">
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Disarankan mencadangkan data setiap akhir pekan</span>
                  </span>
                )}
                {lastBackup && (
                  <span className="text-[11px] text-slate-500">
                    Disarankan mencadangkan data setiap akhir pekan.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleExportBackup()}
              disabled={exporting || restoring}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyiapkan Backup...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Unduh Full Backup (.json)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={exporting || restoring}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {restoring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memulihkan...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Pulihkan dari File (.json)</span>
                </>
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void handleFileChange(e)}
              className="hidden"
              aria-label="Pilih file backup JSON"
            />
          </div>
        </div>
      </section>

      {/* Dialog Konfirmasi Pemulihan Data */}
      {pendingRestore && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-dialog-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full shadow-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                  <FileJson className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3
                    id="restore-dialog-title"
                    className="text-sm font-semibold font-display text-slate-900"
                  >
                    Konfirmasi Pemulihan Database
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Periksa rincian file cadangan sebelum menulis ulang ke Firestore.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={restoring}
                onClick={() => setPendingRestore(null)}
                aria-label="Tutup dialog"
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                <div>
                  <div className="text-slate-500">Tanggal Backup</div>
                  <div className="font-semibold text-slate-900 mt-0.5">
                    {pendingRestore.exportedAtLabel}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Total Dokumen</div>
                  <div className="font-semibold text-emerald-800 mt-0.5 font-mono-tabular">
                    {pendingRestore.totalRecords} dokumen
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-slate-500">Dibuat Oleh / Aplikasi</div>
                  <div className="font-medium text-slate-800 mt-0.5 truncate">
                    {pendingRestore.exportedBy} — {pendingRestore.app}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Rincian Dokumen per Koleksi
                </div>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {pendingRestore.summaries.map((item) => (
                    <div
                      key={item.key}
                      className="px-3.5 py-2 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-700 font-medium">{item.label}</span>
                      <span className="font-mono-tabular font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  Data dipulihkan menggunakan ID dokumen asli (mode{' '}
                  <span className="font-semibold">merge</span>). Dokumen yang sempat terhapus akan
                  kembali tanpa menggandakan data yang sudah ada. Dokumen berstatus{' '}
                  <span className="font-semibold">Musnah</span> yang sudah ada dan catatan sistem
                  terkunci tetap dilindungi.
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={restoring}
                onClick={() => setPendingRestore(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={restoring}
                onClick={() => void handleConfirmRestore()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-60"
              >
                {restoring ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sedang Memulihkan...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>Ya, Pulihkan Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
