import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveX,
  ArrowRight,
  BellRing,
  Clock,
  Eye,
  FileCheck2,
  FolderOpen,
  ImageDown,
  Landmark,
  Layers,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  BIDANG_LIST,
  BIDANG_MAP,
  DEFAULT_EMBLEM_URL,
  GATRA_LOGO_URL,
} from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import {
  computeLoanStatus,
  formatDateRangeLabel,
  formatIndonesianDate,
  formatRemainingRetention,
  getEffectiveArchiveStatus,
  getInaktifRetentionAlerts,
  getLoanOverdueDays,
  isSafeHttpUrl,
  matchesInputDateRange,
} from '../lib/lifecycle';
import {
  canvasToPngBlob,
  InfographicSnapshot,
  renderInfographicToCanvas,
  triggerBlobDownload,
} from '../lib/infographicCanvas';
import { BidangBadge } from '../components/BidangBadge';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { NavPage } from '../components/SidebarLayout';
import { ArchiveLifecycleStatus, BidangId } from '../types/archive';

const STATUS_COLORS: Record<ArchiveLifecycleStatus, string> = {
  Aktif: '#16A34A',
  Inaktif: '#D97706',
  'Usul Musnah': '#DC2626',
  Musnah: '#0F172A',
  'Pendataan Arsip Statis': '#334155',
};

