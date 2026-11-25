import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  Search,
} from 'lucide-react';
import { BIDANG_LIST, BIDANG_MAP } from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge } from '../components/BidangBadge';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { downloadCsv } from '../lib/csv';
import {
  formatDateRangeLabel,
  getEffectiveArchiveStatus,
  matchesInputDateRange,
  normalizeArchiveStatus,
} from '../lib/lifecycle';
import { ArchiveItem, ArchiveLifecycleStatus, BidangId, JraItem } from '../types/archive';

type SifatArsipFilter = 'all' | 'substantif' | 'fasilitatif';
type StatusFilter = 'all' | ArchiveLifecycleStatus;

function resolveSifatArsip(archive: ArchiveItem, jraList: JraItem[]): 'substantif' | 'fasilitatif' {
  const full = archive.kodeKlasifikasi.trim().toUpperCase();
  const codeToken = full.split(/\s+/)[0] || full;
  const matches = jraList.filter((j) => {
    const jc = j.kodeKlasifikasi.trim().toUpperCase();
    return jc === full || jc === codeToken || full.startsWith(`${jc} `);
  });

  if (archive.bidang !== 'pembinaan') {
    if (matches.some((j) => j.bidang === archive.bidang)) {
      return 'substantif';
    }
    if (matches.some((j) => j.bidang === 'pembinaan')) {
      return 'fasilitatif';
    }
    if (matches.some((j) => j.bidang !== 'pembinaan')) {
      return 'substantif';
    }
    return codeToken.startsWith('DT') ||
      codeToken.startsWith('IN') ||
      codeToken.startsWith('PA') ||
      codeToken.startsWith('PU') ||
      codeToken.startsWith('KH') ||
      codeToken.startsWith('PDM') ||
      codeToken.startsWith('PDS') ||
      codeToken.startsWith('PB')
      ? 'substantif'
      : 'fasilitatif';
  }

  if (matches.some((j) => j.bidang === 'pembinaan')) {
    return 'fasilitatif';
  }
  if (matches.some((j) => j.bidang !== 'pembinaan')) {
    return 'substantif';
  }
  return 'fasilitatif';
}

interface JraOption {
  kode: string;
  uraian: string;
  bidangLabel: string;
  sifat: 'substantif' | 'fasilitatif';
}

