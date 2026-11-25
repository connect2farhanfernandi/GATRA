import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  Download,
  Flame,
  Pencil,
  Search,
  Square,
  X,
} from 'lucide-react';
import { BIDANG_LIST, METODE_PEMUSNAHAN_OPTIONS } from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge } from '../components/BidangBadge';
import { downloadCsv } from '../lib/csv';
import {
  getEffectiveArchiveStatus,
  normalizeArchiveStatus,
  todayIsoDate,
} from '../lib/lifecycle';
import {
  ArchiveItem,
  ArchiveLifecycleStatus,
  BidangId,
  MetodePemusnahan,
} from '../types/archive';

export type DistributionMode =
  | 'central_file'
  | 'record_center'
  | 'usul_musnah'
  | 'arsip_statis';

const MODE_CONFIG: Record<
  DistributionMode,
  {
    title: string;
    subtitle: string;
    targetStatus: ArchiveLifecycleStatus;
    csvFilename: string;
  }
> = {
  central_file: {
    title: 'Central File — Arsip Aktif',
    subtitle: 'Menampilkan seluruh arsip yang masih dalam masa retensi aktif di unit pengolah.',
    targetStatus: 'Aktif',
    csvFilename: 'central_file_arsip_aktif.csv',
  },
  record_center: {
    title: 'Record Center — Arsip Inaktif',
    subtitle:
      'Menampilkan arsip berstatus Inaktif (12 kolom standar). Gunakan tombol edit cepat untuk mengisi Nomor Boks dan Keterangan.',
    targetStatus: 'Inaktif',
    csvFilename: 'record_center_arsip_inaktif.csv',
  },
  usul_musnah: {
    title: 'Usul Musnah',
    subtitle:
      'Menampilkan arsip yang telah melewati masa retensi inaktif dengan keterangan akhir Musnah (13 kolom).',
    targetStatus: 'Usul Musnah',
    csvFilename: 'usul_musnah_arsip.csv',
  },
  arsip_statis: {
    title: 'Pendataan Arsip Statis',
    subtitle:
      'Menampilkan arsip yang telah melewati masa retensi inaktif dengan keterangan akhir Permanen (8 kolom).',
    targetStatus: 'Pendataan Arsip Statis',
    csvFilename: 'pendataan_arsip_statis.csv',
  },
};

