import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileCheck2,
  FileUp,
  FolderOpen,
  Link2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import {
  BIDANG_LIST,
  BIDANG_MAP,
  DOKUMEN_KEARSIPAN_CATEGORIES,
  MAX_DOKUMEN_BASE64_LENGTH,
  MAX_DOKUMEN_FILE_BYTES,
} from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge } from '../components/BidangBadge';
import { formatIndonesianDate, isSafeHttpUrl, todayIsoDate } from '../lib/lifecycle';
import {
  BidangId,
  DokumenAttachmentType,
  DokumenKearsipanCategory,
  DokumenKearsipanItem,
} from '../types/archive';

function formatTanggalDokumen(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(parsed.getTime())) {
      return formatIndonesianDate(parsed);
    }
  }
  return raw || '—';
}

function formatFileSizeKb(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function downloadBase64File(item: DokumenKearsipanItem): void {
  if (!item.fileBase64) return;
  const binaryString = atob(item.fileBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], {
    type: item.fileMimeType || 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', item.fileName || `${item.judul}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ManajemenDokumenPage() {
  const { userProfile } = useAuth();
  const { dokumenList, saveDokumenKearsipan, deleteDokumenKearsipan, loadingData } =
    useArchiveData();
  const { showToast } = useToast();

  const isAdmin = userProfile?.role === 'admin';

  const [search, setSearch] = useState('');
  const [filterKategori, setFilterKategori] = useState<'all' | DokumenKearsipanCategory>('all');
  const [filterBidang, setFilterBidang] = useState<'all' | 'lintas_bidang' | BidangId>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DokumenKearsipanItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [judul, setJudul] = useState('');
  const [kategori, setKategori] = useState<DokumenKearsipanCategory>(
    DOKUMEN_KEARSIPAN_CATEGORIES[0]
  );
  const [nomorSurat, setNomorSurat] = useState('');
  const [tanggalDokumen, setTanggalDokumen] = useState(todayIsoDate());
  const [bidangTerkait, setBidangTerkait] = useState<BidangId | 'lintas_bidang'>('lintas_bidang');
  const [tipeLampiran, setTipeLampiran] = useState<DokumenAttachmentType>('gdrive');
  const [urlGoogleDrive, setUrlGoogleDrive] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileMimeType, setFileMimeType] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [fileBase64, setFileBase64] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dokumenList.filter((item) => {
      if (filterKategori !== 'all' && item.kategori !== filterKategori) return false;
      if (filterBidang !== 'all' && item.bidangTerkait !== filterBidang) return false;
      if (!q) return true;
      const bidangText =
        item.bidangTerkait === 'lintas_bidang'
          ? 'lintas bidang'
          : BIDANG_MAP[item.bidangTerkait]?.nama || item.bidangTerkait;
      return (
        item.judul.toLowerCase().includes(q) ||
        item.nomorSurat.toLowerCase().includes(q) ||
        item.kategori.toLowerCase().includes(q) ||
        bidangText.toLowerCase().includes(q) ||
        (item.fileName || '').toLowerCase().includes(q)
      );
    });
  }, [dokumenList, filterKategori, filterBidang, search]);

  const resetForm = () => {
    setJudul('');
    setKategori(DOKUMEN_KEARSIPAN_CATEGORIES[0]);
    setNomorSurat('');
    setTanggalDokumen(todayIsoDate());
    setBidangTerkait('lintas_bidang');
    setTipeLampiran('gdrive');
    setUrlGoogleDrive('');
    setFileName('');
    setFileMimeType('');
    setFileSize(0);
    setFileBase64('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openAddModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_DOKUMEN_FILE_BYTES) {
      showToast(
        `Ukuran file "${file.name}" (${formatFileSizeKb(file.size)}) melebihi batas maksimal 750 KB. Gunakan tautan Google Drive untuk file berukuran besar.`,
        'error'
      );
      if (fileInputRef.current) fileInputRef.current.value = '';
      setFileName('');
      setFileMimeType('');
      setFileSize(0);
      setFileBase64('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      const pureBase64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      if (!pureBase64 || pureBase64.length > MAX_DOKUMEN_BASE64_LENGTH) {
        showToast('Gagal memproses file atau ukuran Base64 melebihi batas Firestore.', 'error');
        return;
      }
      setFileName(file.name);
      setFileMimeType(file.type || 'application/octet-stream');
      setFileSize(file.size);
      setFileBase64(pureBase64);
    };
    reader.onerror = () => {
      showToast('Gagal membaca file yang dipilih.', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!judul.trim() || !nomorSurat.trim() || !tanggalDokumen.trim()) {
      showToast('Judul Dokumen, Nomor Surat/BA, dan Tanggal Dokumen wajib diisi.', 'error');
      return;
    }
    if (tipeLampiran === 'gdrive') {
      if (!isSafeHttpUrl(urlGoogleDrive)) {
        showToast('Masukkan tautan Google Drive yang valid (diawali https://).', 'error');
        return;
      }
    } else if (!fileBase64 || !fileName) {
      showToast('Unggah file PDF atau DOCX terlebih dahulu (maks. 750 KB).', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveDokumenKearsipan({
        judul: judul.trim(),
        kategori,
        nomorSurat: nomorSurat.trim(),
        tanggalDokumen,
        bidangTerkait,
        tipeLampiran,
        ...(tipeLampiran === 'gdrive'
          ? { urlGoogleDrive: urlGoogleDrive.trim() }
          : { fileName, fileMimeType, fileSize, fileBase64 }),
      });
      showToast('Dokumen resmi kearsipan berhasil disimpan.');
      setModalOpen(false);
      resetForm();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan dokumen.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDokumenKearsipan(deleteTarget.id);
      showToast(`Dokumen "${deleteTarget.judul}" berhasil dihapus.`);
      setDeleteTarget(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus dokumen.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold font-display text-slate-900">
              Manajemen Dokumen Bukti Pelaksanaan Kearsipan
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Repositori resmi dokumen kearsipan satuan kerja yang telah disahkan/ditandatangani (Berita Acara, Persetujuan ANRI, Daftar Arsip Disahkan, dan SK Kearsipan).
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Dokumen</span>
          </button>
        )}
      </div>

      {/* Filter & Pencarian */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul dokumen, nomor surat/BA, atau nama file..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="dok-filter-kat" className="text-xs font-medium text-slate-600">
              Kategori:
            </label>
            <select
              id="dok-filter-kat"
              value={filterKategori}
              onChange={(e) =>
                setFilterKategori(e.target.value as 'all' | DokumenKearsipanCategory)
              }
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">Semua Kategori ({dokumenList.length})</option>
              {DOKUMEN_KEARSIPAN_CATEGORIES.map((kat) => (
                <option key={kat} value={kat}>
                  {kat}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="dok-filter-bidang" className="text-xs font-medium text-slate-600">
              Bidang:
            </label>
            <select
              id="dok-filter-bidang"
              value={filterBidang}
              onChange={(e) =>
                setFilterBidang(e.target.value as 'all' | 'lintas_bidang' | BidangId)
              }
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">Semua</option>
              <option value="lintas_bidang">Lintas Bidang</option>
              {BIDANG_LIST.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.singkatan}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabel Daftar Dokumen */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 w-12">No</th>
                <th className="py-3 px-4 min-w-[240px]">Judul &amp; Nomor Surat / BA</th>
                <th className="py-3 px-4 whitespace-nowrap">Kategori Dokumen</th>
                <th className="py-3 px-4 whitespace-nowrap">Tanggal Dokumen</th>
                <th className="py-3 px-4 whitespace-nowrap">Bidang Terkait</th>
                <th className="py-3 px-4 whitespace-nowrap">Jenis Lampiran</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loadingData ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 text-xs">
                    Memuat dokumen kearsipan...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2 max-w-md mx-auto">
                      <FolderOpen className="w-8 h-8 text-slate-300" />
                      <p className="text-sm font-medium text-slate-700">
                        Belum ada dokumen bukti kearsipan yang sesuai filter.
                      </p>
                      <p className="text-xs text-slate-500">
                        {isAdmin
                          ? 'Klik tombol "Tambah Dokumen" untuk mengunggah arsip Berita Acara atau Surat Persetujuan ANRI yang sudah disahkan.'
                          : 'Dokumen resmi yang diunggah oleh Admin / Arsiparis akan tampil di sini.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-4 font-mono-tabular text-slate-600">{idx + 1}</td>
                    <td className="py-3 px-4 space-y-1">
                      <div className="font-semibold text-slate-900 leading-snug">{item.judul}</div>
                      <div className="text-xs font-mono-tabular text-slate-500">
                        No: {item.nomorSurat}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {item.kategori}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                      {formatTanggalDokumen(item.tanggalDokumen)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {item.bidangTerkait === 'lintas_bidang' ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded bg-slate-100 text-slate-800 border border-slate-300">
                          Lintas Bidang
                        </span>
                      ) : (
                        <BidangBadge bidang={item.bidangTerkait} size="xs" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {item.tipeLampiran === 'gdrive' ? (
                        <span className="inline-flex items-center gap-1.5 text-slate-700">
                          <Link2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Tautan Google Drive</span>
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
                            <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
                            <span className="max-w-[180px] truncate">{item.fileName || 'File'}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono-tabular">
                            {formatFileSizeKb(item.fileSize)}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        {item.tipeLampiran === 'gdrive' &&
                        item.urlGoogleDrive &&
                        isSafeHttpUrl(item.urlGoogleDrive) ? (
                          <a
                            href={item.urlGoogleDrive}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-700 text-emerald-800 bg-white hover:bg-emerald-50"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Buka / Unduh Dokumen</span>
                          </a>
                        ) : item.tipeLampiran === 'upload' && item.fileBase64 ? (
                          <button
                            type="button"
                            onClick={() => downloadBase64File(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-700 text-emerald-800 bg-white hover:bg-emerald-50 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Buka / Unduh Dokumen</span>
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Lampiran tidak tersedia</span>
                        )}

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(item)}
                            title="Hapus Dokumen"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-700 bg-white hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form Tambah Dokumen (Khusus Admin) */}
      {modalOpen && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-semibold font-display text-slate-900">
                  Tambah Dokumen Resmi Kearsipan
                </h3>
                <p className="text-xs text-slate-500">
                  Simpan arsip bukti pelaksanaan kearsipan yang telah disahkan / ditandatangani.
                </p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700">
                  Judul Dokumen <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={250}
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  placeholder="Contoh: Berita Acara Pemindahan Arsip Inaktif Pidum Tahun 2026"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Kategori Dokumen <span className="text-red-600">*</span>
                  </label>
                  <select
                    required
                    value={kategori}
                    onChange={(e) => setKategori(e.target.value as DokumenKearsipanCategory)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {DOKUMEN_KEARSIPAN_CATEGORIES.map((kat) => (
                      <option key={kat} value={kat}>
                        {kat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Tanggal Dokumen <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalDokumen}
                    onChange={(e) => setTanggalDokumen(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nomor Surat / BA <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={nomorSurat}
                    onChange={(e) => setNomorSurat(e.target.value)}
                    placeholder="Contoh: BA-08/M.3.41/Cp.1/11/2026"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Bidang Terkait <span className="text-red-600">*</span>
                  </label>
                  <select
                    required
                    value={bidangTerkait}
                    onChange={(e) =>
                      setBidangTerkait(e.target.value as BidangId | 'lintas_bidang')
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="lintas_bidang">Lintas Bidang (Satuan Kerja)</option>
                    {BIDANG_LIST.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.singkatan} — {b.nama}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pilihan Lampiran */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-700">
                  Lampiran Dokumen <span className="text-red-600">*</span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTipeLampiran('gdrive')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      tipeLampiran === 'gdrive'
                        ? 'bg-emerald-50 border-emerald-700 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Tautan Google Drive</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipeLampiran('upload')}
                    className={`flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                      tipeLampiran === 'upload'
                        ? 'bg-emerald-50 border-emerald-700 text-emerald-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Unggah PDF/DOCX (≤ 750 KB)</span>
                  </button>
                </div>

                {tipeLampiran === 'gdrive' ? (
                  <div className="space-y-1">
                    <input
                      type="url"
                      required={tipeLampiran === 'gdrive'}
                      maxLength={1000}
                      value={urlGoogleDrive}
                      onChange={(e) => setUrlGoogleDrive(e.target.value)}
                      placeholder="https://drive.google.com/file/d/..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <p className="text-[11px] text-slate-500">
                      Direkomendasikan untuk berkas hasil pindaian berukuran besar (&gt; 750 KB).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleFileChange}
                      className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50 cursor-pointer"
                    />
                    {fileName ? (
                      <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{fileName}</span>
                        <span className="font-mono-tabular shrink-0">
                          {formatFileSizeKb(fileSize)}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500">
                        Format yang didukung: PDF, DOC, DOCX. Maksimal 750 KB (disimpan langsung di database tanpa biaya Storage).
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Dokumen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus (Khusus Admin) */}
      {deleteTarget && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold font-display text-slate-900">
                Hapus Dokumen Kearsipan?
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Anda akan menghapus dokumen <strong>{deleteTarget.judul}</strong> (Nomor:{' '}
                <span className="font-mono-tabular">{deleteTarget.nomorSurat}</span>). Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-60 cursor-pointer"
              >
                {deleting ? 'Menghapus...' : 'Ya, Hapus Dokumen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
