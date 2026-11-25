import { useMemo, useState } from 'react';
import {
  ArchiveX,
  Download,
  Lock,
  Printer,
  Search,
  Shield,
  X,
} from 'lucide-react';
import { BIDANG_LIST, BIDANG_MAP, DEFAULT_EMBLEM_URL, OFFICIAL_KOP_SURAT } from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge } from '../components/BidangBadge';
import { downloadCsv } from '../lib/csv';
import { formatIndonesianDate, getEffectiveArchiveStatus } from '../lib/lifecycle';
import { BidangId } from '../types/archive';

function formatTanggalDisplay(raw?: string): string {
  const val = (raw || '').trim();
  if (!val) return '—';
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const parsed = new Date(year, month, day);
    if (!Number.isNaN(parsed.getTime())) {
      return formatIndonesianDate(parsed);
    }
  }
  return val;
}

export function ArsipDimusnahkanPage() {
  const { userProfile } = useAuth();
  const { archives, loadingData } = useArchiveData();
  const { showToast } = useToast();

  const isStaf = userProfile?.role === 'staf';

  const [search, setSearch] = useState('');
  const [filterBidang, setFilterBidang] = useState<'all' | BidangId>('all');
  const [filterBa, setFilterBa] = useState<string>('all');
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const destroyedAll = useMemo(() => {
    const yearNow = new Date().getFullYear();
    return archives.filter((item) => getEffectiveArchiveStatus(item, yearNow) === 'Musnah');
  }, [archives]);

  const scopedByBidang = useMemo(() => {
    return destroyedAll.filter((item) => {
      if (!isStaf && filterBidang !== 'all' && item.bidang !== filterBidang) return false;
      return true;
    });
  }, [destroyedAll, filterBidang, isStaf]);

  const availableBaNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const item of scopedByBidang) {
      const ba = (item.nomorBaPemusnahan || '').trim();
      if (ba) set.add(ba);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
  }, [scopedByBidang]);

  const effectiveBaFilter =
    filterBa !== 'all' && availableBaNumbers.includes(filterBa) ? filterBa : 'all';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedByBidang.filter((item) => {
      if (
        effectiveBaFilter !== 'all' &&
        (item.nomorBaPemusnahan || '').trim() !== effectiveBaFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.kodeKlasifikasi.toLowerCase().includes(q) ||
        item.uraian.toLowerCase().includes(q) ||
        String(item.kurunWaktu).includes(q) ||
        (item.nomorSuratAnri || '').toLowerCase().includes(q) ||
        (item.nomorBaPemusnahan || '').toLowerCase().includes(q) ||
        (item.metodePemusnahan || '').toLowerCase().includes(q)
      );
    });
  }, [scopedByBidang, effectiveBaFilter, search]);

  const draftMeta = useMemo(() => {
    const uniqueBa = Array.from(
      new Set(filtered.map((a) => (a.nomorBaPemusnahan || '').trim()).filter(Boolean))
    );
    const uniqueAnri = Array.from(
      new Set(filtered.map((a) => (a.nomorSuratAnri || '').trim()).filter(Boolean))
    );
    const uniqueAnriDates = Array.from(
      new Set(filtered.map((a) => formatTanggalDisplay(a.tanggalPersetujuanAnri)).filter((v) => v !== '—'))
    );
    const uniqueDestroyDates = Array.from(
      new Set(filtered.map((a) => formatTanggalDisplay(a.tanggalPemusnahan)).filter((v) => v !== '—'))
    );
    const uniqueMethods = Array.from(
      new Set(filtered.map((a) => (a.metodePemusnahan || '').trim()).filter(Boolean))
    );

    const bidangLabel =
      isStaf && userProfile?.bidang
        ? BIDANG_MAP[userProfile.bidang]?.nama || 'Unit Kerja'
        : filterBidang === 'all'
          ? 'Seluruh Bidang Kejaksaan Negeri Grobogan'
          : BIDANG_MAP[filterBidang].nama;

    return {
      nomorBa:
        effectiveBaFilter !== 'all'
          ? effectiveBaFilter
          : uniqueBa.length === 1
            ? uniqueBa[0]
            : uniqueBa.length > 1
              ? uniqueBa.join(', ')
              : '........................................',
      nomorAnri:
        uniqueAnri.length > 0 ? uniqueAnri.join(', ') : '........................................',
      tanggalAnri:
        uniqueAnriDates.length > 0
          ? uniqueAnriDates.join(', ')
          : '................................',
      tanggalPemusnahan:
        uniqueDestroyDates.length === 1
          ? uniqueDestroyDates[0]
          : uniqueDestroyDates.length > 1
            ? uniqueDestroyDates.join(', ')
            : '................................',
      metode:
        uniqueMethods.length > 0 ? uniqueMethods.join(', ') : 'Pencacahan / Peleburan',
      bidangLabel,
    };
  }, [effectiveBaFilter, filterBidang, filtered, isStaf, userProfile]);

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      showToast('Tidak ada data arsip dimusnahkan untuk diekspor.', 'error');
      return;
    }

    const headers = [
      'Nomor',
      'Bidang',
      'Kode Klasifikasi Arsip',
      'Uraian Informasi Arsip',
      'Kurun Waktu',
      'Jumlah',
      'Nomor Persetujuan ANRI',
      'Tanggal Persetujuan ANRI',
      'Nomor BA Pemusnahan',
      'Tanggal Pemusnahan',
      'Metode Pemusnahan',
    ];

    const rows = filtered.map((a, idx) => [
      idx + 1,
      BIDANG_MAP[a.bidang]?.nama || a.bidang,
      a.kodeKlasifikasi,
      a.uraian,
      a.kurunWaktu,
      a.jumlah,
      a.nomorSuratAnri || '',
      formatTanggalDisplay(a.tanggalPersetujuanAnri),
      a.nomorBaPemusnahan || '',
      formatTanggalDisplay(a.tanggalPemusnahan),
      a.metodePemusnahan || '',
    ]);

    const slugParts = ['Arsip_Dimusnahkan'];
    if (!isStaf && filterBidang !== 'all') {
      slugParts.push(BIDANG_MAP[filterBidang].singkatan);
    }
    if (effectiveBaFilter !== 'all') {
      slugParts.push(effectiveBaFilter.replace(/[^a-zA-Z0-9._-]/g, '_'));
    }
    const filename = `${slugParts.join('_')}.csv`;

    downloadCsv(filename, headers, rows);
    showToast(`Berhasil mengekspor ${filtered.length} arsip dimusnahkan ke ${filename}.`);
  };

  const logoSrc = DEFAULT_EMBLEM_URL;

  return (
    <div className="space-y-5">
      <div className={printModalOpen ? 'no-print space-y-5' : 'space-y-5'}>
        {/* Header Ringkasan & Tombol Aksi */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold font-display text-slate-900">
                Arsip Dimusnahkan (Histori &amp; Bukti Hukum)
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-900 text-white">
                <Lock className="w-3 h-3" />
                <span>Read-Only Permanen</span>
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Daftar arsip yang telah resmi dimusnahkan dengan persetujuan ANRI. Data tetap disimpan permanen sebagai bukti legalitas penyusutan arsip.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-auto">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV ({filtered.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setPrintModalOpen(true)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Draf BA Pemusnahan</span>
            </button>
          </div>
        </div>

        {/* Panel Filter */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari kode, uraian, nomor surat ANRI, atau nomor BA..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!isStaf && (
              <div className="flex items-center gap-2">
                <label
                  htmlFor="musnah-filter-bidang"
                  className="text-xs font-medium text-slate-600 whitespace-nowrap"
                >
                  Bidang:
                </label>
                <select
                  id="musnah-filter-bidang"
                  value={filterBidang}
                  onChange={(e) => {
                    setFilterBidang(e.target.value as 'all' | BidangId);
                    setFilterBa('all');
                  }}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
                >
                  <option value="all">Semua Bidang ({destroyedAll.length})</option>
                  {BIDANG_LIST.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.singkatan}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <label
                htmlFor="musnah-filter-ba"
                className="text-xs font-medium text-slate-600 whitespace-nowrap"
              >
                Nomor BA Pemusnahan:
              </label>
              <select
                id="musnah-filter-ba"
                value={effectiveBaFilter}
                onChange={(e) => setFilterBa(e.target.value)}
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white font-mono-tabular max-w-[260px]"
              >
                <option value="all">Semua Nomor BA ({availableBaNumbers.length})</option>
                {availableBaNumbers.map((ba) => (
                  <option key={ba} value={ba}>
                    {ba}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tabel Histori Arsip Dimusnahkan */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-3.5">Nomor</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Kode Klasifikasi Arsip</th>
                  <th className="py-3 px-3.5 min-w-[240px]">Uraian Informasi Arsip</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Kurun Waktu</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Jumlah</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">
                    Nomor &amp; Tanggal Persetujuan ANRI
                  </th>
                  <th className="py-3 px-3.5 whitespace-nowrap">
                    Nomor &amp; Tanggal BA Pemusnahan
                  </th>
                  <th className="py-3 px-3.5 whitespace-nowrap">Metode Pemusnahan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingData ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-500">
                      Memuat histori arsip dimusnahkan...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2 max-w-md mx-auto">
                        <ArchiveX className="w-8 h-8 text-slate-300" />
                        <p className="text-sm font-medium text-slate-700">
                          Belum ada arsip berstatus Musnah pada filter ini.
                        </p>
                        <p className="text-xs text-slate-500">
                          Arsip yang telah disetujui ANRI dan ditandai sudah dimusnahkan melalui tab Usul Musnah akan tercatat di sini.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((a, idx) => (
                    <tr key={a.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-3 px-3.5 font-mono-tabular text-slate-600">{idx + 1}</td>
                      <td className="py-3 px-3.5 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                        <div>{a.kodeKlasifikasi || '—'}</div>
                        <div className="mt-1">
                          <BidangBadge bidang={a.bidang} size="xs" />
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-slate-800 leading-snug">{a.uraian}</td>
                      <td className="py-3 px-3.5 font-mono-tabular text-slate-800 whitespace-nowrap">
                        {a.kurunWaktu}
                      </td>
                      <td className="py-3 px-3.5 text-xs text-slate-700 whitespace-nowrap">
                        {a.jumlah}
                      </td>
                      <td className="py-3 px-3.5 text-xs whitespace-nowrap">
                        <div className="font-mono-tabular font-semibold text-slate-900">
                          {a.nomorSuratAnri || '—'}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          Tgl: {formatTanggalDisplay(a.tanggalPersetujuanAnri)}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-xs whitespace-nowrap">
                        <div className="font-mono-tabular font-semibold text-slate-900">
                          {a.nomorBaPemusnahan || '—'}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          Tgl: {formatTanggalDisplay(a.tanggalPemusnahan)}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-xs whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                          {a.metodePemusnahan || '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Pratinjau & Cetak Draf Berita Acara Pemusnahan Arsip */}
      {printModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 print:static print:bg-transparent print:p-0 print:block">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden shadow-xl print:max-h-none print:overflow-visible print:border-0 print:shadow-none print:rounded-none">
            {/* Toolbar Cetak (Non-Print) */}
            <div className="no-print px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
              <div className="min-w-0">
                <h3 className="text-sm font-bold font-display text-slate-900 truncate">
                  Pratinjau Cetak Draf Berita Acara Pemusnahan Arsip
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  Format Tata Naskah Dinas Kejaksaan Negeri Grobogan ({filtered.length} berkas arsip terlampir)
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / Simpan PDF (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrintModalOpen(false)}
                  aria-label="Tutup pratinjau cetak"
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Area Dokumen Cetak A4 */}
            <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-8 print:p-0 print:bg-white print:overflow-visible">
              <div className="print-only-area bg-white border border-slate-200 rounded-lg p-8 sm:p-12 max-w-[210mm] mx-auto text-black font-dinas shadow-sm">
                {/* Kop Surat Resmi Kejaksaan Negeri Grobogan */}
                <div className="flex items-center gap-5 pb-3 border-b-[3px] border-double border-black">
                  <div className="w-20 h-20 shrink-0 flex items-center justify-center">
                    {logoError ? (
                      <div className="w-16 h-16 border border-black flex items-center justify-center">
                        <Shield className="w-8 h-8" />
                      </div>
                    ) : (
                      <img
                        src={logoSrc}
                        alt="Logo Kejaksaan Republik Indonesia"
                        referrerPolicy="no-referrer"
                        onError={() => setLogoError(true)}
                        className="w-20 h-20 object-contain"
                      />
                    )}
                  </div>
                  <div className="flex-1 text-center leading-tight space-y-0.5">
                    <div className="text-[14pt] font-bold tracking-wide">
                      {OFFICIAL_KOP_SURAT.namaKejaksaanRI}
                    </div>
                    <div className="text-[13pt] font-bold">{OFFICIAL_KOP_SURAT.namaKejati}</div>
                    <div className="text-[15pt] font-bold">{OFFICIAL_KOP_SURAT.namaInstansi}</div>
                    <div className="text-[9.5pt]">{OFFICIAL_KOP_SURAT.alamat}</div>
                    <div className="text-[9.5pt]">{OFFICIAL_KOP_SURAT.teleponFaxWebsite}</div>
                  </div>
                </div>

                {/* Judul Berita Acara */}
                <div className="text-center mt-6 mb-5 space-y-1">
                  <div className="text-[13pt] font-bold underline underline-offset-4">
                    BERITA ACARA PEMUSNAHAN ARSIP
                  </div>
                  <div className="text-[11pt]">Nomor : {draftMeta.nomorBa}</div>
                </div>

                {/* Isi Tata Naskah Dinas */}
                <div className="text-[11pt] leading-[1.65] space-y-4 text-justify">
                  <p>
                    Pada hari ini ........ tanggal <strong>{draftMeta.tanggalPemusnahan}</strong>, bertempat di Kantor{' '}
                    <strong>{OFFICIAL_KOP_SURAT.namaInstansi}</strong>, kami yang bertanda tangan di bawah ini berdasarkan Surat Persetujuan Kepala Arsip Nasional Republik Indonesia (ANRI) Nomor{' '}
                    <strong>{draftMeta.nomorAnri}</strong> tanggal{' '}
                    <strong>{draftMeta.tanggalAnri}</strong>, telah melaksanakan pemusnahan arsip yang telah habis masa retensi inaktifnya dan tidak memiliki nilai guna lagi pada{' '}
                    <strong>{draftMeta.bidangLabel}</strong>.
                  </p>

                  <p>
                    Pemusnahan arsip sebagaimana tercantum dalam Daftar Pertelaan Arsip Terlampir dilaksanakan sebanyak{' '}
                    <strong>{filtered.length}</strong> berkas dengan metode pemusnahan:{' '}
                    <strong>{draftMeta.metode}</strong> sehingga tidak dapat dikenali baik isi maupun bentuk fisiknya.
                  </p>

                  <table className="w-full text-[11pt] leading-[1.6]">
                    <tbody>
                      <tr>
                        <td className="w-56 align-top">Jumlah Arsip Dimusnahkan</td>
                        <td className="w-4 align-top">:</td>
                        <td>{filtered.length} Berkas</td>
                      </tr>
                      <tr>
                        <td className="align-top">Nomor Persetujuan ANRI</td>
                        <td className="align-top">:</td>
                        <td>
                          {draftMeta.nomorAnri} (Tanggal: {draftMeta.tanggalAnri})
                        </td>
                      </tr>
                      <tr>
                        <td className="align-top">Metode Pemusnahan</td>
                        <td className="align-top">:</td>
                        <td>{draftMeta.metode}</td>
                      </tr>
                      <tr>
                        <td className="align-top">Tanggal Pelaksanaan</td>
                        <td className="align-top">:</td>
                        <td>{draftMeta.tanggalPemusnahan}</td>
                      </tr>
                    </tbody>
                  </table>

                  <p>
                    Demikian Berita Acara Pemusnahan Arsip ini dibuat dengan sesungguhnya dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya serta sebagai bukti pertanggungjawaban hukum penyusutan arsip di lingkungan{' '}
                    {OFFICIAL_KOP_SURAT.namaInstansi}.
                  </p>
                </div>

                {/* Blok Penandatangan Tata Naskah Dinas */}
                <div className="mt-10 grid grid-cols-2 gap-y-12 gap-x-8 text-center text-[11pt] leading-snug">
                  <div>
                    <div className="font-bold">KETUA PANITIA PENILAI ARSIP</div>
                    <div className="min-h-[2.4em]">Kepala Sub Bagian Pembinaan</div>
                    <div className="mt-16">........................................</div>
                    <div>NIP. ...................................</div>
                  </div>

                  <div>
                    <div className="font-bold">PERWAKILAN UNIT PENGOLAH</div>
                    <div className="min-h-[2.4em]">Arsiparis / Pengelola Arsip</div>
                    <div className="mt-16">........................................</div>
                    <div>NIP. ...................................</div>
                  </div>

                  <div>
                    <div className="font-bold">SAKSI PERTAMA</div>
                    <div className="min-h-[2em]">Unsur Pengawasan / Pembinaan</div>
                    <div className="mt-16">........................................</div>
                    <div>NIP. ...................................</div>
                  </div>

                  <div>
                    <div className="font-bold">SAKSI KEDUA</div>
                    <div className="min-h-[2em]">Unsur Unit Kearsipan</div>
                    <div className="mt-16">........................................</div>
                    <div>NIP. ...................................</div>
                  </div>
                </div>

                <div className="mt-10 text-center text-[11pt] leading-snug">
                  <div>Mengetahui,</div>
                  <div className="font-bold">KEPALA {OFFICIAL_KOP_SURAT.namaInstansi}</div>
                  <div className="mt-16">........................................</div>
                  <div>NIP. ...................................</div>
                </div>

                {/* Halaman Lampiran Daftar Pertelaan */}
                <div className="print-page-break mt-14 pt-8 border-t border-dashed border-slate-300 print:border-0 print:mt-0 print:pt-0">
                  <div className="text-center mb-4 space-y-1">
                    <div className="text-[12pt] font-bold">
                      LAMPIRAN BERITA ACARA PEMUSNAHAN ARSIP
                    </div>
                    <div className="text-[11pt]">Nomor : {draftMeta.nomorBa}</div>
                    <div className="text-[10.5pt] font-semibold">
                      Cakupan : {draftMeta.bidangLabel}
                    </div>
                  </div>

                  <table className="w-full border-collapse border border-black text-[9pt]">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-black p-1.5 text-center w-10">No</th>
                        <th className="border border-black p-1.5 text-left">Bidang</th>
                        <th className="border border-black p-1.5 text-left">
                          Kode Klasifikasi Arsip
                        </th>
                        <th className="border border-black p-1.5 text-left">
                          Uraian Informasi Arsip
                        </th>
                        <th className="border border-black p-1.5 text-center">Kurun Waktu</th>
                        <th className="border border-black p-1.5 text-center">Jumlah</th>
                        <th className="border border-black p-1.5 text-left">
                          Persetujuan ANRI
                        </th>
                        <th className="border border-black p-1.5 text-left">Metode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a, idx) => (
                        <tr key={a.id}>
                          <td className="border border-black p-1.5 text-center">{idx + 1}</td>
                          <td className="border border-black p-1.5">
                            {BIDANG_MAP[a.bidang]?.singkatan || a.bidang}
                          </td>
                          <td className="border border-black p-1.5">{a.kodeKlasifikasi || '-'}</td>
                          <td className="border border-black p-1.5">{a.uraian}</td>
                          <td className="border border-black p-1.5 text-center">{a.kurunWaktu}</td>
                          <td className="border border-black p-1.5 text-center">{a.jumlah}</td>
                          <td className="border border-black p-1.5">
                            {a.nomorSuratAnri || '-'} ({formatTanggalDisplay(a.tanggalPersetujuanAnri)})
                          </td>
                          <td className="border border-black p-1.5">
                            {a.metodePemusnahan || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