export function LaporanArsipPage() {
  const { userProfile } = useAuth();
  const { archives, jraList, loadingData } = useArchiveData();
  const { showToast } = useToast();

  const isStaf = userProfile?.role === 'staf';
  const [selectedBidang, setSelectedBidang] = useState<'all' | BidangId>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sifatFilter, setSifatFilter] = useState<SifatArsipFilter>('all');
  const [selectedKode, setSelectedKode] = useState<string>('all');
  const [tahunAwal, setTahunAwal] = useState<string>('');
  const [tahunAkhir, setTahunAkhir] = useState<string>('');
  const [inputDateFrom, setInputDateFrom] = useState<string>('');
  const [inputDateTo, setInputDateTo] = useState<string>('');

  const [kodeDropdownOpen, setKodeDropdownOpen] = useState(false);
  const [kodeSearch, setKodeSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const effectiveBidang: 'all' | BidangId =
    isStaf && userProfile?.bidang ? userProfile.bidang : selectedBidang;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setKodeDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setKodeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Daftar Kode Klasifikasi JRA yang relevan untuk dropdown pencarian
  const jraOptions = useMemo<JraOption[]>(() => {
    const map = new Map<string, JraOption>();

    const relevantJra = jraList.filter((j) => {
      if (effectiveBidang === 'all') return true;
      return j.bidang === effectiveBidang || j.bidang === 'pembinaan';
    });

    for (const j of relevantJra) {
      const sifat: 'substantif' | 'fasilitatif' =
        j.bidang === 'pembinaan' ? 'fasilitatif' : 'substantif';
      if (sifatFilter !== 'all' && sifat !== sifatFilter) continue;

      const key = `${j.kodeKlasifikasi}__${j.bidang}`;
      if (!map.has(key)) {
        map.set(key, {
          kode: j.kodeKlasifikasi,
          uraian: j.uraian,
          bidangLabel: BIDANG_MAP[j.bidang]?.singkatan || j.bidang,
          sifat,
        });
      }
    }

    // Tambahkan kode dari arsip yang sudah ada apabila belum tercatat di Master JRA
    const seenCodes = new Set(Array.from(map.values()).map((o) => o.kode.toUpperCase()));
    for (const a of archives) {
      if (effectiveBidang !== 'all' && a.bidang !== effectiveBidang) continue;
      const upper = a.kodeKlasifikasi.trim().toUpperCase();
      if (!upper || seenCodes.has(upper)) continue;
      const sifat = resolveSifatArsip(a, jraList);
      if (sifatFilter !== 'all' && sifat !== sifatFilter) continue;
      seenCodes.add(upper);
      map.set(`EXTRA__${upper}`, {
        kode: a.kodeKlasifikasi,
        uraian: a.uraian || 'Kode arsip terdaftar',
        bidangLabel: BIDANG_MAP[a.bidang]?.singkatan || a.bidang,
        sifat,
      });
    }

    return Array.from(map.values()).sort((a, b) =>
      a.kode.localeCompare(b.kode, 'id', { numeric: true })
    );
  }, [jraList, archives, effectiveBidang, sifatFilter]);

  const filteredJraOptions = useMemo(() => {
    const q = kodeSearch.trim().toLowerCase();
    if (!q) return jraOptions;
    return jraOptions.filter(
      (o) =>
        o.kode.toLowerCase().includes(q) ||
        o.uraian.toLowerCase().includes(q) ||
        o.bidangLabel.toLowerCase().includes(q)
    );
  }, [jraOptions, kodeSearch]);

  // Reset selectedKode jika tidak lagi ada pada opsi terfilter
  useEffect(() => {
    if (
      selectedKode !== 'all' &&
      !jraOptions.some((o) => o.kode.toUpperCase() === selectedKode.toUpperCase())
    ) {
      setSelectedKode('all');
    }
  }, [jraOptions, selectedKode]);

  // Data arsip terfilter real-time
  const filteredRecords = useMemo(() => {
    const yearNow = new Date().getFullYear();
    const minYear = tahunAwal.trim() ? Number(tahunAwal.trim()) : null;
    const maxYear = tahunAkhir.trim() ? Number(tahunAkhir.trim()) : null;

    return archives
      .map((item) => ({
        item,
        status: getEffectiveArchiveStatus(item, yearNow),
        sifat: resolveSifatArsip(item, jraList),
      }))
      .filter(({ item, status, sifat }) => {
        if (effectiveBidang !== 'all' && item.bidang !== effectiveBidang) return false;
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (sifatFilter !== 'all' && sifat !== sifatFilter) return false;
        if (selectedKode !== 'all') {
          const itemUpper = item.kodeKlasifikasi.trim().toUpperCase();
          const selUpper = selectedKode.trim().toUpperCase();
          const itemToken = itemUpper.split(/\s+/)[0] || itemUpper;
          const selToken = selUpper.split(/\s+/)[0] || selUpper;
          if (itemUpper !== selUpper && itemToken !== selToken) {
            return false;
          }
        }
        if (minYear !== null && !Number.isNaN(minYear) && Number(item.kurunWaktu) < minYear) {
          return false;
        }
        if (maxYear !== null && !Number.isNaN(maxYear) && Number(item.kurunWaktu) > maxYear) {
          return false;
        }
        if (!matchesInputDateRange(item, inputDateFrom, inputDateTo)) {
          return false;
        }
        return true;
      });
  }, [
    archives,
    jraList,
    effectiveBidang,
    statusFilter,
    sifatFilter,
    selectedKode,
    tahunAwal,
    tahunAkhir,
    inputDateFrom,
    inputDateTo,
  ]);

  const summaryStats = useMemo(() => {
    let aktif = 0;
    let inaktif = 0;
    let usulMusnah = 0;
    let musnah = 0;
    let statis = 0;
    let substantif = 0;
    let fasilitatif = 0;

    for (const r of filteredRecords) {
      if (r.status === 'Aktif') aktif++;
      else if (r.status === 'Inaktif') inaktif++;
      else if (r.status === 'Usul Musnah') usulMusnah++;
      else if (r.status === 'Musnah') musnah++;
      else statis++;

      if (r.sifat === 'substantif') substantif++;
      else fasilitatif++;
    }

    return {
      total: filteredRecords.length,
      aktif,
      inaktif,
      usulMusnah,
      musnah,
      statis,
      substantif,
      fasilitatif,
    };
  }, [filteredRecords]);

  // Judul & subjudul dinamis laporan
  const dynamicReportMeta = useMemo(() => {
    const bidangLabel =
      effectiveBidang === 'all'
        ? 'Seluruh Bidang (6 Unit Kerja)'
        : `${BIDANG_MAP[effectiveBidang].nama} (${BIDANG_MAP[effectiveBidang].singkatan})`;

    const statusLabel =
      statusFilter === 'all'
        ? 'Semua Status Daur Hidup'
        : statusFilter === 'Aktif'
          ? 'Arsip Aktif (Central File)'
          : statusFilter === 'Inaktif'
            ? 'Arsip Inaktif (Record Center)'
            : statusFilter;

    const sifatLabel =
      sifatFilter === 'all'
        ? 'Substantif & Fasilitatif'
        : sifatFilter === 'substantif'
          ? 'Arsip Substantif'
          : 'Arsip Fasilitatif';

    const kodeLabel = selectedKode === 'all' ? 'Semua Kode JRA' : `Kode ${selectedKode}`;

    let kurunLabel = 'Semua Tahun Penciptaan';
    if (tahunAwal.trim() && tahunAkhir.trim()) {
      kurunLabel = `Kurun Waktu ${tahunAwal.trim()} s.d. ${tahunAkhir.trim()}`;
    } else if (tahunAwal.trim()) {
      kurunLabel = `Kurun Waktu Mulai Tahun ${tahunAwal.trim()}`;
    } else if (tahunAkhir.trim()) {
      kurunLabel = `Kurun Waktu s.d. Tahun ${tahunAkhir.trim()}`;
    }

    const titleParts = ['LAPORAN DAFTAR ARSIP'];
    if (statusFilter !== 'all') {
      titleParts.push(statusFilter.toUpperCase());
    }
    if (sifatFilter !== 'all') {
      titleParts.push(sifatFilter === 'substantif' ? 'SUBSTANTIF' : 'FASILITATIF');
    }
    if (effectiveBidang !== 'all') {
      titleParts.push(`BIDANG ${BIDANG_MAP[effectiveBidang].singkatan.toUpperCase()}`);
    }

    const inputPeriodeLabel = formatDateRangeLabel(inputDateFrom, inputDateTo);

    return {
      heading: titleParts.join(' — '),
      bidangLabel,
      statusLabel,
      sifatLabel,
      kodeLabel,
      kurunLabel,
      inputPeriodeLabel,
    };
  }, [effectiveBidang, statusFilter, sifatFilter, selectedKode, tahunAwal, tahunAkhir, inputDateFrom, inputDateTo]);

  const handleResetFilters = () => {
    if (!isStaf) setSelectedBidang('all');
    setStatusFilter('all');
    setSifatFilter('all');
    setSelectedKode('all');
    setKodeSearch('');
    setTahunAwal('');
    setTahunAkhir('');
    setInputDateFrom('');
    setInputDateTo('');
  };

  const buildFileSlug = () => {
    const parts = ['Laporan_Arsip'];
    parts.push(effectiveBidang === 'all' ? 'Semua_Bidang' : BIDANG_MAP[effectiveBidang].singkatan);
    if (statusFilter !== 'all') parts.push(statusFilter.replace(/\s+/g, '_'));
    if (sifatFilter !== 'all') {
      parts.push(sifatFilter === 'substantif' ? 'Substantif' : 'Fasilitatif');
    }
    if (selectedKode !== 'all') {
      const codeToken = selectedKode.trim().split(/\s+/)[0] || selectedKode.trim();
      parts.push(codeToken.replace(/[^a-zA-Z0-9._-]/g, '_'));
    }
    if (tahunAwal.trim() || tahunAkhir.trim()) {
      parts.push(`${tahunAwal.trim() || 'awal'}-${tahunAkhir.trim() || 'akhir'}`);
    }
    if (inputDateFrom || inputDateTo) {
      parts.push(`Input_${inputDateFrom || 'awal'}_sd_${inputDateTo || 'akhir'}`);
    }
    return parts.join('_');
  };

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) {
      showToast('Tidak ada data arsip yang sesuai filter untuk diekspor.', 'error');
      return;
    }

    const headers = [
      'No',
      'Bidang / Unit Kerja',
      'Nomor Berkas',
      'Nomor Item Arsip',
      'Kode Klasifikasi',
      'Sifat Arsip',
      'Uraian Informasi Arsip',
      'Kurun Waktu',
      'Tingkat Perkembangan',
      'Jumlah',
      'Filing Cabinet',
      'Laci',
      'Folder',
      'Nomor Boks',
      'Klasifikasi Keamanan',
      'Kondisi Fisik',
      'Penataan Arsip',
      'Retensi Aktif (Tahun)',
      'Retensi Inaktif (Tahun)',
      'Keterangan Akhir',
      'Status Daur Hidup',
      'Dasar Penentuan Retensi',
      'Tanggal Input',
      'Diinput Oleh',
      'Keterangan',
    ];

    const rows = filteredRecords.map(({ item, status, sifat }, index) => [
      index + 1,
      BIDANG_MAP[item.bidang]?.nama || item.bidang,
      item.nomorBerkas,
      item.nomorItem,
      item.kodeKlasifikasi,
      sifat === 'substantif' ? 'Substantif' : 'Fasilitatif',
      item.uraian,
      item.kurunWaktu,
      item.tingkatPerkembangan,
      item.jumlah,
      item.filingCabinet || '-',
      item.laci || '-',
      item.folder || '-',
      item.nomorBoks || '-',
      item.klasifikasiKeamanan,
      item.kondisiFisik,
      item.penataan,
      item.retensiAktif,
      item.retensiInaktif,
      item.keteranganAkhir,
      status,
      item.dasarRetensi || '-',
      item.tanggalInput,
      item.diinputOleh || item.createdByName || '-',
      item.keterangan || '-',
    ]);

    const filename = `${buildFileSlug()}.csv`;
    downloadCsv(filename, headers, rows);
    showToast(`Berhasil mengunduh ${filename} (${filteredRecords.length} baris).`);
  };

  const selectedJraOption = jraOptions.find(
    (o) => o.kode.toUpperCase() === selectedKode.toUpperCase()
  );

  return (
    <div className="space-y-5">
      {/* Panel Filter Multi-Kriteria & Tombol Unduhan CSV */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Filter className="w-4 h-4 text-emerald-700" />
              <span>Filter Multi-Kriteria Laporan Arsip</span>
            </div>
            <p className="text-xs text-slate-500">
              Saring daftar arsip berdasarkan unit kerja, status daur hidup, sifat klasifikasi JRA, dan kurun waktu penciptaan sebelum mengunduh file CSV.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Unduh CSV</span>
            </button>
          </div>
        </div>

        {/* Grid Kontrol Filter */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Filter Bidang */}
          <div className="space-y-1.5">
            <label htmlFor="report-filter-bidang" className="block text-xs font-semibold text-slate-700">
              1. Filter Bidang / Unit Kerja
            </label>
            <select
              id="report-filter-bidang"
              disabled={isStaf}
              value={effectiveBidang}
              onChange={(e) => setSelectedBidang(e.target.value as 'all' | BidangId)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 disabled:bg-slate-100 disabled:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700"
            >
              {!isStaf && <option value="all">Semua Bidang (6 Unit Kerja)</option>}
              {BIDANG_LIST.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.singkatan} — {b.nama}
                </option>
              ))}
            </select>
            {isStaf && (
              <p className="text-[11px] text-slate-500">
                Terkunci otomatis pada unit kerja akun Staf Bidang Anda.
              </p>
            )}
          </div>

          {/* 2A. Status Daur Hidup */}
          <div className="space-y-1.5">
            <label htmlFor="report-filter-status" className="block text-xs font-semibold text-slate-700">
              2. Status Daur Hidup Arsip
            </label>
            <select
              id="report-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700"
            >
              <option value="all">Semua Status Daur Hidup</option>
              <option value="Aktif">Aktif (Central File)</option>
              <option value="Inaktif">Inaktif (Record Center)</option>
              <option value="Usul Musnah">Usul Musnah</option>
              <option value="Musnah">Musnah (Arsip Dimusnahkan)</option>
              <option value="Pendataan Arsip Statis">Pendataan Arsip Statis</option>
            </select>
          </div>

          {/* 2B. Sifat Arsip */}
          <div className="space-y-1.5">
            <label htmlFor="report-filter-sifat" className="block text-xs font-semibold text-slate-700">
              3. Sifat Arsip (Berdasarkan JRA)
            </label>
            <select
              id="report-filter-sifat"
              value={sifatFilter}
              onChange={(e) => setSifatFilter(e.target.value as SifatArsipFilter)}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700"
            >
              <option value="all">Semua Sifat (Substantif &amp; Fasilitatif)</option>
              <option value="substantif">Substantif (Kode JRA Bidang Terkait)</option>
              <option value="fasilitatif">Fasilitatif (Kode JRA Sub Bagian Pembinaan)</option>
            </select>
          </div>

          {/* 2C. Dropdown Pencarian Kode Klasifikasi JRA Spesifik */}
          <div className="space-y-1.5 lg:col-span-2" ref={dropdownRef}>
            <label className="block text-xs font-semibold text-slate-700">
              4. Kode Klasifikasi JRA Spesifik
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setKodeDropdownOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-left text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700 cursor-pointer"
              >
                <span className="truncate">
                  {selectedKode === 'all' ? (
                    'Semua Kode Klasifikasi JRA'
                  ) : (
                    <span>
                      <span className="font-mono-tabular font-semibold">{selectedKode}</span>
                      {selectedJraOption ? ` — ${selectedJraOption.uraian}` : ''}
                    </span>
                  )}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              {kodeDropdownOpen && (
                <div className="absolute z-40 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-slate-100 bg-slate-50">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        autoFocus
                        value={kodeSearch}
                        onChange={(e) => setKodeSearch(e.target.value)}
                        placeholder="Cari kode (mis. PDM.1.1, K.2.1) atau uraian..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-700"
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKode('all');
                        setKodeDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="font-semibold text-slate-800">
                        Semua Kode Klasifikasi JRA ({jraOptions.length} kode tersedia)
                      </span>
                      {selectedKode === 'all' && <Check className="w-3.5 h-3.5 text-emerald-700" />}
                    </button>

                    {filteredJraOptions.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-500">
                        Tidak ada kode JRA yang cocok dengan pencarian &ldquo;{kodeSearch}&rdquo;.
                      </div>
                    ) : (
                      filteredJraOptions.map((opt) => {
                        const isSelected =
                          selectedKode.toUpperCase() === opt.kode.toUpperCase();
                        return (
                          <button
                            key={`${opt.kode}_${opt.bidangLabel}`}
                            type="button"
                            onClick={() => {
                              setSelectedKode(opt.kode);
                              setKodeDropdownOpen(false);
                            }}
                            className="w-full px-3 py-2 text-left text-xs flex items-start justify-between gap-2 hover:bg-slate-50 cursor-pointer"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono-tabular font-semibold text-slate-900">
                                  {opt.kode}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {opt.bidangLabel} ·{' '}
                                  {opt.sifat === 'substantif' ? 'Substantif' : 'Fasilitatif'}
                                </span>
                              </div>
                              <div className="text-slate-600 line-clamp-1">{opt.uraian}</div>
                            </div>
                            {isSelected && (
                              <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Filter Kurun Waktu */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              5. Kurun Waktu Penciptaan (Opsional)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <input
                  type="number"
                  min={1945}
                  max={2100}
                  value={tahunAwal}
                  onChange={(e) => setTahunAwal(e.target.value)}
                  placeholder="Tahun Awal"
                  aria-label="Tahun Awal"
                  className="w-full text-sm font-mono-tabular border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700"
                />
              </div>
              <div>
                <input
                  type="number"
                  min={1945}
                  max={2100}
                  value={tahunAkhir}
                  onChange={(e) => setTahunAkhir(e.target.value)}
                  placeholder="Tahun Akhir"
                  aria-label="Tahun Akhir"
                  className="w-full text-sm font-mono-tabular border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 focus:border-emerald-700"
                />
              </div>
            </div>
          </div>

          {/* 6. Rentang Tanggal Input */}
          <div className="md:col-span-2 lg:col-span-3 pt-3 border-t border-slate-100">
            <DateRangeFilter
              fromDate={inputDateFrom}
              toDate={inputDateTo}
              onChangeFrom={setInputDateFrom}
              onChangeTo={setInputDateTo}
              onChangeRange={(from, to) => {
                setInputDateFrom(from);
                setInputDateTo(to);
              }}
              label="6. Rentang Tanggal Input Data (Opsional)"
            />
          </div>
        </div>
      </section>

      {/* Ringkasan Total Berkas Real-Time (Layar) */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-slate-500">Total Hasil Filter</div>
          <div className="text-xl font-bold font-display text-emerald-800 tabular-nums mt-0.5">
            {summaryStats.total} <span className="text-xs font-normal text-slate-500">berkas</span>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Aktif</div>
          <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-0.5">
            {summaryStats.aktif}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Inaktif</div>
          <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-0.5">
            {summaryStats.inaktif}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Usul Musnah</div>
          <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-0.5">
            {summaryStats.usulMusnah}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Dimusnahkan</div>
          <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-0.5">
            {summaryStats.musnah}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Arsip Statis</div>
          <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-0.5">
            {summaryStats.statis}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Substantif</div>
          <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-0.5">
            {summaryStats.substantif}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-3">
          <div className="text-[11px] font-medium text-slate-500">Fasilitatif</div>
          <div className="text-lg font-bold font-mono-tabular text-slate-900 mt-0.5">
            {summaryStats.fasilitatif}
          </div>
        </div>
      </section>

      {/* Area Pratinjau Tabel Hasil Filter Real-Time */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-slate-900 tracking-wide">
              {dynamicReportMeta.heading}
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
              <span>Unit: {dynamicReportMeta.bidangLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Status: {dynamicReportMeta.statusLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Sifat: {dynamicReportMeta.sifatLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{dynamicReportMeta.kodeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{dynamicReportMeta.kurunLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Periode Input: {dynamicReportMeta.inputPeriodeLabel}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular shrink-0">
            Nama file ekspor: <span className="font-semibold text-slate-800">{buildFileSlug()}.csv</span>
          </div>
        </div>

        {/* Tabel Daftar Arsip Real-Time */}
        {loadingData ? (
          <div className="space-y-2 py-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-2">
            <FileDown className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-medium text-slate-700">
              Tidak ada arsip yang memenuhi kombinasi filter saat ini.
            </p>
            <p className="text-xs text-slate-500">
              Ubah pilihan bidang, status, sifat arsip, atau rentang tahun untuk menampilkan data.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-200 text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="border border-slate-200 px-2 py-2 text-center w-10">No</th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Bidang
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    No. Berkas / Item
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Kode JRA
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Sifat
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left min-w-[210px]">
                    Uraian Informasi Arsip
                  </th>
                  <th className="border border-slate-200 px-2 py-2 text-center whitespace-nowrap">
                    Tahun
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Jumlah &amp; Asli/Salinan
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Lokasi Simpan / Boks
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Retensi &amp; Akhir
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Status Daur Hidup
                  </th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left whitespace-nowrap">
                    Kondisi &amp; Keamanan
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(({ item, status, sifat }, idx) => {
                  const lokasiParts = [
                    item.filingCabinet ? `Kab. ${item.filingCabinet}` : '',
                    item.laci ? `Laci ${item.laci}` : '',
                    item.folder ? `Folder ${item.folder}` : '',
                  ].filter(Boolean);

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 align-top">
                      <td className="border border-slate-200 px-2 py-2 text-center font-mono-tabular">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 whitespace-nowrap">
                        <BidangBadge bidang={item.bidang} size="xs" />
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 font-mono-tabular whitespace-nowrap">
                        <div>Berkas: {item.nomorBerkas || '-'}</div>
                        <div className="text-[11px] text-slate-500">
                          Item: {item.nomorItem || '-'}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 font-mono-tabular font-semibold whitespace-nowrap">
                        {item.kodeKlasifikasi}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 whitespace-nowrap">
                        {sifat === 'substantif' ? 'Substantif' : 'Fasilitatif'}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 text-slate-800">
                        <div>{item.uraian}</div>
                        {(item.catatanRecordCenter ||
                          (item.keterangan && !normalizeArchiveStatus(item.keterangan))) && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Catatan: {item.catatanRecordCenter || item.keterangan}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-200 px-2 py-2 text-center font-mono-tabular">
                        {item.kurunWaktu}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 whitespace-nowrap">
                        <div className="tabular-nums">{item.jumlah}</div>
                        <div className="text-[11px] text-slate-500">{item.tingkatPerkembangan}</div>
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2">
                        <div className="font-mono-tabular font-semibold">
                          {item.nomorBoks ? `Boks ${item.nomorBoks}` : 'Belum ber-boks'}
                        </div>
                        {lokasiParts.length > 0 && (
                          <div className="text-[11px] text-slate-500">
                            {lokasiParts.join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 whitespace-nowrap font-mono-tabular">
                        <div>
                          A: {item.retensiAktif} th / I: {item.retensiInaktif} th
                        </div>
                        <div className="text-[11px] text-slate-600">
                          Akhir: {item.keteranganAkhir}
                        </div>
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 whitespace-nowrap font-medium">
                        {status}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-2 whitespace-nowrap">
                        <div>{item.kondisiFisik}</div>
                        <div className="text-[11px] text-slate-500">
                          {item.klasifikasiKeamanan} · {item.penataan}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
