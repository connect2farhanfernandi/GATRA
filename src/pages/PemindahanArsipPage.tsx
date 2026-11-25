import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckSquare,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  QrCode,
  Square,
} from 'lucide-react';
import { BIDANG_LIST, BIDANG_MAP } from '../constants/bidang';
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
import { downloadBaPemindahanDoc, downloadBaPemusnahanDoc } from '../lib/wordDoc';
import { BidangId } from '../types/archive';

type PemindahanTab = 'daftar_csv' | 'format_ba' | 'label_boks';

export function PemindahanArsipPage() {
  const { userProfile } = useAuth();
  const { archives, loadingData } = useArchiveData();
  const { showToast } = useToast();

  const isStaf = userProfile?.role === 'staf';
  const [activeTab, setActiveTab] = useState<PemindahanTab>('daftar_csv');
  const [selectedBidang, setSelectedBidang] = useState<BidangId>(
    userProfile?.bidang || 'pembinaan'
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedBox, setSelectedBox] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [downloadingDoc, setDownloadingDoc] = useState<'pemindahan' | 'pemusnahan' | null>(null);

  const effectiveBidang: BidangId =
    isStaf && userProfile?.bidang ? userProfile.bidang : selectedBidang;
  const bidangCfg = BIDANG_MAP[effectiveBidang];

  const inaktifByBidang = useMemo(() => {
    const yearNow = new Date().getFullYear();
    return archives.filter((a) => {
      if (a.bidang !== effectiveBidang) return false;
      return getEffectiveArchiveStatus(a, yearNow) === 'Inaktif';
    });
  }, [archives, effectiveBidang]);

  useEffect(() => {
    setSelectedIds(new Set(inaktifByBidang.map((a) => a.id)));
  }, [effectiveBidang, inaktifByBidang]);

  const checkedArchives = useMemo(() => {
    return inaktifByBidang.filter((a) => selectedIds.has(a.id));
  }, [inaktifByBidang, selectedIds]);

  const allSelected =
    inaktifByBidang.length > 0 && inaktifByBidang.every((a) => selectedIds.has(a.id));

  const availableBoxes = useMemo(() => {
    const boxes = new Set<string>();
    for (const a of inaktifByBidang) {
      if (a.nomorBoks && a.nomorBoks.trim() !== '') {
        boxes.add(a.nomorBoks.trim());
      }
    }
    return Array.from(boxes).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [inaktifByBidang]);

  useEffect(() => {
    if (availableBoxes.length > 0 && !availableBoxes.includes(selectedBox)) {
      setSelectedBox(availableBoxes[0]);
    } else if (availableBoxes.length === 0) {
      setSelectedBox('');
    }
  }, [availableBoxes, selectedBox]);

  const boxItems = useMemo(() => {
    if (!selectedBox) return [];
    return inaktifByBidang.filter((a) => a.nomorBoks.trim() === selectedBox);
  }, [inaktifByBidang, selectedBox]);

  const boxYearRange = useMemo(() => {
    if (boxItems.length === 0) return '—';
    const years = boxItems.map((a) => Number(a.kurunWaktu));
    const minY = Math.min(...years);
    const maxY = Math.max(...years);
    return minY === maxY ? String(minY) : `${minY} - ${maxY}`;
  }, [boxItems]);

  useEffect(() => {
    if (!selectedBox || boxItems.length === 0) {
      setQrDataUrl('');
      return;
    }
    const summaryLines = boxItems
      .slice(0, 12)
      .map((item, idx) => `${idx + 1}. [${item.kodeKlasifikasi}] ${item.uraian.slice(0, 55)}`);
    const payload = [
      `${bidangCfg.singkatan.toUpperCase()} KEJARI GROBOGAN`,
      `Boks: ${selectedBox}`,
      `Tahun: ${boxYearRange}`,
      `Jumlah Berkas: ${boxItems.length}`,
      'Isi:',
      ...summaryLines,
    ].join('\n');

    QRCode.toDataURL(payload, {
      width: 180,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [selectedBox, boxItems, bidangCfg.singkatan, boxYearRange]);

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(inaktifByBidang.map((a) => a.id)));
    }
  };

  const handleDownloadCsv = () => {
    if (checkedArchives.length === 0) {
      showToast('Pilih minimal 1 berkas arsip Inaktif untuk diunduh.', 'error');
      return;
    }

    const filename = `Daftar_Arsip_Dipindahkan_${bidangCfg.singkatan}_${todayIsoDate()}.csv`;
    const headers = [
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
    ];

    const rows = checkedArchives.map((a, idx) => [
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
      a.nomorBoks || '',
      a.catatanRecordCenter || (normalizeArchiveStatus(a.keterangan) ? '' : a.keterangan),
    ]);

    downloadCsv(filename, headers, rows);
    showToast(`Berhasil mengunduh ${checkedArchives.length} berkas ke ${filename}.`);
  };

  const handleDownloadWord = async (type: 'pemindahan' | 'pemusnahan') => {
    setDownloadingDoc(type);
    try {
      if (type === 'pemindahan') {
        await downloadBaPemindahanDoc();
        showToast('Format BA Pemindahan Arsip (.doc) berhasil diunduh.');
      } else {
        await downloadBaPemusnahanDoc();
        showToast('Format BA Pemusnahan Arsip (.doc) berhasil diunduh.');
      }
    } catch {
      showToast('Gagal membuat file templat Word (.doc).', 'error');
    } finally {
      setDownloadingDoc(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Navigasi 3 Tab */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold font-display text-slate-900">
              Pemindahan Arsip &amp; Format Berita Acara
            </h2>
            <p className="text-xs text-slate-500">
              Ekspor daftar arsip Inaktif (12 kolom Record Center), unduh templat Berita Acara (.doc) siap edit, dan cetak label boks arsip.
            </p>
          </div>

          {activeTab === 'label_boks' && (
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!selectedBox || boxItems.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap self-start lg:self-auto"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / Simpan PDF (A4)</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setActiveTab('daftar_csv')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'daftar_csv'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Daftar Arsip Dipindahkan (CSV)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('format_ba')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'format_ba'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Unduh Format BA (.doc)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('label_boks')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'label_boks'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>Label Boks Arsip</span>
          </button>
        </div>

        {/* Kontrol Pilih Bidang (Tab 1 & Tab 3) */}
        {(activeTab === 'daftar_csv' || activeTab === 'label_boks') && (
          <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label htmlFor="pemindahan-bidang" className="text-xs font-medium text-slate-700">
                  Pilih Bidang:
                </label>
                <select
                  id="pemindahan-bidang"
                  disabled={isStaf}
                  value={effectiveBidang}
                  onChange={(e) => setSelectedBidang(e.target.value as BidangId)}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white disabled:bg-slate-100 disabled:text-slate-600"
                >
                  {BIDANG_LIST.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.singkatan} — {b.nama}
                    </option>
                  ))}
                </select>
                {isStaf && (
                  <span className="text-[11px] text-slate-500">
                    (Terkunci sesuai bidang Anda)
                  </span>
                )}
              </div>

              {activeTab === 'label_boks' && (
                <div className="flex items-center gap-2">
                  <label htmlFor="pemindahan-boks" className="text-xs font-medium text-slate-700">
                    Nomor Boks (Record Center):
                  </label>
                  <select
                    id="pemindahan-boks"
                    value={selectedBox}
                    onChange={(e) => setSelectedBox(e.target.value)}
                    className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white font-mono-tabular"
                  >
                    {availableBoxes.length === 0 ? (
                      <option value="">Belum ada Nomor Boks terisi</option>
                    ) : (
                      availableBoxes.map((box) => (
                        <option key={box} value={box}>
                          Boks {box}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}
            </div>

            {activeTab === 'daftar_csv' && (
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                  Terpilih:{' '}
                  <strong className="font-mono-tabular text-emerald-800">
                    {checkedArchives.length}
                  </strong>{' '}
                  dari <span className="font-mono-tabular">{inaktifByBidang.length}</span> berkas Inaktif
                </div>

                <button
                  type="button"
                  onClick={toggleAll}
                  disabled={inaktifByBidang.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {allSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>{allSelected ? 'Batal Pilih Semua' : 'Pilih Semua'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  disabled={checkedArchives.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Daftar Arsip Dipindahkan (CSV)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: Daftar Arsip Dipindahkan (CSV) - 12 Kolom Baku Record Center */}
      {activeTab === 'daftar_csv' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BidangBadge bidang={effectiveBidang} size="xs" />
              <span className="text-xs font-medium text-slate-700">
                Daftar Arsip Status Inaktif — 12 Kolom Baku Record Center
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Centang berkas yang akan dipindahkan sebelum mengunduh CSV.
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={inaktifByBidang.length === 0}
                      aria-label="Pilih semua arsip Inaktif"
                      className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                    />
                  </th>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingData ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-slate-500 text-xs">
                      Memuat daftar arsip Inaktif...
                    </td>
                  </tr>
                ) : inaktifByBidang.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-10 text-center text-slate-500 text-xs">
                      Belum ada arsip berstatus Inaktif untuk {bidangCfg.nama}.
                    </td>
                  </tr>
                ) : (
                  inaktifByBidang.map((a, idx) => {
                    const checked = selectedIds.has(a.id);
                    const ketText =
                      a.catatanRecordCenter ||
                      (normalizeArchiveStatus(a.keterangan) ? '' : a.keterangan) ||
                      '—';
                    return (
                      <tr
                        key={a.id}
                        onClick={() => toggleItem(a.id)}
                        className={`cursor-pointer transition-colors ${
                          checked ? 'bg-emerald-50/40' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td
                          className="py-3 px-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(a.id)}
                            aria-label={`Pilih ${a.uraian}`}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-slate-600">{idx + 1}</td>
                        <td className="py-3 px-3 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                          {a.kodeKlasifikasi}
                        </td>
                        <td className="py-3 px-3 text-slate-700 leading-snug">{a.uraian}</td>
                        <td className="py-3 px-3 font-mono-tabular">{a.kurunWaktu}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{a.kondisiFisik}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{a.penataan}</td>
                        <td className="py-3 px-3 text-right font-mono-tabular whitespace-nowrap">
                          {a.retensiAktif} th
                        </td>
                        <td className="py-3 px-3 text-right font-mono-tabular whitespace-nowrap">
                          {a.retensiInaktif} th
                        </td>
                        <td className="py-3 px-3 text-xs">{a.keteranganAkhir}</td>
                        <td className="py-3 px-3 text-xs whitespace-nowrap">{a.jumlah}</td>
                        <td className="py-3 px-3 font-mono-tabular whitespace-nowrap">
                          {a.nomorBoks ? (
                            <span className="font-semibold text-emerald-800">{a.nomorBoks}</span>
                          ) : (
                            <span className="text-xs text-amber-700">Belum diisi</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">{ketText}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Unduh Format BA (.doc) */}
      {activeTab === 'format_ba' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold font-display text-slate-900">
                      Berita Acara Pemindahan Arsip (.doc)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Templat dokumen Word siap edit untuk pemindahan arsip Inaktif dari Central File (Unit Pengolah) ke Record Center (Sub Bagian Pembinaan).
                    </p>
                  </div>
                </div>

                <ul className="text-xs text-slate-600 space-y-1.5 pl-4 list-disc">
                  <li>Kop Surat resmi Kejaksaan Negeri Grobogan (Jl. Bhayangkara No. 02, Purwodadi 58111).</li>
                  <li>Blanko isian titik-titik (Nomor BA, tanggal, identitas Pihak Pertama &amp; Pihak Kedua, jumlah berkas/boks).</li>
                  <li>Tabel tanda tangan 2×2 (Pihak Pertama, Pihak Kedua, Saksi I, Saksi II).</li>
                  <li>Halaman lampiran terpisah berisi tabel kosong 12 kolom baku Record Center.</li>
                </ul>
              </div>

              <button
                type="button"
                disabled={downloadingDoc !== null}
                onClick={() => void handleDownloadWord('pemindahan')}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadingDoc === 'pemindahan'
                    ? 'Menyiapkan Dokumen...'
                    : 'Unduh Format BA Pemindahan Arsip (.doc)'}
                </span>
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-5">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-lg bg-red-50 text-red-700 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold font-display text-slate-900">
                      Berita Acara Pemusnahan Arsip (.doc)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Templat dokumen Word siap edit untuk pelaksanaan pemusnahan arsip yang telah memperoleh Surat Persetujuan Kepala ANRI.
                    </p>
                  </div>
                </div>

                <ul className="text-xs text-slate-600 space-y-1.5 pl-4 list-disc">
                  <li>Kop Surat resmi Kejaksaan Negeri Grobogan (Jl. Bhayangkara No. 02, Purwodadi 58111).</li>
                  <li>Blanko isian titik-titik (Nomor BA, Nomor &amp; Tanggal Surat ANRI, metode pemusnahan, identitas penandatangan).</li>
                  <li>Tabel tanda tangan 2×2 (Pihak Pertama, Pihak Kedua, Saksi I, Saksi II).</li>
                  <li>Halaman lampiran terpisah berisi tabel kosong 12 kolom baku siap diisi daftar arsip musnah.</li>
                </ul>
              </div>

              <button
                type="button"
                disabled={downloadingDoc !== null}
                onClick={() => void handleDownloadWord('pemusnahan')}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-white disabled:opacity-60 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>
                  {downloadingDoc === 'pemusnahan'
                    ? 'Menyiapkan Dokumen...'
                    : 'Unduh Format BA Pemusnahan Arsip (.doc)'}
                </span>
              </button>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-900">Panduan Penggunaan:</strong> Unduh daftar arsip berstatus Inaktif dalam format CSV pada tab pertama, lalu buka templat <span className="font-mono-tabular font-semibold">.doc</span> menggunakan Microsoft Word atau LibreOffice Writer untuk melengkapi blanko berita acara dan menempelkan daftar arsip ke tabel lampiran 12 kolom sebelum ditandatangani. Dokumen yang telah disahkan dapat diarsipkan pada menu <strong className="text-slate-900">Manajemen Dokumen</strong>.
          </div>
        </div>
      )}

      {/* TAB 3: Generator Label Boks Arsip */}
      {activeTab === 'label_boks' && (
        <div className="print-only-area max-w-[190mm] mx-auto">
          {!selectedBox || boxItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Belum ada arsip Record Center dengan Nomor Boks untuk {bidangCfg.nama}. Isi Nomor Boks pada menu Record Center terlebih dahulu.
            </div>
          ) : (
            <div
              className="rounded-lg overflow-hidden shadow-sm"
              style={{
                backgroundColor: bidangCfg.bgHex,
                color: bidangCfg.textHex,
                border: bidangCfg.needsDarkBorder
                  ? '3px solid #0F172A'
                  : `3px solid ${bidangCfg.borderHex}`,
              }}
            >
              <div
                className="py-4 px-6 text-center font-display font-extrabold text-2xl sm:text-3xl tracking-wide border-b-2"
                style={{
                  borderColor: bidangCfg.needsDarkBorder ? '#0F172A' : 'rgba(255,255,255,0.35)',
                }}
              >
                {bidangCfg.singkatan.toUpperCase()} KEJARI GROBOGAN
              </div>

              <div className="grid grid-cols-12 min-h-[260px] bg-white text-slate-900">
                <div className="col-span-8 p-6 space-y-3 border-r-2 border-slate-900">
                  <div className="text-base font-bold font-mono-tabular">
                    Tahun : {boxYearRange}
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-base font-bold">Isi :</div>
                    <ul className="list-disc pl-5 space-y-1 text-sm leading-snug">
                      {boxItems.map((item) => (
                        <li key={item.id}>
                          <span className="font-mono-tabular font-semibold">
                            [{item.kodeKlasifikasi}]
                          </span>{' '}
                          {item.uraian}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="col-span-4 p-5 flex flex-col items-center justify-between text-center gap-4">
                  <div className="text-xl sm:text-2xl font-extrabold font-mono-tabular text-slate-900">
                    Boks : {selectedBox}
                  </div>
                  {qrDataUrl && (
                    <div className="p-2 border border-slate-300 rounded bg-white">
                      <img
                        src={qrDataUrl}
                        alt={`QR Code Boks ${selectedBox}`}
                        className="w-36 h-36 object-contain"
                      />
                    </div>
                  )}
                  <div className="text-[11px] font-medium text-slate-500 font-mono-tabular">
                    {boxItems.length} Berkas Arsip
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