export function DashboardPage({ onNavigate }: { onNavigate: (page: NavPage) => void }) {
  const { userProfile } = useAuth();
  const { archives, vitalArchives, loans, satkerStats, loadingData } = useArchiveData();
  const { showToast } = useToast();

  const isStaf = userProfile?.role === 'staf';
  const [filterBidang, setFilterBidang] = useState<'all' | BidangId>(
    isStaf && userProfile?.bidang ? userProfile.bidang : 'all'
  );
  const [filterTahun, setFilterTahun] = useState<string>('all');
  const [inputDateFrom, setInputDateFrom] = useState<string>('');
  const [inputDateTo, setInputDateTo] = useState<string>('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [alertTab, setAlertTab] = useState<'all' | 'musnah' | 'statis' | 'overdue'>('all');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadingPng, setDownloadingPng] = useState(false);
  const retentionSectionRef = useRef<HTMLDivElement>(null);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const a of archives) {
      years.add(Number(a.kurunWaktu));
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [archives]);

  const filteredArchives = useMemo(() => {
    const effectiveBidang: 'all' | BidangId =
      isStaf && userProfile?.bidang ? userProfile.bidang : filterBidang;
    return archives.filter((a) => {
      if (effectiveBidang !== 'all' && a.bidang !== effectiveBidang) return false;
      if (filterTahun !== 'all' && String(a.kurunWaktu) !== filterTahun) return false;
      if (!matchesInputDateRange(a, inputDateFrom, inputDateTo)) return false;
      return true;
    });
  }, [archives, filterBidang, filterTahun, inputDateFrom, inputDateTo, isStaf, userProfile]);

  const hasNarrowFilterForStaf =
    filterTahun !== 'all' || Boolean(inputDateFrom) || Boolean(inputDateTo);
  const usingSatkerAggregate = Boolean(isStaf && !hasNarrowFilterForStaf && satkerStats);

  const statusCounts = useMemo(() => {
    const counts: Record<ArchiveLifecycleStatus, number> = {
      Aktif: 0,
      Inaktif: 0,
      'Usul Musnah': 0,
      Musnah: 0,
      'Pendataan Arsip Statis': 0,
    };

    const yearNow = new Date().getFullYear();

    if (usingSatkerAggregate && satkerStats) {
      for (const b of BIDANG_LIST) {
        const entry = satkerStats[b.id];
        if (entry) {
          counts.Aktif += Number(entry.aktif) || 0;
          counts.Inaktif += Number(entry.inaktif) || 0;
          counts['Usul Musnah'] += Number(entry.usulMusnah) || 0;
          counts['Pendataan Arsip Statis'] += Number(entry.statis) || 0;
          counts.Musnah += Number(entry.musnah) || 0;
        } else if (userProfile?.bidang === b.id) {
          for (const a of filteredArchives) {
            if (a.bidang !== b.id) continue;
            const st = getEffectiveArchiveStatus(a, yearNow);
            counts[st] = (counts[st] || 0) + 1;
          }
        }
      }
      return counts;
    }

    for (const a of filteredArchives) {
      const st = getEffectiveArchiveStatus(a, yearNow);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [filteredArchives, usingSatkerAggregate, satkerStats, userProfile?.bidang]);

  const physicalArchives = useMemo(() => {
    const yearNow = new Date().getFullYear();
    return filteredArchives.filter((a) => getEffectiveArchiveStatus(a, yearNow) !== 'Musnah');
  }, [filteredArchives]);

  const safeAktifCount = Number.isFinite(statusCounts.Aktif) ? statusCounts.Aktif : 0;
  const safeInaktifCount = Number.isFinite(statusCounts.Inaktif) ? statusCounts.Inaktif : 0;
  const safeUsulMusnahCount = Number.isFinite(statusCounts['Usul Musnah'])
    ? statusCounts['Usul Musnah']
    : 0;
  const safeStatisCount = Number.isFinite(statusCounts['Pendataan Arsip Statis'])
    ? statusCounts['Pendataan Arsip Statis']
    : 0;
  const musnahCount = Number.isFinite(statusCounts.Musnah) ? statusCounts.Musnah : 0;
  const totalArsipFisik =
    safeAktifCount + safeInaktifCount + safeUsulMusnahCount + safeStatisCount;
  const siapSusutCount = safeUsulMusnahCount + safeStatisCount;

  const bidangStats = useMemo(() => {
    if (usingSatkerAggregate && satkerStats) {
      return BIDANG_LIST.map((b) => {
        const entry = satkerStats[b.id];
        const count = entry
          ? (Number(entry.aktif) || 0) +
            (Number(entry.inaktif) || 0) +
            (Number(entry.usulMusnah) || 0) +
            (Number(entry.statis) || 0)
          : userProfile?.bidang === b.id
            ? physicalArchives.filter((a) => a.bidang === b.id).length
            : 0;
        return {
          ...b,
          count,
        };
      });
    }
    return BIDANG_LIST.map((b) => ({
      ...b,
      count: physicalArchives.filter((a) => a.bidang === b.id).length,
    }));
  }, [physicalArchives, usingSatkerAggregate, satkerStats, userProfile?.bidang]);

  const maxBidangCount = Math.max(1, ...bidangStats.map((b) => b.count));

  const overdueLoans = useMemo(() => {
    const effectiveBidang: 'all' | BidangId =
      isStaf && userProfile?.bidang ? userProfile.bidang : filterBidang;
    return loans.filter((l) => {
      if (effectiveBidang !== 'all' && l.bidang !== effectiveBidang) return false;
      return computeLoanStatus(l.targetKembali, l.realisasiKembali) === 'Terlambat';
    });
  }, [loans, filterBidang, isStaf, userProfile]);

  const inaktifWithoutBox = useMemo(() => {
    const yearNow = new Date().getFullYear();
    return filteredArchives.filter((a) => {
      const st = getEffectiveArchiveStatus(a, yearNow);
      return st === 'Inaktif' && (!a.nomorBoks || a.nomorBoks.trim() === '');
    });
  }, [filteredArchives]);

  const retentionAlerts = useMemo(
    () => getInaktifRetentionAlerts(filteredArchives),
    [filteredArchives]
  );

  const upcomingMusnahCount = useMemo(
    () =>
      retentionAlerts.upcoming6Months.filter((a) => a.recommendedAction === 'Usul Musnah').length,
    [retentionAlerts.upcoming6Months]
  );

  const upcomingStatisCount = useMemo(
    () =>
      retentionAlerts.upcoming6Months.filter(
        (a) => a.recommendedAction === 'Penyerahan Arsip Statis'
      ).length,
    [retentionAlerts.upcoming6Months]
  );

  const displayedRetentionAlerts = useMemo(() => {
    if (alertTab === 'overdue') return retentionAlerts.overdueInaktif;
    if (alertTab === 'musnah') {
      return retentionAlerts.upcoming6Months.filter((a) => a.recommendedAction === 'Usul Musnah');
    }
    if (alertTab === 'statis') {
      return retentionAlerts.upcoming6Months.filter(
        (a) => a.recommendedAction === 'Penyerahan Arsip Statis'
      );
    }
    return retentionAlerts.upcoming6Months;
  }, [alertTab, retentionAlerts]);

  const filteredVital = useMemo(() => {
    const effectiveBidang: 'all' | BidangId =
      isStaf && userProfile?.bidang ? userProfile.bidang : filterBidang;
    return vitalArchives.filter((v) => {
      if (effectiveBidang !== 'all' && v.bidang !== effectiveBidang) return false;
      if (filterTahun !== 'all' && String(v.kurunWaktu) !== filterTahun) return false;
      return true;
    });
  }, [vitalArchives, filterBidang, filterTahun, isStaf, userProfile]);

  const vitalWithoutBackup = useMemo(
    () =>
      filteredVital.filter((v) => {
        const url = (v.tautanBackup || '').trim();
        return !url || !isSafeHttpUrl(url);
      }).length,
    [filteredVital]
  );

  const donutSegments = useMemo(() => {
    const statuses: ArchiveLifecycleStatus[] = [
      'Aktif',
      'Inaktif',
      'Usul Musnah',
      'Pendataan Arsip Statis',
    ];
    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    let accumulated = 0;

    return statuses.map((status) => {
      const value = statusCounts[status];
      const pct = totalArsipFisik > 0 ? (value / totalArsipFisik) * 100 : 0;
      const dashLength = totalArsipFisik > 0 ? (value / totalArsipFisik) * circumference : 0;
      const offset = -accumulated;
      accumulated += dashLength;
      return {
        status,
        value,
        pct,
        color: STATUS_COLORS[status],
        dashArray: `${dashLength} ${circumference}`,
        dashOffset: offset,
      };
    });
  }, [statusCounts, totalArsipFisik]);

  const effectiveBidang: 'all' | BidangId =
    isStaf && userProfile?.bidang ? userProfile.bidang : filterBidang;

  const periodeInputLabel = useMemo(
    () => formatDateRangeLabel(inputDateFrom, inputDateTo),
    [inputDateFrom, inputDateTo]
  );

  const infographicFilename = useMemo(() => {
    const parts = ['Infografis_Arsip_Kejari_Grobogan'];
    if (effectiveBidang !== 'all') {
      parts.push(BIDANG_MAP[effectiveBidang].singkatan.replace(/[^a-zA-Z0-9_-]/g, '_'));
    }
    if (filterTahun !== 'all') {
      parts.push(filterTahun);
    }
    if (inputDateFrom || inputDateTo) {
      parts.push(`${inputDateFrom || 'awal'}_sd_${inputDateTo || 'akhir'}`);
    }
    return `${parts.join('_')}.png`;
  }, [effectiveBidang, filterTahun, inputDateFrom, inputDateTo]);

  const infographicSnapshot = useMemo<InfographicSnapshot>(() => {
    const bidangLabel = usingSatkerAggregate
      ? 'Seluruh Satuan Kerja (Agregat 6 Bidang)'
      : effectiveBidang === 'all'
        ? 'Semua Bidang (6 Unit Kerja)'
        : `${BIDANG_MAP[effectiveBidang].nama} (${BIDANG_MAP[effectiveBidang].singkatan})`;
    const tahunLabel = filterTahun === 'all' ? 'Semua Tahun' : `Tahun ${filterTahun}`;

    return {
      bidangLabel,
      tahunLabel,
      periodeInputLabel,
      tanggalCetak: formatIndonesianDate(),
      emblemUrl: DEFAULT_EMBLEM_URL,
      gatraLogoUrl: GATRA_LOGO_URL,
      totalArsipFisik,
      aktifCount: statusCounts.Aktif,
      inaktifCount: statusCounts.Inaktif,
      siapSusutCount,
      usulMusnahCount: statusCounts['Usul Musnah'],
      statisCount: statusCounts['Pendataan Arsip Statis'],
      musnahCount,
      inaktifTanpaBoks: inaktifWithoutBox.length,
      retensi6BulanTotal: retentionAlerts.upcoming6Months.length,
      retensi6BulanMusnah: upcomingMusnahCount,
      retensi6BulanStatis: upcomingStatisCount,
      bidangStats: bidangStats.map((b) => ({
        id: b.id,
        nama: b.nama,
        singkatan: b.singkatan,
        count: b.count,
        bgHex: b.bgHex,
        borderHex: b.id === 'pembinaan' || b.id === 'datun' ? '#CA8A04' : b.borderHex,
        needsDarkBorder: b.needsDarkBorder,
      })),
      statusDistribution: donutSegments.map((s) => ({
        label: s.status,
        count: s.value,
        pct: s.pct,
        color: s.color,
      })),
    };
  }, [
    usingSatkerAggregate,
    effectiveBidang,
    filterTahun,
    periodeInputLabel,
    totalArsipFisik,
    statusCounts,
    siapSusutCount,
    musnahCount,
    inaktifWithoutBox.length,
    retentionAlerts.upcoming6Months.length,
    upcomingMusnahCount,
    upcomingStatisCount,
    bidangStats,
    donutSegments,
  ]);

  useEffect(() => {
    if (!previewModalOpen) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewError(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);

    renderInfographicToCanvas(infographicSnapshot)
      .then((canvas) => canvasToPngBlob(canvas))
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return objectUrl;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewError(
          err instanceof Error ? err.message : 'Gagal membuat pratinjau infografis.'
        );
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewModalOpen(false);
    };
    document.addEventListener('keydown', handleEsc);

    return () => {
      cancelled = true;
      document.removeEventListener('keydown', handleEsc);
    };
  }, [previewModalOpen, infographicSnapshot]);

  const handleDownloadInfographic = useCallback(async () => {
    setDownloadingPng(true);
    try {
      const canvas = await renderInfographicToCanvas(infographicSnapshot);
      const blob = await canvasToPngBlob(canvas);
      triggerBlobDownload(blob, infographicFilename);
      showToast(`Berhasil mengunduh ${infographicFilename} (1200 × 1500 px).`);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal mengunduh file infografis PNG.',
        'error'
      );
    } finally {
      setDownloadingPng(false);
    }
  }, [infographicSnapshot, infographicFilename, showToast]);

  return (
    <div className="space-y-6">
      {/* Filter Cepat & Aksi Infografis */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Ringkasan Daur Hidup Kearsipan</h2>
            <p className="text-xs text-slate-500">
              Pemantauan jumlah arsip aktif, inaktif, siap susut, dan peringatan dini keterlambatan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="dash-bidang" className="text-xs font-medium text-slate-600">
                Bidang
              </label>
              <select
                id="dash-bidang"
                disabled={isStaf}
                value={effectiveBidang}
                onChange={(e) => setFilterBidang(e.target.value as 'all' | BidangId)}
                className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900 disabled:bg-slate-100"
              >
                {!isStaf && <option value="all">Semua Bidang (6 Unit)</option>}
                {BIDANG_LIST.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.singkatan} — {b.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="dash-tahun" className="text-xs font-medium text-slate-600">
                Tahun Penciptaan
              </label>
              <select
                id="dash-tahun"
                value={filterTahun}
                onChange={(e) => setFilterTahun(e.target.value)}
                className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white text-slate-900"
              >
                <option value="all">Semua Tahun</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={String(yr)}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:pl-2 xl:border-l xl:border-slate-200">
              <button
                type="button"
                onClick={() => setPreviewModalOpen(true)}
                disabled={loadingData}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Lihat Pratinjau Infografis</span>
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadInfographic()}
                disabled={loadingData || downloadingPng}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer whitespace-nowrap shrink-0"
              >
                {downloadingPng ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImageDown className="w-3.5 h-3.5" />
                )}
                <span>{downloadingPng ? 'Menyiapkan PNG...' : 'Unduh Infografis (PNG)'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <DateRangeFilter
            fromDate={inputDateFrom}
            toDate={inputDateTo}
            onChangeFrom={setInputDateFrom}
            onChangeTo={setInputDateTo}
            onChangeRange={(from, to) => {
              setInputDateFrom(from);
              setInputDateTo(to);
            }}
            label="Rentang Tanggal Input"
          />
          <div className="flex flex-wrap items-center gap-2">
            {isStaf && (
              <div className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                {usingSatkerAggregate
                  ? 'KPI & Grafik menampilkan agregat 6 bidang · Rincian khusus bidang Anda'
                  : 'Filter aktif: menghitung berdasarkan data bidang Anda'}
              </div>
            )}
            <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 whitespace-nowrap">
              Periode Penginputan: <strong className="text-slate-900">{periodeInputLabel}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Banner Notifikasi Jatuh Tempo Retensi Inaktif (6 Bulan Ke Depan) */}
      {!bannerDismissed && retentionAlerts.upcoming6Months.length > 0 && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-300 rounded-xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-amber-100 text-amber-800 shrink-0">
              <BellRing className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-amber-950">
                  Peringatan Retensi Inaktif Berakhir dalam 6 Bulan Ke Depan
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-bold font-mono-tabular rounded-md bg-amber-200 text-amber-950">
                  {retentionAlerts.upcoming6Months.length} Berkas
                </span>
              </div>
              <p className="text-xs text-amber-900 leading-relaxed">
                Terdapat{' '}
                <strong className="font-mono-tabular">
                  {retentionAlerts.upcoming6Months.length}
                </strong>{' '}
                arsip inaktif yang masa retensinya segera berakhir:{' '}
                <strong className="text-red-800 font-mono-tabular">
                  {upcomingMusnahCount} Usul Musnah
                </strong>{' '}
                dan{' '}
                <strong className="text-slate-900 font-mono-tabular">
                  {upcomingStatisCount} Penyerahan Arsip Statis
                </strong>
                . Segera siapkan daftar usul musnah atau penyerahan arsip statis beserta Berita Acara.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-center">
            <button
              type="button"
              onClick={() =>
                retentionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-700 hover:bg-amber-800 text-white cursor-pointer whitespace-nowrap"
            >
              <span>Lihat Daftar Jatuh Tempo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            {upcomingMusnahCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('usul_musnah')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-red-300 bg-white hover:bg-red-50 text-red-800 cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Usul Musnah</span>
              </button>
            )}
            {upcomingStatisCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('arsip_statis')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Arsip Statis</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Tutup banner notifikasi"
              className="p-2 rounded-lg text-amber-800 hover:bg-amber-100 cursor-pointer"
              title="Sembunyikan sementara"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 4 Kartu KPI Arsip Fisik Tersimpan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">Total Arsip Fisik Tersimpan</p>
            <p className="text-3xl font-bold font-mono-tabular text-slate-900 leading-tight">
              {totalArsipFisik ?? 0}
            </p>
            <div className="pt-2 border-t border-slate-200">
              <p className="text-xs text-slate-500">Aktif, Inaktif &amp; Siap Susut</p>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">Arsip Aktif (Central File)</p>
            <p className="text-3xl font-bold font-mono-tabular text-emerald-700 leading-tight">
              {safeAktifCount ?? 0}
            </p>
            <div className="pt-2 border-t border-emerald-200">
              <p className="text-xs text-slate-500">Dikelola unit pengolah</p>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">Arsip Inaktif (Record Center)</p>
            <p className="text-3xl font-bold font-mono-tabular text-amber-700 leading-tight">
              {safeInaktifCount ?? 0}
            </p>
            <div className="pt-2 border-t border-amber-200">
              <p className="text-xs text-slate-500">Masa simpan record center</p>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-700 shrink-0">
            <Archive className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500">Arsip Siap Susut</p>
            <p className="text-3xl font-bold font-mono-tabular text-red-700 leading-tight">
              {siapSusutCount ?? 0}
            </p>
            <div className="pt-2 border-t border-red-200">
              <p className="text-xs text-slate-500">
                Usul Musnah ({safeUsulMusnahCount ?? 0}) &amp; Statis ({safeStatisCount ?? 0})
              </p>
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-red-50 text-red-700 shrink-0">
            <FileCheck2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Kartu Indikator Terpisah: Arsip Telah Dimusnahkan */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-lg bg-slate-800 text-amber-300 border border-slate-700 shrink-0">
            <ArchiveX className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold font-display text-white">
                Arsip Telah Dimusnahkan
              </p>
              <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-slate-800 text-amber-300 border border-slate-700">
                Read-Only Permanen · Persetujuan ANRI
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Histori berkas yang telah selesai dimusnahkan sebagai bukti hukum; tidak dihitung dalam Total Arsip Fisik Tersimpan maupun Arsip Siap Susut.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0 self-start sm:self-center">
          <div className="text-left sm:text-right">
            <p className="text-3xl font-bold font-mono-tabular text-amber-300 leading-none">
              {musnahCount ?? 0}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">berkas dimusnahkan</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('arsip_dimusnahkan')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-white text-slate-900 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
          >
            <span>Lihat Histori &amp; BA</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grafik Visual */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bar Chart: Jumlah arsip per bidang */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold font-display text-slate-900">
                Distribusi Arsip Fisik per Bidang
              </h3>
              <p className="text-xs text-slate-500">
                Warna batang grafik mengikuti identitas baku 6 unit kerja Kejaksaan Negeri Grobogan (tidak termasuk arsip Musnah).
              </p>
            </div>
          </div>

          <div className="pt-2">
            <div className="grid grid-cols-6 gap-3 items-end h-56 border-b border-slate-200 pb-2 px-2">
              {bidangStats.map((b) => {
                const heightPct =
                  totalArsipFisik > 0 ? Math.max(8, (b.count / maxBidangCount) * 100) : 0;
                return (
                  <div key={b.id} className="flex flex-col items-center justify-end h-full gap-2">
                    <span className="text-xs font-semibold font-mono-tabular text-slate-800">
                      {b.count}
                    </span>
                    <div className="w-full max-w-[56px] flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-md transition-all duration-300"
                        style={{
                          height: b.count > 0 ? `${heightPct}%` : '4px',
                          backgroundColor: b.bgHex,
                          border: b.needsDarkBorder
                            ? '1.5px solid #0F172A'
                            : `1px solid ${b.borderHex}`,
                        }}
                        title={`${b.nama}: ${b.count} arsip`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-6 gap-3 pt-2.5 px-2">
              {bidangStats.map((b) => (
                <div key={b.id} className="text-center">
                  <span className="text-xs font-medium text-slate-700 block truncate">
                    {b.singkatan}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Donut Chart: Sebaran status daur hidup */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-base font-semibold font-display text-slate-900">
              Sebaran Status Daur Hidup
            </h3>
            <p className="text-xs text-slate-500">
              Komposisi status Aktif, Inaktif, Usul Musnah, dan Arsip Statis.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="64"
                  fill="none"
                  stroke="#F1F5F9"
                  strokeWidth="22"
                />
                {totalArsipFisik > 0 &&
                  donutSegments.map((seg) => (
                    <circle
                      key={seg.status}
                      cx="80"
                      cy="80"
                      r="64"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="22"
                      strokeDasharray={seg.dashArray}
                      strokeDashoffset={seg.dashOffset}
                    />
                  ))}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold font-mono-tabular text-slate-900">
                  {totalArsipFisik}
                </span>
                <span className="text-[11px] text-slate-500">Fisik Tersimpan</span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-2.5">
              {donutSegments.map((seg) => (
                <div
                  key={seg.status}
                  className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-100 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-slate-700 font-medium truncate">{seg.status}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 font-mono-tabular">
                    <span className="font-semibold text-slate-900">{seg.value}</span>
                    <span className="text-slate-400 w-12 text-right">
                      {seg.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Panel Notifikasi Retensi Inaktif Berakhir <= 6 Bulan */}
      <div
        ref={retentionSectionRef}
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 scroll-mt-20"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold font-display text-slate-900">
                  Notifikasi Jatuh Tempo Retensi Inaktif (6 Bulan Ke Depan)
                </h3>
                {retentionAlerts.upcoming6Months.length > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-bold font-mono-tabular rounded bg-amber-100 text-amber-900 border border-amber-300">
                    {retentionAlerts.upcoming6Months.length} Segera Berakhir
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                Menyoroti arsip Inaktif yang masa retensinya berakhir dalam 6 bulan ke depan untuk mempermudah persiapan pemusnahan atau penyerahan ke Arsip Statis.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('pemindahan_arsip')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
            >
              <span>Pemindahan &amp; Format BA</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Tab Tindak Lanjut */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setAlertTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              alertTab === 'all'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Semua ≤ 6 Bulan ({retentionAlerts.upcoming6Months.length})
          </button>
          <button
            type="button"
            onClick={() => setAlertTab('musnah')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              alertTab === 'musnah'
                ? 'bg-red-700 text-white border-red-700'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50'
            }`}
          >
            Usul Musnah ({upcomingMusnahCount})
          </button>
          <button
            type="button"
            onClick={() => setAlertTab('statis')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              alertTab === 'statis'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Penyerahan Arsip Statis ({upcomingStatisCount})
          </button>
          {retentionAlerts.overdueInaktif.length > 0 && (
            <button
              type="button"
              onClick={() => setAlertTab('overdue')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                alertTab === 'overdue'
                  ? 'bg-amber-700 text-white border-amber-700'
                  : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
              }`}
            >
              Inaktif Lewat Batas Retensi ({retentionAlerts.overdueInaktif.length})
            </button>
          )}
        </div>

        {displayedRetentionAlerts.length === 0 ? (
          <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
            {alertTab === 'overdue'
              ? 'Tidak ada arsip Inaktif yang melewati batas retensi.'
              : 'Tidak ada arsip dengan retensi inaktif yang akan berakhir dalam 6 bulan ke depan pada filter ini.'}
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Bidang &amp; Kode</th>
                  <th className="px-3 py-2.5 text-left font-semibold min-w-[220px]">
                    Uraian Informasi Arsip
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                    Kurun &amp; Retensi
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                    Jatuh Tempo Inaktif
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">
                    Rekomendasi Tindak Lanjut
                  </th>
                  <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedRetentionAlerts.map((alert) => (
                  <tr key={alert.item.id} className="hover:bg-slate-50/70 align-top">
                    <td className="px-3 py-2.5 space-y-1 whitespace-nowrap">
                      <div>
                        <BidangBadge bidang={alert.item.bidang} size="xs" />
                      </div>
                      <div className="text-[11px] font-mono-tabular text-slate-600 max-w-[190px] truncate">
                        {alert.item.kodeKlasifikasi || 'Tanpa Kode'}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-slate-900 line-clamp-2">
                        {alert.item.uraian}
                      </p>
                      <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                        Berkas: {alert.item.nomorBerkas || '-'} · Item:{' '}
                        {alert.item.nomorItem || '-'}
                        {alert.item.nomorBoks ? ` · Boks ${alert.item.nomorBoks}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-mono-tabular text-slate-700">
                      <div>Tahun {alert.item.kurunWaktu}</div>
                      <div className="text-[11px] text-slate-500">
                        A: {alert.item.retensiAktif} th + I: {alert.item.retensiInaktif} th
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap space-y-1">
                      <div className="font-mono-tabular font-medium text-slate-900">
                        {alert.expiryLabel}
                      </div>
                      <span
                        className={`inline-block px-2 py-0.5 text-[11px] font-semibold font-mono-tabular rounded border ${
                          alert.isOverdue || alert.daysRemaining <= 45
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-amber-50 text-amber-900 border-amber-200'
                        }`}
                      >
                        {formatRemainingRetention(alert.daysRemaining)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded border ${
                          alert.recommendedAction === 'Usul Musnah'
                            ? 'bg-red-50 text-red-800 border-red-200'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                        }`}
                      >
                        {alert.recommendedAction === 'Usul Musnah' ? (
                          <Trash2 className="w-3 h-3" />
                        ) : (
                          <Landmark className="w-3 h-3" />
                        )}
                        <span>{alert.recommendedAction}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onNavigate(alert.targetPage)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-emerald-700 text-emerald-800 bg-white hover:bg-emerald-50 cursor-pointer"
                      >
                        <span>
                          {alert.targetPage === 'usul_musnah'
                            ? 'Proses Musnah'
                            : 'Proses Statis'}
                        </span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panel Peringatan Dini */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <h3 className="text-base font-semibold font-display text-slate-900">
              Panel Peringatan Dini
            </h3>
            <p className="text-xs text-slate-500">
              Memantau peminjaman melewati batas tanggal kembali dan arsip Inaktif tanpa Nomor Boks.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
          {/* Peminjaman Terlambat */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">
                Peminjaman Berstatus Terlambat ({overdueLoans.length})
              </h4>
              <button
                type="button"
                onClick={() => onNavigate('register_pinjam')}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <span>Buka Register</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {overdueLoans.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                Tidak ada peminjaman arsip yang melewati batas tanggal kembali.
              </div>
            ) : (
              <div className="border border-red-200 rounded-lg divide-y divide-red-100 max-h-60 overflow-y-auto bg-red-50/30">
                {overdueLoans.map((loan) => {
                  const daysLate = getLoanOverdueDays(loan.targetKembali, loan.realisasiKembali);
                  return (
                    <div
                      key={loan.id}
                      className="p-3 flex items-start justify-between gap-3 hover:bg-red-50/70"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <BidangBadge bidang={loan.bidang} size="xs" />
                          <span className="text-xs font-mono-tabular text-slate-500">
                            {loan.kodeKlasifikasi}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-900 truncate">
                          {loan.uraianBerkas}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Peminjam: {loan.namaPeminjam} · Batas Kembali: {loan.targetKembali}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 text-[11px] font-semibold rounded bg-red-100 text-red-900 border border-red-300 shrink-0 whitespace-nowrap">
                        {daysLate > 0
                          ? `Jatuh Tempo (Terlambat ${daysLate} Hari)`
                          : 'Jatuh Tempo'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Inaktif tanpa Nomor Boks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-800">
                Arsip Inaktif Belum Diisi Nomor Boks ({inaktifWithoutBox.length})
              </h4>
              <button
                type="button"
                onClick={() => onNavigate('record_center')}
                className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <span>Isi di Record Center</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {inaktifWithoutBox.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                Seluruh arsip Inaktif pada filter ini telah memiliki Nomor Boks.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {inaktifWithoutBox.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 flex items-start justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <BidangBadge bidang={item.bidang} size="xs" />
                        <span className="text-xs font-mono-tabular text-slate-500">
                          Berkas {item.nomorBerkas} · {item.kodeKlasifikasi}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-slate-900 truncate">{item.uraian}</p>
                      <p className="text-[11px] text-slate-500">
                        Kurun Waktu {item.kurunWaktu} · {BIDANG_MAP[item.bidang]?.singkatan}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-amber-50 text-amber-900 border border-amber-200 shrink-0">
                      Tanpa Boks
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ringkasan Perlindungan Arsip Vital */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold font-display text-slate-900">
              Status Pengamanan Data Arsip Vital
            </h3>
            <p className="text-xs text-slate-500">
              Tercatat <strong className="font-mono-tabular text-slate-900">{filteredVital.length}</strong> arsip vital
              {vitalWithoutBackup > 0
                ? ` · ${vitalWithoutBackup} arsip belum memiliki tautan backup digital`
                : ' · Seluruh arsip vital telah memiliki tautan backup digital'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('arsip_vital')}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap self-start sm:self-auto"
        >
          <span>Kelola Arsip Vital</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Modal Pratinjau Infografis PNG */}
      {previewModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="infographic-preview-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewModalOpen(false);
          }}
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3
                  id="infographic-preview-title"
                  className="text-sm font-bold font-display text-slate-900 truncate"
                >
                  Pratinjau Infografis Pengelolaan Arsip (1200 × 1500 px)
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {infographicSnapshot.bidangLabel} · {infographicSnapshot.tahunLabel} · Periode Input: {infographicSnapshot.periodeInputLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewModalOpen(false)}
                aria-label="Tutup pratinjau infografis"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
              <DateRangeFilter
                compact
                fromDate={inputDateFrom}
                toDate={inputDateTo}
                onChangeFrom={setInputDateFrom}
                onChangeTo={setInputDateTo}
                onChangeRange={(from, to) => {
                  setInputDateFrom(from);
                  setInputDateTo(to);
                }}
                label="Sesuaikan Periode Tanggal Input sebelum mengunduh PNG:"
              />
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6 flex items-center justify-center">
              {previewLoading ? (
                <div className="py-20 flex flex-col items-center gap-3 text-slate-600">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-700" />
                  <span className="text-xs font-medium">
                    Merender poster infografis resolusi tinggi...
                  </span>
                </div>
              ) : previewError ? (
                <div className="p-6 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 text-center max-w-md">
                  {previewError}
                </div>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Pratinjau Infografis Pengelolaan Arsip Kejaksaan Negeri Grobogan"
                  className="w-auto max-w-full max-h-[68vh] rounded-lg border border-slate-300 shadow-sm bg-white"
                />
              ) : null}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] font-mono-tabular text-slate-500 truncate">
                {infographicFilename}
              </span>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadInfographic()}
                  disabled={previewLoading || downloadingPng}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  {downloadingPng ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImageDown className="w-3.5 h-3.5" />
                  )}
                  <span>{downloadingPng ? 'Mengunduh...' : 'Unduh PNG Sekarang'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
