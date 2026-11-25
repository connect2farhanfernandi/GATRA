import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { BIDANG_LIST } from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge } from '../components/BidangBadge';
import { downloadCsv, parseCsvFile } from '../lib/csv';
import { normalizeBidangInput } from '../lib/lifecycle';
import { BidangId, JraItem, KeteranganAkhir } from '../types/archive';

interface JraFormState {
  nomor: string;
  kodeKlasifikasi: string;
  uraian: string;
  retensiAktif: string;
  retensiInaktif: string;
  keteranganAkhir: KeteranganAkhir;
  bidang: BidangId;
}

export function MasterJraPage() {
  const { userProfile } = useAuth();
  const { jraList, saveJraItem, deleteJraItem, importJraItems, loadingData } =
    useArchiveData();
  const { showToast } = useToast();

  const isAdmin = userProfile?.role === 'admin';
  const isPimpinan = userProfile?.role === 'pimpinan';

  const [search, setSearch] = useState('');
  const [filterBidang, setFilterBidang] = useState<'all' | BidangId>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<JraItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<JraFormState>({
    nomor: '1',
    kodeKlasifikasi: '',
    uraian: '',
    retensiAktif: '2',
    retensiInaktif: '3',
    keteranganAkhir: 'Musnah',
    bidang: 'pembinaan',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jraList.filter((item) => {
      if (filterBidang !== 'all' && item.bidang !== filterBidang) return false;
      if (!q) return true;
      return (
        item.kodeKlasifikasi.toLowerCase().includes(q) ||
        item.uraian.toLowerCase().includes(q)
      );
    });
  }, [jraList, filterBidang, search]);

  const openAdd = () => {
    const nextNum = jraList.length > 0 ? Math.max(...jraList.map((j) => Number(j.nomor))) + 1 : 1;
    setEditingItem(null);
    setForm({
      nomor: String(nextNum),
      kodeKlasifikasi: '',
      uraian: '',
      retensiAktif: '2',
      retensiInaktif: '3',
      keteranganAkhir: 'Musnah',
      bidang: 'pembinaan',
    });
    setModalOpen(true);
  };

  const openEdit = (item: JraItem) => {
    setEditingItem(item);
    setForm({
      nomor: String(item.nomor),
      kodeKlasifikasi: item.kodeKlasifikasi,
      uraian: item.uraian,
      retensiAktif: String(item.retensiAktif),
      retensiInaktif: String(item.retensiInaktif),
      keteranganAkhir: item.keteranganAkhir,
      bidang: item.bidang,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.kodeKlasifikasi.trim() || !form.uraian.trim()) {
      showToast('Kode Klasifikasi dan Uraian wajib diisi.', 'error');
      return;
    }
    setSaving(true);
    try {
      await saveJraItem(
        {
          nomor: Math.max(1, Number(form.nomor) || 1),
          kodeKlasifikasi: form.kodeKlasifikasi.trim().slice(0, 300),
          uraian: form.uraian.trim().slice(0, 1000),
          retensiAktif: Math.max(0, Number(form.retensiAktif) || 0),
          retensiInaktif: Math.max(0, Number(form.retensiInaktif) || 0),
          keteranganAkhir: form.keteranganAkhir,
          bidang: form.bidang,
        },
        editingItem?.id
      );
      showToast(editingItem ? 'Pedoman JRA berhasil diperbarui.' : 'Pedoman JRA ditambahkan.');
      setModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan JRA.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: JraItem) => {
    try {
      await deleteJraItem(item.id);
      showToast(`Kode ${item.kodeKlasifikasi} dihapus.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus JRA.', 'error');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Nomor',
      'Kode Klasifikasi',
      'Uraian/Jenis Klasifikasi',
      'Masa Retensi Aktif',
      'Masa Retensi Inaktif',
      'Keterangan Akhir',
      'Kategori Bidang',
    ];
    const rows = filtered.map((item) => [
      item.nomor,
      item.kodeKlasifikasi,
      item.uraian,
      item.retensiAktif,
      item.retensiInaktif,
      item.keteranganAkhir,
      item.bidang,
    ]);
    downloadCsv('master_pedoman_jra_gatra.csv', headers, rows);
    showToast(`Berhasil mengekspor ${rows.length} baris Pedoman JRA.`);
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const records = await parseCsvFile(file);
      const parsed: Array<Omit<JraItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>> = [];

      const inferBidangFromCode = (code: string, fallback: BidangId): BidangId => {
        const upper = code.trim().toUpperCase();
        if (upper.startsWith('DT')) return 'datun';
        if (upper.startsWith('IN')) return 'intelijen';
        if (upper.startsWith('PA')) return 'papbb';
        if (upper.startsWith('PU')) return 'pidum';
        if (upper.startsWith('KH')) return 'pidsus';
        return fallback;
      };

      const splitCombinedCode = (raw: string): { kode: string; uraian: string } => {
        const trimmed = raw.trim();
        const match = trimmed.match(/^([A-Za-z]{1,4}(?:[.,\s-]\d+)+)\s*(.*)$/);
        if (match) {
          const cleanKode = match[1].replace(',', '.').replace(/\s+/g, '.').trim();
          return { kode: cleanKode, uraian: (match[2] || trimmed).trim() };
        }
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx > 0) {
          return {
            kode: trimmed.slice(0, spaceIdx).trim(),
            uraian: trimmed.slice(spaceIdx + 1).trim(),
          };
        }
        return { kode: trimmed, uraian: '' };
      };

      records.forEach((row, idx) => {
        const rawKode =
          row['Kode Klasifikasi'] ||
          row['kodeKlasifikasi'] ||
          row['Kode'] ||
          '';
        const rawUraian =
          row['Uraian/Jenis Klasifikasi'] ||
          row['Uraian'] ||
          row['uraian'] ||
          '';

        const activeStr = String(
          row['Masa Retensi Aktif'] ??
            row['Masa Aktif'] ??
            row['Masa Akitf'] ??
            row['Retensi Aktif'] ??
            row['retensiAktif'] ??
            ''
        ).trim();
        const inaktifStr = String(
          row['Masa Retensi Inaktif'] ??
            row['Masa Inaktif'] ??
            row['Retensi Inaktif'] ??
            row['retensiInaktif'] ??
            ''
        ).trim();
        const ketRaw = String(
          row['Keterangan Akhir'] ??
            row['Keterangan'] ??
            row['keteranganAkhir'] ??
            ''
        )
          .trim()
          .toLowerCase();

        // Skip section header rows in Google Sheets PEDOMAN_JRA that have empty retentions & no Musnah/Permanen
        const isGoogleSheetsPedoman = !rawUraian.trim();
        if (isGoogleSheetsPedoman && !activeStr && !inaktifStr && !ketRaw) {
          return;
        }

        let kode = rawKode.trim();
        let uraian = rawUraian.trim();
        if (!uraian && kode) {
          const split = splitCombinedCode(kode);
          kode = split.kode;
          uraian = split.uraian || kode;
        }

        const bidangRaw =
          row['Kategori Bidang'] || row['Bidang'] || row['bidang'] || '';
        const explicitBidang = bidangRaw ? normalizeBidangInput(bidangRaw) : null;
        const bidang = explicitBidang || inferBidangFromCode(kode, 'pembinaan');
        const keteranganAkhir: KeteranganAkhir = ketRaw.includes('perm') ? 'Permanen' : 'Musnah';

        const retensiAktif = activeStr !== '' ? Math.max(0, Number(activeStr) || 0) : 2;
        const retensiInaktif = inaktifStr !== '' ? Math.max(0, Number(inaktifStr) || 0) : 3;

        if (kode && uraian) {
          parsed.push({
            nomor: Number(row['Nomor'] || row['nomor'] || parsed.length + 1) || idx + 1,
            kodeKlasifikasi: kode.slice(0, 300),
            uraian: uraian.slice(0, 1000),
            retensiAktif: Math.min(100, retensiAktif),
            retensiInaktif: Math.min(100, retensiInaktif),
            keteranganAkhir,
            bidang,
          });
        }
      });

      if (parsed.length === 0) {
        showToast('Tidak ada baris valid yang ditemukan dalam CSV.', 'error');
        return;
      }

      const count = await importJraItems(parsed);
      showToast(`Berhasil mengimpor ${count} entri Pedoman JRA.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mengimpor CSV JRA.', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold font-display text-slate-900">
            Master Pedoman JRA (Substantif &amp; Fasilitatif)
          </h2>
          <p className="text-xs text-slate-500">
            Saat input arsip, dropdown klasifikasi otomatis menampilkan kode milik bidang terkait ditambah seluruh kode Sub Bagian Pembinaan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {!isPimpinan && isAdmin && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(e) => void handleImportCsv(e)}
                className="hidden"
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{importing ? 'Mengimpor...' : 'Impor CSV'}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>

          {!isPimpinan && isAdmin && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kode JRA</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter & Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode klasifikasi atau uraian jenis arsip..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="jra-bidang" className="text-xs font-medium text-slate-600">
            Kategori Bidang:
          </label>
          <select
            id="jra-bidang"
            value={filterBidang}
            onChange={(e) => setFilterBidang(e.target.value as 'all' | BidangId)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
          >
            <option value="all">Semua Bidang ({jraList.length})</option>
            {BIDANG_LIST.map((b) => (
              <option key={b.id} value={b.id}>
                {b.singkatan} — {b.nama}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabel JRA */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 w-16">Nomor</th>
                <th className="py-3 px-4 w-36">Kode Klasifikasi</th>
                <th className="py-3 px-4">Uraian / Jenis Klasifikasi</th>
                <th className="py-3 px-4 text-right w-32">Retensi Aktif</th>
                <th className="py-3 px-4 text-right w-32">Retensi Inaktif</th>
                <th className="py-3 px-4 w-32">Keterangan Akhir</th>
                <th className="py-3 px-4 w-36">Kategori Bidang</th>
                {!isPimpinan && isAdmin && <th className="py-3 px-4 text-right w-24">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loadingData ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Memuat Master Pedoman JRA...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    Belum ada data Pedoman JRA yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-tabular text-slate-600">{item.nomor}</td>
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                      {item.kodeKlasifikasi}
                    </td>
                    <td className="py-3 px-4 text-slate-700 leading-snug">{item.uraian}</td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-800">
                      {item.retensiAktif} th
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-800">
                      {item.retensiInaktif} th
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded border ${
                          item.keteranganAkhir === 'Permanen'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-900 border-amber-200'
                        }`}
                      >
                        {item.keteranganAkhir}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <BidangBadge bidang={item.bidang} size="xs" />
                    </td>
                    {!isPimpinan && isAdmin && (
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            title="Edit JRA"
                            className="p-1.5 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            title="Hapus JRA"
                            className="p-1.5 rounded text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tambah / Edit JRA */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold font-display text-slate-900">
                {editingItem ? 'Edit Pedoman JRA' : 'Tambah Kode Pedoman JRA'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Nomor</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.nomor}
                    onChange={(e) => setForm({ ...form, nomor: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Kode Klasifikasi</label>
                  <input
                    type="text"
                    required
                    maxLength={300}
                    value={form.kodeKlasifikasi}
                    onChange={(e) => setForm({ ...form, kodeKlasifikasi: e.target.value })}
                    placeholder="Contoh: PDM.1.1"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Uraian / Jenis Klasifikasi
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={1000}
                  value={form.uraian}
                  onChange={(e) => setForm({ ...form, uraian: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Masa Retensi Aktif (Tahun)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={form.retensiAktif}
                    onChange={(e) => setForm({ ...form, retensiAktif: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Masa Retensi Inaktif (Tahun)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={form.retensiInaktif}
                    onChange={(e) => setForm({ ...form, retensiInaktif: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Keterangan Akhir</label>
                  <select
                    value={form.keteranganAkhir}
                    onChange={(e) =>
                      setForm({ ...form, keteranganAkhir: e.target.value as KeteranganAkhir })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Musnah">Musnah</option>
                    <option value="Permanen">Permanen</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Kategori Bidang</label>
                  <select
                    value={form.bidang}
                    onChange={(e) => setForm({ ...form, bidang: e.target.value as BidangId })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {BIDANG_LIST.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.singkatan} — {b.nama}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan JRA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