export function DistribusiPage({ mode }: { mode: DistributionMode }) {
  const { userProfile } = useAuth();
  const { archives, quickUpdateArchiveBox, markArchivesDestroyed, loadingData } = useArchiveData();
  const { showToast } = useToast();

  const isAdmin = userProfile?.role === 'admin';
  const isPimpinan = userProfile?.role === 'pimpinan';
  const isStaf = userProfile?.role === 'staf';
  const cfg = MODE_CONFIG[mode];

  const [search, setSearch] = useState('');
  const [filterBidang, setFilterBidang] = useState<'all' | BidangId>('all');

  const [boxModalItem, setBoxModalItem] = useState<ArchiveItem | null>(null);
  const [boxValue, setBoxValue] = useState('');
  const [ketValue, setKetValue] = useState('');
  const [savingBox, setSavingBox] = useState(false);

  // State Aksi Massal Pemusnahan (Khusus Admin pada tab Usul Musnah)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [destroyModalOpen, setDestroyModalOpen] = useState(false);
  const [nomorSuratAnri, setNomorSuratAnri] = useState('');
  const [tanggalPersetujuanAnri, setTanggalPersetujuanAnri] = useState('');
  const [nomorBaPemusnahan, setNomorBaPemusnahan] = useState('');
  const [tanggalPemusnahan, setTanggalPemusnahan] = useState(todayIsoDate());
  const [metodePemusnahan, setMetodePemusnahan] =
    useState<MetodePemusnahan>('Pencacahan');
  const [savingDestroy, setSavingDestroy] = useState(false);

  const filtered = useMemo(() => {
    const yearNow = new Date().getFullYear();
    const q = search.trim().toLowerCase();
    return archives.filter((item) => {
      const status = getEffectiveArchiveStatus(item, yearNow);
      if (status !== cfg.targetStatus) return false;
      if (!isStaf && filterBidang !== 'all' && item.bidang !== filterBidang) return false;
      if (!q) return true;
      return (
        item.kodeKlasifikasi.toLowerCase().includes(q) ||
        item.uraian.toLowerCase().includes(q) ||
        item.nomorBoks.toLowerCase().includes(q) ||
        String(item.kurunWaktu).includes(q)
      );
    });
  }, [archives, cfg.targetStatus, filterBidang, isStaf, search]);

  useEffect(() => {
    setSelectedIds(new Set());
    setDestroyModalOpen(false);
  }, [mode]);

  const filteredIdsSet = useMemo(() => new Set(filtered.map((a) => a.id)), [filtered]);

  const selectedItems = useMemo(
    () => filtered.filter((a) => selectedIds.has(a.id)),
    [filtered, selectedIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of filtered) next.delete(item.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of filtered) next.add(item.id);
        return next;
      });
    }
  };

  const openDestroyModal = () => {
    if (selectedItems.length === 0) {
      showToast('Pilih minimal 1 berkas arsip yang akan ditandai sudah dimusnahkan.', 'error');
      return;
    }
    setNomorSuratAnri('');
    setTanggalPersetujuanAnri('');
    setNomorBaPemusnahan('');
    setTanggalPemusnahan(todayIsoDate());
    setMetodePemusnahan('Pencacahan');
    setDestroyModalOpen(true);
  };

  const handleConfirmDestroy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) return;
    if (
      !nomorSuratAnri.trim() ||
      !tanggalPersetujuanAnri.trim() ||
      !nomorBaPemusnahan.trim() ||
      !tanggalPemusnahan.trim()
    ) {
      showToast('Lengkapi seluruh Nomor & Tanggal Surat ANRI serta BA Pemusnahan.', 'error');
      return;
    }

    setSavingDestroy(true);
    try {
      const count = await markArchivesDestroyed(selectedItems, {
        nomorSuratAnri,
        tanggalPersetujuanAnri,
        nomorBaPemusnahan,
        tanggalPemusnahan,
        metodePemusnahan,
      });
      showToast(
        `${count} arsip resmi berstatus Musnah (Read-Only) dan dipindahkan ke tab Arsip Dimusnahkan.`
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of filteredIdsSet) next.delete(id);
        return next;
      });
      setDestroyModalOpen(false);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menyelesaikan proses pemusnahan arsip.',
        'error'
      );
    } finally {
      setSavingDestroy(false);
    }
  };

  const openBoxEdit = (item: ArchiveItem) => {
    setBoxModalItem(item);
    setBoxValue(item.nomorBoks);
    setKetValue(
      item.catatanRecordCenter || (normalizeArchiveStatus(item.keterangan) ? '' : item.keterangan)
    );
  };

  const handleSaveBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boxModalItem) return;
    setSavingBox(true);
    try {
      await quickUpdateArchiveBox(boxModalItem, boxValue, ketValue);
      showToast('Nomor Boks dan Keterangan diperbarui.');
      setBoxModalItem(null);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui Nomor Boks.', 'error');
    } finally {
      setSavingBox(false);
    }
  };

  const handleExportCsv = () => {
    if (mode === 'central_file') {
      downloadCsv(
        cfg.csvFilename,
        [
          'Nomor',
          'Nomor Berkas',
          'Nomor Item',
          'Bidang',
          'Kode Klasifikasi',
          'Uraian Informasi Arsip',
          'Kurun Waktu',
          'Tingkat Perkembangan',
          'Jumlah',
          'Lokasi (Kabinet/Laci/Folder)',
          'Retensi Aktif',
          'Kondisi Fisik',
        ],
        filtered.map((a, idx) => [
          idx + 1,
          a.nomorBerkas,
          a.nomorItem,
          a.bidang,
          a.kodeKlasifikasi,
          a.uraian,
          a.kurunWaktu,
          a.tingkatPerkembangan,
          a.jumlah,
          `${a.filingCabinet || '-'} / ${a.laci || '-'} / ${a.folder || '-'}`,
          a.retensiAktif,
          a.kondisiFisik,
        ])
      );
    } else if (mode === 'record_center') {
      downloadCsv(
        cfg.csvFilename,
        [
          'Nomor',
          'Kode Klasifikasi',
          'Uraian Arsip',
          'Kurun Waktu',
          'Kondisi',
          'Penataan',
          'Retensi Aktif',
          'Retensi Inaktif',
          'Keterangan Akhir',
          'Jumlah',
          'Nomor Boks',
          'Keterangan',
        ],
        filtered.map((a, idx) => [
          idx + 1,
          a.kodeKlasifikasi,
          a.uraian,
          a.kurunWaktu,
          a.kondisiFisik,
          a.penataan,
          a.retensiAktif,
          a.retensiInaktif,
          a.keteranganAkhir,
          a.jumlah,
          a.nomorBoks,
          a.catatanRecordCenter || (normalizeArchiveStatus(a.keterangan) ? '' : a.keterangan),
        ])
      );
    } else if (mode === 'usul_musnah') {
      downloadCsv(
        cfg.csvFilename,
        [
          'Nomor',
          'Kode Klasifikasi Arsip',
          'Uraian Informasi Arsip',
          'Kurun Waktu',
          'Jumlah',
          'Tingkat Perkembangan',
          'Kondisi',
          'Penataan',
          'Retensi Aktif',
          'Retensi Inaktif',
          'Keterangan Akhir',
          'Dasar Perhitungan Retensi',
          'Keterangan Tambahan',
        ],
        filtered.map((a, idx) => [
          idx + 1,
          a.kodeKlasifikasi,
          a.uraian,
          a.kurunWaktu,
          a.jumlah,
          a.tingkatPerkembangan,
          a.kondisiFisik,
          a.penataan,
          a.retensiAktif,
          a.retensiInaktif,
          a.keteranganAkhir,
          a.dasarRetensi,
          a.keterangan,
        ])
      );
    } else {
      downloadCsv(
        cfg.csvFilename,
        [
          'Nomor',
          'Kode Klasifikasi',
          'Uraian Informasi Arsip',
          'Tahun',
          'Jumlah',
          'Kondisi',
          'Penataan',
          'Keterangan',
        ],
        filtered.map((a, idx) => [
          idx + 1,
          a.kodeKlasifikasi,
          a.uraian,
          a.kurunWaktu,
          a.jumlah,
          a.kondisiFisik,
          a.penataan,
          a.keterangan,
        ])
      );
    }
    showToast(`Berhasil mengekspor ${filtered.length} baris ke CSV.`);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold font-display text-slate-900">{cfg.title}</h2>
          <p className="text-xs text-slate-500">{cfg.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {mode === 'usul_musnah' && isAdmin && (
            <>
              <button
                type="button"
                onClick={toggleSelectAllFiltered}
                disabled={filtered.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {allFilteredSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-700" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>{allFilteredSelected ? 'Batal Pilih Semua' : 'Pilih Semua'}</span>
              </button>
              <button
                type="button"
                onClick={openDestroyModal}
                disabled={selectedItems.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>
                  Tandai Sudah Dimusnahkan
                  {selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV ({filtered.length})</span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode klasifikasi, uraian, tahun, atau nomor boks..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
          />
        </div>

        {!isStaf && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Bidang:</label>
            <select
              value={filterBidang}
              onChange={(e) => setFilterBidang(e.target.value as 'all' | BidangId)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="all">Semua Bidang</option>
              {BIDANG_LIST.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.singkatan}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          {mode === 'central_file' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nomor</th>
                  <th className="py-3 px-4">Bidang</th>
                  <th className="py-3 px-4">No. Berkas</th>
                  <th className="py-3 px-4">Kode Klasifikasi</th>
                  <th className="py-3 px-4 min-w-[240px]">Uraian Informasi Arsip</th>
                  <th className="py-3 px-4">Kurun Waktu</th>
                  <th className="py-3 px-4">Lokasi Central File</th>
                  <th className="py-3 px-4 text-right">Retensi Aktif</th>
                  <th className="py-3 px-4">Kondisi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingData ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      Memuat data Central File...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      Tidak ada arsip berstatus Aktif saat ini.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a, idx) => (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-tabular text-slate-600">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <BidangBadge bidang={a.bidang} size="xs" />
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-800">{a.nomorBerkas}</td>
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                        {a.kodeKlasifikasi}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{a.uraian}</td>
                      <td className="py-3 px-4 font-mono-tabular">{a.kurunWaktu}</td>
                      <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                        Kab {a.filingCabinet || '-'} · Laci {a.laci || '-'} · Fol {a.folder || '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {a.retensiAktif} th
                      </td>
                      <td className="py-3 px-4 text-xs">{a.kondisiFisik}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {mode === 'record_center' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-3">Nomor</th>
                  <th className="py-3 px-3 whitespace-nowrap">Kode Klasifikasi</th>
                  <th className="py-3 px-3 min-w-[220px]">Uraian Arsip</th>
                  <th className="py-3 px-3 whitespace-nowrap">Kurun Waktu</th>
                  <th className="py-3 px-3">Kondisi</th>
                  <th className="py-3 px-3">Penataan</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Retensi Aktif</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Retensi Inaktif</th>
                  <th className="py-3 px-3 whitespace-nowrap">Keterangan Akhir</th>
                  <th className="py-3 px-3">Jumlah</th>
                  <th className="py-3 px-3 whitespace-nowrap">Nomor Boks</th>
                  <th className="py-3 px-3 min-w-[140px]">Keterangan</th>
                  {!isPimpinan && <th className="py-3 px-3 text-right">Edit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingData ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-slate-500">
                      Memuat data Record Center...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-slate-500">
                      Tidak ada arsip berstatus Inaktif saat ini.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a, idx) => (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-3 font-mono-tabular text-slate-600">{idx + 1}</td>
                      <td className="py-3 px-3 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                        <div>{a.kodeKlasifikasi}</div>
                        <div className="mt-1">
                          <BidangBadge bidang={a.bidang} size="xs" />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-700 leading-snug">{a.uraian}</td>
                      <td className="py-3 px-3 font-mono-tabular">{a.kurunWaktu}</td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap">{a.kondisiFisik}</td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap">{a.penataan}</td>
                      <td className="py-3 px-3 text-right font-mono-tabular">{a.retensiAktif} th</td>
                      <td className="py-3 px-3 text-right font-mono-tabular">{a.retensiInaktif} th</td>
                      <td className="py-3 px-3 text-xs">{a.keteranganAkhir}</td>
                      <td className="py-3 px-3 text-xs whitespace-nowrap">{a.jumlah}</td>
                      <td className="py-3 px-3 font-mono-tabular whitespace-nowrap">
                        {a.nomorBoks ? (
                          <span className="font-semibold text-emerald-800">{a.nomorBoks}</span>
                        ) : (
                          <span className="text-xs text-amber-700 font-medium">Belum diisi</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {a.catatanRecordCenter ||
                          (normalizeArchiveStatus(a.keterangan) ? '—' : a.keterangan) ||
                          '—'}
                      </td>
                      {!isPimpinan && (
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => openBoxEdit(a)}
                            title="Edit Cepat Nomor Boks & Keterangan"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-emerald-50 hover:border-emerald-400 text-slate-700 cursor-pointer whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Boks</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {mode === 'usul_musnah' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  {isAdmin && (
                    <th className="py-3 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        disabled={filtered.length === 0}
                        aria-label="Pilih semua arsip usul musnah"
                        className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="py-3 px-3">Nomor</th>
                  <th className="py-3 px-3 whitespace-nowrap">Kode Klasifikasi Arsip</th>
                  <th className="py-3 px-3 min-w-[220px]">Uraian Informasi Arsip</th>
                  <th className="py-3 px-3 whitespace-nowrap">Kurun Waktu</th>
                  <th className="py-3 px-3">Jumlah</th>
                  <th className="py-3 px-3 whitespace-nowrap">Tingkat Perkembangan</th>
                  <th className="py-3 px-3">Kondisi</th>
                  <th className="py-3 px-3">Penataan</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Retensi Aktif</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap">Retensi Inaktif</th>
                  <th className="py-3 px-3 whitespace-nowrap">Keterangan Akhir</th>
                  <th className="py-3 px-3 min-w-[160px]">Dasar Perhitungan Retensi</th>
                  <th className="py-3 px-3 min-w-[140px]">Keterangan Tambahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingData ? (
                  <tr>
                    <td colSpan={isAdmin ? 14 : 13} className="py-10 text-center text-slate-500">
                      Memuat data Usul Musnah...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 14 : 13} className="py-10 text-center text-slate-500">
                      Tidak ada arsip berstatus Usul Musnah saat ini.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a, idx) => {
                    const checked = selectedIds.has(a.id);
                    return (
                      <tr
                        key={a.id}
                        className={checked ? 'bg-red-50/40' : 'hover:bg-slate-50/70'}
                      >
                        {isAdmin && (
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelectRow(a.id)}
                              aria-label={`Pilih arsip ${a.uraian}`}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="py-3 px-3 font-mono-tabular text-slate-600">{idx + 1}</td>
                        <td className="py-3 px-3 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                          <div>{a.kodeKlasifikasi}</div>
                          <div className="mt-1">
                            <BidangBadge bidang={a.bidang} size="xs" />
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700 leading-snug">{a.uraian}</td>
                        <td className="py-3 px-3 font-mono-tabular">{a.kurunWaktu}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{a.jumlah}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">
                          {a.tingkatPerkembangan}
                        </td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{a.kondisiFisik}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{a.penataan}</td>
                        <td className="py-3 px-3 text-right font-mono-tabular">
                          {a.retensiAktif} th
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular">
                          {a.retensiInaktif} th
                        </td>
                        <td className="py-3 px-3 text-xs text-red-700 font-medium">
                          {a.keteranganAkhir}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">
                          {a.dasarRetensi || '—'}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">
                          {a.keterangan || '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {mode === 'arsip_statis' && (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nomor</th>
                  <th className="py-3 px-4 whitespace-nowrap">Kode Klasifikasi</th>
                  <th className="py-3 px-4 min-w-[260px]">Uraian Informasi Arsip</th>
                  <th className="py-3 px-4">Tahun</th>
                  <th className="py-3 px-4">Jumlah</th>
                  <th className="py-3 px-4">Kondisi</th>
                  <th className="py-3 px-4">Penataan</th>
                  <th className="py-3 px-4">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingData ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      Memuat data Arsip Statis...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      Tidak ada arsip berstatus Pendataan Arsip Statis saat ini.
                    </td>
                  </tr>
                ) : (
                  filtered.map((a, idx) => (
                    <tr key={a.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-tabular text-slate-600">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                        <div>{a.kodeKlasifikasi}</div>
                        <div className="mt-1">
                          <BidangBadge bidang={a.bidang} size="xs" />
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 leading-snug">{a.uraian}</td>
                      <td className="py-3 px-4 font-mono-tabular">{a.kurunWaktu}</td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">{a.jumlah}</td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">{a.kondisiFisik}</td>
                      <td className="py-3 px-4 text-xs whitespace-nowrap">{a.penataan}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{a.keterangan || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Edit Cepat Nomor Boks (Record Center) */}
      {boxModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold font-display text-slate-900">
                Edit Cepat Nomor Boks
              </h3>
              <button
                type="button"
                onClick={() => setBoxModalItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="font-mono-tabular font-semibold text-slate-900">
                {boxModalItem.kodeKlasifikasi} ({boxModalItem.kurunWaktu})
              </div>
              <div className="mt-0.5 line-clamp-2">{boxModalItem.uraian}</div>
            </div>

            <form onSubmit={(e) => void handleSaveBox(e)} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Nomor Boks</label>
                <input
                  type="text"
                  maxLength={60}
                  value={boxValue}
                  onChange={(e) => setBoxValue(e.target.value)}
                  placeholder="Contoh: B-01"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Catatan Record Center
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={ketValue}
                  onChange={(e) => setKetValue(e.target.value)}
                  placeholder="Catatan penempatan rak/boks di Record Center (status Inaktif pada Keterangan Tambahan tetap terjaga)"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBoxModalItem(null)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingBox}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer"
                >
                  {savingBox ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Penyelesaian Pemusnahan Arsip (Khusus Admin) */}
      {destroyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3 gap-3">
              <div className="space-y-0.5">
                <h3 className="text-base font-semibold font-display text-slate-900">
                  Konfirmasi Pemusnahan Arsip (Persetujuan ANRI)
                </h3>
                <p className="text-xs text-slate-500">
                  Mengubah status <strong className="text-slate-900">{selectedItems.length} berkas</strong> menjadi{' '}
                  <strong className="text-slate-900">Musnah</strong> dan mengunci baris secara Read-Only permanen.
                </p>
              </div>
              <button
                type="button"
                disabled={savingDestroy}
                onClick={() => setDestroyModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
              Data arsip tidak akan dihapus dari database, melainkan disimpan sebagai histori dan bukti hukum pada tab <strong>Arsip Dimusnahkan</strong>.
            </div>

            <form onSubmit={(e) => void handleConfirmDestroy(e)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    a. Nomor Surat Persetujuan ANRI <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={nomorSuratAnri}
                    onChange={(e) => setNomorSuratAnri(e.target.value)}
                    placeholder="Contoh: B-KN.01.02/124/ANRI/2026"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    b. Tanggal Persetujuan ANRI <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalPersetujuanAnri}
                    onChange={(e) => setTanggalPersetujuanAnri(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    d. Tanggal Pemusnahan <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tanggalPemusnahan}
                    onChange={(e) => setTanggalPemusnahan(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    c. Nomor Berita Acara Pemusnahan <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={nomorBaPemusnahan}
                    onChange={(e) => setNomorBaPemusnahan(e.target.value)}
                    placeholder="Contoh: BA-15/M.3.41/Cp.1/11/2026"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    e. Metode Pemusnahan <span className="text-red-600">*</span>
                  </label>
                  <select
                    required
                    value={metodePemusnahan}
                    onChange={(e) => setMetodePemusnahan(e.target.value as MetodePemusnahan)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {METODE_PEMUSNAHAN_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingDestroy}
                  onClick={() => setDestroyModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingDestroy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-60 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>
                    {savingDestroy
                      ? 'Menyimpan Status Musnah...'
                      : `Simpan & Kunci (${selectedItems.length} Berkas)`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
