import React, { useMemo, useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  Pencil,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  BIDANG_LIST,
  BIDANG_MAP,
  JANGKA_SIMPAN_VITAL_OPTIONS,
  MEDIA_SIMPAN_VITAL_OPTIONS,
  METODE_PERLINDUNGAN_VITAL_OPTIONS,
} from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge } from '../components/BidangBadge';
import { downloadCsv, parseCsvFile } from '../lib/csv';
import { isSafeHttpUrl, normalizeBidangInput } from '../lib/lifecycle';
import { BidangId, VitalArchiveItem } from '../types/archive';

interface VitalFormState {
  nomor: string;
  bidang: BidangId;
  uraian: string;
  kurunWaktu: string;
  mediaSimpan: string;
  jumlah: string;
  jangkaSimpan: string;
  lokasiSimpan: string;
  metodePerlindungan: string;
  tautanBackup: string;
  keterangan: string;
}

function getUnitKerjaLabel(bidang: BidangId): string {
  if (bidang === 'pembinaan') return 'Subbagian Pembinaan';
  return BIDANG_MAP[bidang]?.nama || bidang;
}

export function ArsipVitalPage() {
  const { userProfile } = useAuth();
  const {
    vitalArchives,
    saveVitalArchive,
    deleteVitalArchive,
    importVitalArchives,
    loadingData,
  } = useArchiveData();
  const { showToast } = useToast();

  const isAdmin = userProfile?.role === 'admin';
  const isPimpinan = userProfile?.role === 'pimpinan';
  const canMutate = !isPimpinan;

  const [search, setSearch] = useState('');
  const [filterBidang, setFilterBidang] = useState<'all' | BidangId>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VitalArchiveItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<VitalFormState>({
    nomor: '1',
    bidang: userProfile?.bidang || 'pembinaan',
    uraian: '',
    kurunWaktu: String(new Date().getFullYear()),
    mediaSimpan: 'Kertas',
    jumlah: '1 Berkas',
    jangkaSimpan: 'Permanen',
    lokasiSimpan: 'Brankas Utama BMN',
    metodePerlindungan: METODE_PERLINDUNGAN_VITAL_OPTIONS[0],
    tautanBackup: '',
    keterangan: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vitalArchives.filter((item) => {
      if (filterBidang !== 'all' && item.bidang !== filterBidang) return false;
      if (!q) return true;
      return (
        item.uraian.toLowerCase().includes(q) ||
        item.lokasiSimpan.toLowerCase().includes(q) ||
        item.metodePerlindungan.toLowerCase().includes(q) ||
        item.keterangan.toLowerCase().includes(q) ||
        (item.jangkaSimpan || '').toLowerCase().includes(q) ||
        getUnitKerjaLabel(item.bidang).toLowerCase().includes(q) ||
        String(item.kurunWaktu).includes(q)
      );
    });
  }, [vitalArchives, filterBidang, search]);

  const permanenCount = useMemo(
    () =>
      filtered.filter((v) =>
        (v.jangkaSimpan || 'Permanen').toLowerCase().includes('permanen')
      ).length,
    [filtered]
  );

  const uniqueLokasiCount = useMemo(
    () => new Set(filtered.map((v) => v.lokasiSimpan.trim()).filter(Boolean)).size,
    [filtered]
  );

  const openAdd = () => {
    const b = userProfile?.bidang || 'pembinaan';
    const nextNum =
      vitalArchives.length > 0
        ? Math.max(...vitalArchives.map((v) => Number(v.nomor))) + 1
        : 1;

    setEditingItem(null);
    setForm({
      nomor: String(nextNum),
      bidang: b,
      uraian: '',
      kurunWaktu: String(new Date().getFullYear()),
      mediaSimpan: 'Kertas',
      jumlah: '1 Berkas',
      jangkaSimpan: 'Permanen',
      lokasiSimpan: 'Brankas Utama BMN',
      metodePerlindungan: METODE_PERLINDUNGAN_VITAL_OPTIONS[0],
      tautanBackup: '',
      keterangan: '',
    });
    setModalOpen(true);
  };

  const openEdit = (item: VitalArchiveItem) => {
    setEditingItem(item);
    setForm({
      nomor: String(item.nomor),
      bidang: item.bidang,
      uraian: item.uraian,
      kurunWaktu: String(item.kurunWaktu),
      mediaSimpan: item.mediaSimpan || 'Kertas',
      jumlah: item.jumlah || '1 Berkas',
      jangkaSimpan: item.jangkaSimpan || 'Permanen',
      lokasiSimpan: item.lokasiSimpan,
      metodePerlindungan: item.metodePerlindungan,
      tautanBackup: item.tautanBackup || '',
      keterangan: item.keterangan || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.uraian.trim() ||
      !form.lokasiSimpan.trim() ||
      !form.metodePerlindungan.trim()
    ) {
      showToast(
        'Jenis Arsip, Lokasi Simpan, dan Metode Perlindungan wajib diisi.',
        'error'
      );
      return;
    }

    const kurun = Number(form.kurunWaktu);
    if (isNaN(kurun) || kurun < 1945 || kurun > 2100) {
      showToast('Kurun Waktu harus berupa tahun valid (1945–2100).', 'error');
      return;
    }

    if (form.tautanBackup.trim() && !isSafeHttpUrl(form.tautanBackup)) {
      showToast('Tautan Backup Digital harus diawali http:// atau https://.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveVitalArchive(
        {
          nomor: Math.max(1, Number(form.nomor) || 1),
          bidang: form.bidang,
          kodeKlasifikasi: editingItem?.kodeKlasifikasi || '',
          uraian: form.uraian.trim().slice(0, 2000),
          kurunWaktu: kurun,
          mediaSimpan: form.mediaSimpan.trim().slice(0, 100) || 'Kertas',
          jumlah: form.jumlah.trim().slice(0, 100) || '1 Berkas',
          jangkaSimpan: form.jangkaSimpan.trim().slice(0, 100) || 'Permanen',
          metodePerlindungan: form.metodePerlindungan.trim().slice(0, 1000),
          lokasiSimpan: form.lokasiSimpan.trim().slice(0, 200),
          tingkatKerawanan: editingItem?.tingkatKerawanan || 'Sangat Vital',
          tautanBackup: form.tautanBackup.trim().slice(0, 1000),
          keterangan: form.keterangan.trim().slice(0, 1000),
        },
        editingItem || undefined
      );
      showToast(
        editingItem
          ? 'Data arsip vital berhasil diperbarui.'
          : 'Data arsip vital berhasil disimpan.'
      );
      setModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan arsip vital.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: VitalArchiveItem) => {
    try {
      await deleteVitalArchive(item.id);
      showToast(`Arsip vital #${item.nomor} dihapus.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus arsip vital.', 'error');
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      'Daftar_Arsip_Vital_Kejaksaan_Negeri_Grobogan.csv',
      [
        'No',
        'Jenis Arsip',
        'Unit Kerja',
        'Kurun Waktu',
        'Media',
        'Jumlah',
        'Jangka Simpan',
        'Lokasi Simpan',
        'Metode Perlindungan',
        'Keterangan',
      ],
      filtered.map((v) => [
        v.nomor,
        v.uraian,
        getUnitKerjaLabel(v.bidang),
        v.kurunWaktu,
        v.mediaSimpan,
        v.jumlah,
        v.jangkaSimpan || 'Permanen',
        v.lokasiSimpan,
        v.metodePerlindungan,
        v.keterangan,
      ])
    );
    showToast(`Berhasil mengekspor ${filtered.length} data arsip vital.`);
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userProfile) return;
    setImporting(true);
    try {
      const records = await parseCsvFile(file);
      const parsed: Array<
        Omit<
          VitalArchiveItem,
          | 'id'
          | 'createdByUid'
          | 'createdByName'
          | 'updatedByUid'
          | 'updatedByName'
          | 'createdAt'
          | 'updatedAt'
        >
      > = [];

      records.forEach((row, idx) => {
        const uraian = (
          row['Jenis Arsip'] ||
          row['Uraian / Jenis Arsip Vital'] ||
          row['Uraian'] ||
          row['uraian'] ||
          ''
        ).trim();
        if (!uraian) return;

        const lokasi = (
          row['Lokasi Simpan'] ||
          row['lokasiSimpan'] ||
          'Brankas Utama BMN'
        ).trim();

        const rawUnit = row['Unit Kerja'] || row['Bidang'] || row['bidang'] || '';
        const rowBidang: BidangId = isAdmin
          ? normalizeBidangInput(rawUnit) || userProfile.bidang || 'pembinaan'
          : userProfile.bidang || 'pembinaan';

        const mediaSimpan = (
          row['Media'] ||
          row['Media Simpan'] ||
          row['mediaSimpan'] ||
          'Kertas'
        )
          .trim()
          .slice(0, 100);

        const jangkaSimpan = (
          row['Jangka Simpan'] ||
          row['jangkaSimpan'] ||
          'Permanen'
        )
          .trim()
          .slice(0, 100);

        const metodePerlindungan = (
          row['Metode Perlindungan'] ||
          row['metodePerlindungan'] ||
          METODE_PERLINDUNGAN_VITAL_OPTIONS[0]
        )
          .trim()
          .slice(0, 1000);

        const rawBackup = (row['Tautan Backup Digital'] || row['tautanBackup'] || '').trim();
        const tautanBackup = isSafeHttpUrl(rawBackup) ? rawBackup : '';
        const kurun = Number(
          row['Kurun Waktu'] || row['kurunWaktu'] || new Date().getFullYear()
        );

        parsed.push({
          nomor:
            Number(row['No'] || row['Nomor'] || row['nomor'] || parsed.length + 1) ||
            idx + 1,
          bidang: rowBidang,
          kodeKlasifikasi: (row['Kode Klasifikasi'] || row['kodeKlasifikasi'] || '')
            .trim()
            .slice(0, 300),
          uraian: uraian.slice(0, 2000),
          kurunWaktu:
            !isNaN(kurun) && kurun >= 1945 && kurun <= 2100
              ? kurun
              : new Date().getFullYear(),
          mediaSimpan: mediaSimpan || 'Kertas',
          jumlah: (row['Jumlah'] || '1 Berkas').trim().slice(0, 100) || '1 Berkas',
          jangkaSimpan: jangkaSimpan || 'Permanen',
          metodePerlindungan: metodePerlindungan || METODE_PERLINDUNGAN_VITAL_OPTIONS[0],
          lokasiSimpan: lokasi.slice(0, 200),
          tingkatKerawanan: 'Sangat Vital',
          tautanBackup: tautanBackup.slice(0, 1000),
          keterangan: (row['Keterangan'] || '').trim().slice(0, 1000),
        });
      });

      if (parsed.length === 0) {
        showToast('Tidak ada baris valid pada berkas CSV Arsip Vital.', 'error');
        return;
      }

      const count = await importVitalArchives(parsed);
      showToast(`Berhasil mengimpor ${count} data Arsip Vital.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mengimpor CSV Arsip Vital.', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-5">
      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <h2 className="text-base font-semibold font-display text-slate-900">
              Daftar Arsip Vital Kejaksaan Negeri Grobogan
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Inventaris arsip vital (sertifikat tanah/aset BMN, STNK, BPKB kendaraan dinas, dan dokumen esensial) lengkap dengan jangka simpan, lokasi simpan, metode perlindungan, dan keterangan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canMutate && (
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

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Daftar</span>
          </button>

          {canMutate && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Arsip Vital</span>
            </button>
          )}
        </div>
      </div>

      {/* Ringkasan KPI Arsip Vital */}
      <div className="no-print grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Total Arsip Vital Terdaftar</div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
            {filtered.length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Jangka Simpan Permanen</div>
          <div className="text-2xl font-bold font-mono-tabular text-emerald-700 mt-1">
            {permanenCount}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Lokasi Simpan Terdaftar</div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
            {uniqueLokasiCount}
          </div>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari jenis arsip, lokasi simpan, metode perlindungan..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
          />
        </div>

        {(isAdmin || isPimpinan) && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Unit Kerja:</label>
            <select
              value={filterBidang}
              onChange={(e) => setFilterBidang(e.target.value as 'all' | BidangId)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">Semua Unit Kerja</option>
              {BIDANG_LIST.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id === 'pembinaan' ? 'Subbagian Pembinaan' : b.nama}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Header Khusus Saat Print */}
      <div className="hidden print:block text-center mb-4 font-dinas">
        <div className="text-sm font-bold">KEJAKSAAN NEGERI GROBOGAN</div>
        <div className="text-base font-bold underline">DAFTAR ARSIP VITAL</div>
      </div>

      {/* Tabel Data Arsip Vital (Format 10 Kolom CSV) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden print-only-area">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-3 w-12">No</th>
                <th className="py-3 px-3 min-w-[230px]">Jenis Arsip</th>
                <th className="py-3 px-3 whitespace-nowrap">Unit Kerja</th>
                <th className="py-3 px-3 whitespace-nowrap">Kurun Waktu</th>
                <th className="py-3 px-3 whitespace-nowrap">Media</th>
                <th className="py-3 px-3 whitespace-nowrap">Jumlah</th>
                <th className="py-3 px-3 whitespace-nowrap">Jangka Simpan</th>
                <th className="py-3 px-3 min-w-[140px]">Lokasi Simpan</th>
                <th className="py-3 px-3 min-w-[240px]">Metode Perlindungan</th>
                <th className="py-3 px-3 min-w-[220px]">Keterangan</th>
                {canMutate && <th className="py-3 px-3 text-right no-print">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loadingData ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
                    Memuat data arsip vital...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
                    Belum ada data Arsip Vital yang tercatat.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 align-top">
                    <td className="py-3 px-3 font-mono-tabular text-slate-600">{item.nomor}</td>
                    <td className="py-3 px-3 font-medium text-slate-900 leading-snug">
                      {item.uraian}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="space-y-1">
                        <BidangBadge bidang={item.bidang} size="xs" />
                        <div className="text-[11px] text-slate-600">
                          {getUnitKerjaLabel(item.bidang)}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                      {item.kurunWaktu}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                      {item.mediaSimpan}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-700 whitespace-nowrap">
                      {item.jumlah}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded border bg-emerald-50 text-emerald-800 border-emerald-200">
                        {item.jangkaSimpan || 'Permanen'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs font-medium text-slate-800">
                      {item.lokasiSimpan}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-700 leading-relaxed">
                      <div>{item.metodePerlindungan}</div>
                      {item.tautanBackup && isSafeHttpUrl(item.tautanBackup) && (
                        <a
                          href={item.tautanBackup}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="no-print inline-flex items-center gap-1 mt-1 text-[11px] font-medium text-emerald-700 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Tautan Backup Digital</span>
                        </a>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 leading-relaxed">
                      {item.keterangan || '—'}
                    </td>
                    {canMutate && (
                      <td className="py-3 px-3 text-right no-print whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(item)}
                            title="Edit Arsip Vital"
                            className="p-1.5 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            title="Hapus Arsip Vital"
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

      {/* Modal Tambah / Edit Arsip Vital */}
      {modalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold font-display text-slate-900">
                {editingItem ? 'Edit Data Arsip Vital' : 'Tambah Data Arsip Vital'}
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">No</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.nomor}
                    onChange={(e) => setForm({ ...form, nomor: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-medium text-slate-700">Unit Kerja</label>
                  <select
                    disabled={!isAdmin}
                    value={form.bidang}
                    onChange={(e) =>
                      setForm({ ...form, bidang: e.target.value as BidangId })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    {BIDANG_LIST.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id === 'pembinaan' ? 'Subbagian Pembinaan' : b.nama}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Jenis Arsip</label>
                <textarea
                  rows={2}
                  required
                  maxLength={2000}
                  value={form.uraian}
                  onChange={(e) => setForm({ ...form, uraian: e.target.value })}
                  placeholder="Contoh: Sertifikat Hak Pakai No. 18 Tahun 1978 Tanah Bangunan Kantor..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Kurun Waktu</label>
                  <input
                    type="number"
                    min={1945}
                    max={2100}
                    required
                    value={form.kurunWaktu}
                    onChange={(e) => setForm({ ...form, kurunWaktu: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Media</label>
                  <input
                    type="text"
                    required
                    list="vital-media-options"
                    maxLength={100}
                    value={form.mediaSimpan}
                    onChange={(e) => setForm({ ...form, mediaSimpan: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <datalist id="vital-media-options">
                    {MEDIA_SIMPAN_VITAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Jumlah</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={form.jumlah}
                    onChange={(e) => setForm({ ...form, jumlah: e.target.value })}
                    placeholder="1 Berkas"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Jangka Simpan</label>
                  <input
                    type="text"
                    required
                    list="vital-jangka-options"
                    maxLength={100}
                    value={form.jangkaSimpan}
                    onChange={(e) => setForm({ ...form, jangkaSimpan: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <datalist id="vital-jangka-options">
                    {JANGKA_SIMPAN_VITAL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Lokasi Simpan</label>
                  <input
                    type="text"
                    required
                    maxLength={200}
                    value={form.lokasiSimpan}
                    onChange={(e) => setForm({ ...form, lokasiSimpan: e.target.value })}
                    placeholder="Contoh: Brankas Utama BMN"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Metode Perlindungan
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={1000}
                  value={form.metodePerlindungan}
                  onChange={(e) => setForm({ ...form, metodePerlindungan: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <div className="flex flex-wrap gap-1.5">
                  {METODE_PERLINDUNGAN_VITAL_OPTIONS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setForm({ ...form, metodePerlindungan: preset })}
                      className="text-[11px] px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      {preset.length > 42 ? `${preset.slice(0, 42)}...` : preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Keterangan</label>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                  placeholder="Bukti otentik kepemilikan sah..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Tautan Backup Digital (Opsional)
                </label>
                <input
                  type="url"
                  maxLength={1000}
                  value={form.tautanBackup}
                  onChange={(e) => setForm({ ...form, tautanBackup: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
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
                  className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Arsip Vital'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
