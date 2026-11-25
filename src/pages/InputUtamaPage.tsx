import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Eye,
  Lock,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  BIDANG_LIST,
  KLASIFIKASI_KEAMANAN_OPTIONS,
  KONDISI_FISIK_OPTIONS,
  PENATAAN_OPTIONS,
  TINGKAT_PERKEMBANGAN_OPTIONS,
} from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge, LifecycleStatusBadge } from '../components/BidangBadge';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { downloadCsv, parseCsvFile } from '../lib/csv';
import {
  computeArchiveStatus,
  formatCombinedKodeKlasifikasi,
  formatDateRangeLabel,
  formatIndonesianDateTime,
  getArchiveInputIsoDate,
  getEffectiveArchiveStatus,
  isArchiveDestroyed,
  matchesInputDateRange,
  normalizeArchiveStatus,
  normalizeBidangInput,
  parseIndonesianDateToIso,
  todayIsoDate,
} from '../lib/lifecycle';
import {
  AiRecommendation,
  ArchiveItem,
  ArchiveLifecycleStatus,
  BidangId,
  KeteranganAkhir,
  KlasifikasiKeamanan,
  KondisiFisik,
  PenataanArsip,
  TingkatPerkembangan,
} from '../types/archive';

const CSV_19_HEADERS = [
  'Nomor Berkas',
  'Nomor Item Arsip',
  'Kode Klasifikasi Arsip',
  'Uraian Informasi Arsip',
  'Kurun Waktu',
  'Tingkat Perkembangan',
  'Jumlah',
  'Nomor Filing Cabinet',
  'Nomor Laci',
  'Nomor Folder',
  'Klasifikasi Keamanan',
  'Kondisi',
  'Penataan',
  'Retensi Aktif',
  'Retensi Inaktif',
  'Keterangan Akhir',
  'Dasar Perhitungan Retensi',
  'Tanggal Input',
  'Keterangan Tambahan',
];

type PendingCsvImportItem = Omit<
  ArchiveItem,
  | 'id'
  | 'tanggalInput'
  | 'tanggalInputISO'
  | 'diinputOleh'
  | 'createdByUid'
  | 'createdByName'
  | 'updatedByUid'
  | 'updatedByName'
  | 'createdAt'
  | 'updatedAt'
> & { tanggalInput?: string; tanggalInputISO?: string };

function getCsvCol(row: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    if (alias in row && row[alias] !== undefined) {
      return String(row[alias] ?? '');
    }
  }
  const normalizedMap = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    normalizedMap.set(k.trim().toLowerCase().replace(/\s+/g, ' '), String(v ?? ''));
  }
  for (const alias of aliases) {
    const val = normalizedMap.get(alias.trim().toLowerCase().replace(/\s+/g, ' '));
    if (val !== undefined) return val;
  }
  return '';
}

function parseRetentionYears(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  if (Number.isNaN(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

function parseKurunYear(raw: string): number {
  const trimmed = raw.trim();
  const direct = Number(trimmed);
  if (!Number.isNaN(direct) && direct >= 1945 && direct <= 2100) {
    return Math.round(direct);
  }
  const match = trimmed.match(/\b(19[4-9]\d|20\d{2}|2100)\b/);
  if (match) return Number(match[1]);
  return new Date().getFullYear();
}

function findJraByCodeOrPrefix<
  T extends {
    kodeKlasifikasi: string;
    uraian: string;
    retensiAktif: number;
    retensiInaktif: number;
    keteranganAkhir: KeteranganAkhir;
    bidang: BidangId;
  },
>(kodeRaw: string, bidang: BidangId, jraList: T[]): T | undefined {
  const clean = kodeRaw.trim().toLowerCase();
  if (!clean) return undefined;
  const firstToken = clean.split(/\s+/)[0] || clean;

  const pools = [
    jraList.filter((j) => j.bidang === bidang || j.bidang === 'pembinaan'),
    jraList,
  ];

  for (const pool of pools) {
    const exact = pool.find((j) => {
      const jc = j.kodeKlasifikasi.trim().toLowerCase();
      const combined = formatCombinedKodeKlasifikasi(j.kodeKlasifikasi, j.uraian).toLowerCase();
      return jc === clean || jc === firstToken || combined === clean;
    });
    if (exact) return exact;

    const sorted = [...pool].sort(
      (a, b) => b.kodeKlasifikasi.trim().length - a.kodeKlasifikasi.trim().length
    );
    const prefixMatch = sorted.find((j) => {
      const jc = j.kodeKlasifikasi.trim().toLowerCase();
      if (!jc) return false;
      return (
        clean.startsWith(jc) ||
        firstToken.startsWith(jc) ||
        (firstToken.length >= 2 && jc.startsWith(firstToken))
      );
    });
    if (prefixMatch) return prefixMatch;
  }

  return undefined;
}

function normalizeTingkatPerkembangan(raw: string): TingkatPerkembangan {
  const lower = raw.trim().toLowerCase();
  if (!lower) return 'Asli';
  if (lower.includes('fotokopi') || lower.includes('foto copy') || lower === 'fc') {
    return 'Fotokopi';
  }
  if (lower.includes('salinan')) return 'Salinan';
  if (lower.includes('tembusan')) return 'Tembusan';
  const exact = TINGKAT_PERKEMBANGAN_OPTIONS.find((o) => o.toLowerCase() === lower);
  return exact || 'Asli';
}

function normalizeKeamanan(raw: string): KlasifikasiKeamanan {
  const lower = raw.trim().toLowerCase();
  if (!lower) return 'Biasa/Terbuka';
  if (lower.includes('sangat rahasia')) return 'Sangat Rahasia';
  if (lower.includes('rahasia')) return 'Rahasia';
  if (lower.includes('terbatas')) return 'Terbatas';
  if (lower.includes('biasa') || lower.includes('terbuka')) return 'Biasa/Terbuka';
  const exact = KLASIFIKASI_KEAMANAN_OPTIONS.find((o) => o.toLowerCase() === lower);
  return exact || 'Biasa/Terbuka';
}

function normalizeKondisi(raw: string): KondisiFisik {
  const lower = raw.trim().toLowerCase();
  if (!lower) return 'Baik';
  if (lower.includes('rusak berat')) return 'Rusak Berat';
  if (lower.includes('rusak ringan') || lower.includes('rusak')) return 'Rusak Ringan';
  if (lower.includes('berjamur') || lower.includes('jamur')) return 'Berjamur';
  const exact = KONDISI_FISIK_OPTIONS.find((o) => o.toLowerCase() === lower);
  return exact || 'Baik';
}

function normalizePenataan(raw: string): PenataanArsip {
  const lower = raw.trim().toLowerCase();
  if (!lower) return 'Bundel';
  if (lower.includes('bundel')) return 'Bundel';
  if (lower.includes('jilid')) return 'Jilid';
  if (lower.includes('boks') || lower.includes('box')) return 'Boks';
  if (lower.includes('ikat')) return 'Diikat';
  if (lower.includes('map')) return 'Dalam Map';
  if (lower.includes('folder')) return 'Dalam Folder';
  const exact = PENATAAN_OPTIONS.find((o) => o.toLowerCase() === lower);
  return exact || 'Bundel';
}

interface ArchiveFormState {
  bidang: BidangId;
  nomorBerkas: string;
  nomorItem: string;
  kodeKlasifikasi: string;
  uraian: string;
  kurunWaktu: string;
  tingkatPerkembangan: TingkatPerkembangan;
  jumlah: string;
  filingCabinet: string;
  laci: string;
  folder: string;
  klasifikasiKeamanan: KlasifikasiKeamanan;
  kondisiFisik: KondisiFisik;
  penataan: PenataanArsip;
  retensiAktif: number;
  retensiInaktif: number;
  keteranganAkhir: KeteranganAkhir;
  dasarRetensi: string;
  nomorBoks: string;
  catatanRecordCenter: string;
}

export function InputUtamaPage() {
  const { userProfile, getIdToken } = useAuth();
  const {
    archives,
    jraList,
    saveArchiveItem,
    deleteArchiveItem,
    resetAllArchives,
    importArchiveItems,
    loadingData,
  } = useArchiveData();
  const { showToast } = useToast();

  const isAdmin = userProfile?.role === 'admin';
  const isPimpinan = userProfile?.role === 'pimpinan';
  const canMutate = !isPimpinan;

  const [search, setSearch] = useState('');
  const [filterBidang, setFilterBidang] = useState<'all' | BidangId>('all');
  const [inputDateFrom, setInputDateFrom] = useState('');
  const [inputDateTo, setInputDateTo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<ArchiveItem | null>(null);
  const [editingItem, setEditingItem] = useState<ArchiveItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiRecommendation[]>([]);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importTargetBidang, setImportTargetBidang] = useState<BidangId>(
    userProfile?.bidang || 'pembinaan'
  );
  const [importFileName, setImportFileName] = useState('');
  const [rawCsvRows, setRawCsvRows] = useState<Array<Record<string, string>>>([]);
  const [parsingCsv, setParsingCsv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const defaultBidang: BidangId = userProfile?.bidang || 'pembinaan';

  const [form, setForm] = useState<ArchiveFormState>({
    bidang: defaultBidang,
    nomorBerkas: '',
    nomorItem: '',
    kodeKlasifikasi: '',
    uraian: '',
    kurunWaktu: String(new Date().getFullYear()),
    tingkatPerkembangan: 'Asli',
    jumlah: '1',
    filingCabinet: '',
    laci: '',
    folder: '',
    klasifikasiKeamanan: 'Biasa/Terbuka',
    kondisiFisik: 'Baik',
    penataan: 'Bundel',
    retensiAktif: 2,
    retensiInaktif: 3,
    keteranganAkhir: 'Musnah',
    dasarRetensi: '',
    nomorBoks: '',
    catatanRecordCenter: '',
  });

  // Master JRA terfilter: hanya bidang terkait + Sub Bagian Pembinaan
  const allowedJraForForm = useMemo(() => {
    return jraList.filter((j) => j.bidang === form.bidang || j.bidang === 'pembinaan');
  }, [jraList, form.bidang]);

  const filteredArchives = useMemo(() => {
    const q = search.trim().toLowerCase();
    return archives.filter((item) => {
      if (filterBidang !== 'all' && item.bidang !== filterBidang) return false;
      if (!matchesInputDateRange(item, inputDateFrom, inputDateTo)) return false;
      if (!q) return true;
      return (
        item.nomorBerkas.toLowerCase().includes(q) ||
        item.nomorItem.toLowerCase().includes(q) ||
        item.kodeKlasifikasi.toLowerCase().includes(q) ||
        item.uraian.toLowerCase().includes(q) ||
        String(item.kurunWaktu).includes(q) ||
        getEffectiveArchiveStatus(item).toLowerCase().includes(q)
      );
    });
  }, [archives, filterBidang, inputDateFrom, inputDateTo, search]);

  const liveFormStatus: ArchiveLifecycleStatus = useMemo(() => {
    return computeArchiveStatus(
      Number(form.kurunWaktu) || new Date().getFullYear(),
      form.retensiAktif,
      form.retensiInaktif,
      form.keteranganAkhir
    );
  }, [form.kurunWaktu, form.retensiAktif, form.retensiInaktif, form.keteranganAkhir]);

  const openAdd = () => {
    const b = userProfile?.bidang || 'pembinaan';
    setEditingItem(null);
    setAiSuggestions([]);
    setForm({
      bidang: b,
      nomorBerkas: '',
      nomorItem: '',
      kodeKlasifikasi: '',
      uraian: '',
      kurunWaktu: String(new Date().getFullYear()),
      tingkatPerkembangan: 'Asli',
      jumlah: '1',
      filingCabinet: '',
      laci: '',
      folder: '',
      klasifikasiKeamanan: 'Biasa/Terbuka',
      kondisiFisik: 'Baik',
      penataan: 'Bundel',
      retensiAktif: 2,
      retensiInaktif: 3,
      keteranganAkhir: 'Musnah',
      dasarRetensi: '',
      nomorBoks: '',
      catatanRecordCenter: '',
    });
    setModalOpen(true);
  };

  const openEdit = (item: ArchiveItem) => {
    if (isArchiveDestroyed(item) || getEffectiveArchiveStatus(item) === 'Musnah') {
      showToast('Arsip berstatus Musnah terkunci Read-Only permanen dan tidak dapat diubah.', 'error');
      return;
    }
    setEditingItem(item);
    setAiSuggestions([]);
    setForm({
      bidang: item.bidang,
      nomorBerkas: item.nomorBerkas,
      nomorItem: item.nomorItem,
      kodeKlasifikasi: item.kodeKlasifikasi,
      uraian: item.uraian,
      kurunWaktu: String(item.kurunWaktu),
      tingkatPerkembangan: item.tingkatPerkembangan,
      jumlah: item.jumlah,
      filingCabinet: item.filingCabinet,
      laci: item.laci,
      folder: item.folder,
      klasifikasiKeamanan:
        item.klasifikasiKeamanan === 'Biasa' ? 'Biasa/Terbuka' : item.klasifikasiKeamanan,
      kondisiFisik: item.kondisiFisik,
      penataan: item.penataan,
      retensiAktif: item.retensiAktif,
      retensiInaktif: item.retensiInaktif,
      keteranganAkhir: item.keteranganAkhir,
      dasarRetensi: item.dasarRetensi,
      nomorBoks: item.nomorBoks,
      catatanRecordCenter:
        item.catatanRecordCenter || (normalizeArchiveStatus(item.keterangan) ? '' : item.keterangan),
    });
    setModalOpen(true);
  };

  const handleBidangChange = (newBidang: BidangId) => {
    setAiSuggestions([]);
    setForm((prev) => ({
      ...prev,
      bidang: newBidang,
    }));
  };

  const handleSelectMasterJra = (jraId: string) => {
    if (!jraId) {
      setForm((prev) => ({ ...prev, kodeKlasifikasi: '' }));
      return;
    }
    const matched = allowedJraForForm.find((j) => j.id === jraId);
    if (matched) {
      const combined = formatCombinedKodeKlasifikasi(matched.kodeKlasifikasi, matched.uraian).slice(
        0,
        300
      );
      setForm((prev) => ({
        ...prev,
        kodeKlasifikasi: combined,
        retensiAktif: matched.retensiAktif,
        retensiInaktif: matched.retensiInaktif,
        keteranganAkhir: matched.keteranganAkhir,
      }));
    }
  };

  const handleKodeTextChange = (val: string) => {
    const matched = findJraByCodeOrPrefix(val, form.bidang, allowedJraForForm);
    if (matched && val.trim().length > 0) {
      setForm((prev) => ({
        ...prev,
        kodeKlasifikasi: val,
        retensiAktif: matched.retensiAktif,
        retensiInaktif: matched.retensiInaktif,
        keteranganAkhir: matched.keteranganAkhir,
      }));
    } else {
      setForm((prev) => ({ ...prev, kodeKlasifikasi: val }));
    }
  };

  const matchedJraIdForSelect = useMemo(() => {
    const clean = form.kodeKlasifikasi.trim().toLowerCase();
    if (!clean) return '';
    const exact = allowedJraForForm.find(
      (j) =>
        formatCombinedKodeKlasifikasi(j.kodeKlasifikasi, j.uraian).toLowerCase() === clean ||
        j.kodeKlasifikasi.trim().toLowerCase() === clean
    );
    return exact?.id || '';
  }, [allowedJraForForm, form.kodeKlasifikasi]);

  const handleAskAiRecommendation = async () => {
    if (form.uraian.trim().length < 4) {
      showToast('Isi Uraian Informasi Arsip terlebih dahulu sebelum meminta rekomendasi AI.', 'error');
      return;
    }
    if (allowedJraForForm.length === 0) {
      showToast('Belum ada daftar Master JRA untuk bidang ini.', 'error');
      return;
    }

    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/ai/recommend-jra', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          uraian: form.uraian.trim(),
          bidang: form.bidang,
          candidates: allowedJraForForm.map((j) => ({
            kodeKlasifikasi: j.kodeKlasifikasi,
            uraian: j.uraian,
            bidang: j.bidang,
            retensiAktif: j.retensiAktif,
            retensiInaktif: j.retensiInaktif,
            keteranganAkhir: j.keteranganAkhir,
          })),
        }),
      });

      const payload = (await res.json()) as {
        recommendations?: AiRecommendation[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || 'Gagal mendapatkan rekomendasi AI.');
      }

      const recs = payload.recommendations || [];
      if (recs.length === 0) {
        showToast('AI tidak menemukan kode JRA yang cukup relevan. Silakan pilih manual.', 'info');
      } else {
        setAiSuggestions(recs);
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghubungi layanan AI.', 'error');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSuggestion = (rec: AiRecommendation) => {
    const matched = allowedJraForForm.find((j) => j.kodeKlasifikasi === rec.kodeKlasifikasi);
    if (!matched) {
      showToast('Kode tidak ditemukan di daftar JRA bidang.', 'error');
      return;
    }
    const combined = formatCombinedKodeKlasifikasi(matched.kodeKlasifikasi, matched.uraian).slice(
      0,
      300
    );
    setForm((prev) => ({
      ...prev,
      kodeKlasifikasi: combined,
      retensiAktif: matched.retensiAktif,
      retensiInaktif: matched.retensiInaktif,
      keteranganAkhir: matched.keteranganAkhir,
    }));
    showToast(`Kode ${matched.kodeKlasifikasi} diterapkan.`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.uraian.trim()) {
      showToast('Uraian Informasi Arsip wajib diisi.', 'error');
      return;
    }

    const kurun = Number(form.kurunWaktu);
    if (isNaN(kurun) || kurun < 1945 || kurun > 2100) {
      showToast('Kurun Waktu harus berupa tahun valid (1945–2100).', 'error');
      return;
    }

    const retAktif = Math.min(100, Math.max(0, Number(form.retensiAktif) || 0));
    const retInaktif = Math.min(100, Math.max(0, Number(form.retensiInaktif) || 0));
    const autoKeteranganTambahan = computeArchiveStatus(
      kurun,
      retAktif,
      retInaktif,
      form.keteranganAkhir
    );

    setSaving(true);
    try {
      await saveArchiveItem(
        {
          bidang: form.bidang,
          nomorBerkas: form.nomorBerkas.trim().slice(0, 60),
          nomorItem: form.nomorItem.trim().slice(0, 60),
          kodeKlasifikasi: form.kodeKlasifikasi.trim().slice(0, 300),
          uraian: form.uraian.trim().slice(0, 2000),
          kurunWaktu: kurun,
          tingkatPerkembangan: form.tingkatPerkembangan,
          jumlah: form.jumlah.trim().slice(0, 100) || '1',
          filingCabinet: form.filingCabinet.trim().slice(0, 60),
          laci: form.laci.trim().slice(0, 60),
          folder: form.folder.trim().slice(0, 60),
          klasifikasiKeamanan: form.klasifikasiKeamanan,
          kondisiFisik: form.kondisiFisik,
          penataan: form.penataan,
          retensiAktif: retAktif,
          retensiInaktif: retInaktif,
          keteranganAkhir: form.keteranganAkhir,
          dasarRetensi: form.dasarRetensi.trim().slice(0, 300),
          nomorBoks: form.nomorBoks.trim().slice(0, 60),
          catatanRecordCenter: form.catatanRecordCenter.trim().slice(0, 1000),
          keterangan: autoKeteranganTambahan,
        },
        editingItem || undefined
      );
      showToast(editingItem ? 'Data arsip berhasil diperbarui.' : 'Data arsip berhasil disimpan.');
      setModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan arsip.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ArchiveItem) => {
    if (isArchiveDestroyed(item) || getEffectiveArchiveStatus(item) === 'Musnah') {
      showToast('Arsip berstatus Musnah terkunci Read-Only permanen sebagai bukti hukum.', 'error');
      return;
    }
    try {
      await deleteArchiveItem(item.id);
      showToast(`Arsip "${item.uraian.slice(0, 40)}" dihapus.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus arsip.', 'error');
    }
  };

  const handleExportCsv = () => {
    const rows = filteredArchives.map((a) => [
      a.nomorBerkas,
      a.nomorItem,
      a.kodeKlasifikasi,
      a.uraian,
      a.kurunWaktu,
      a.tingkatPerkembangan,
      a.jumlah,
      a.filingCabinet,
      a.laci,
      a.folder,
      a.klasifikasiKeamanan === 'Biasa' ? 'Biasa/Terbuka' : a.klasifikasiKeamanan,
      a.kondisiFisik,
      a.penataan,
      a.retensiAktif,
      a.retensiInaktif,
      a.keteranganAkhir,
      a.dasarRetensi,
      a.tanggalInput,
      getEffectiveArchiveStatus(a),
    ]);
    downloadCsv('INPUT_UTAMA_arsip_gatra.csv', CSV_19_HEADERS, rows);
    showToast(`Berhasil mengekspor ${rows.length} data arsip (19 kolom baku).`);
  };

  const handleDownloadCsvTemplate = () => {
    downloadCsv('template_19_kolom_input_utama.csv', CSV_19_HEADERS, [
      [
        '1',
        '1',
        'KP.08.03 Rekreasi, olah raga, dan kesenian',
        'Contoh uraian informasi berkas arsip dinas',
        '2024',
        'Asli',
        '1',
        'FC-01',
        'Laci 1',
        'Folder 01',
        'Biasa/Terbuka',
        'Baik',
        'Bundel',
        '2',
        '3',
        'Musnah',
        'Pedoman JRA Kejaksaan RI',
        formatIndonesianDateTime(),
        'Aktif',
      ],
    ]);
  };

  const csvHasBidangCol = useMemo(() => {
    if (rawCsvRows.length === 0) return false;
    return rawCsvRows.some((row) => Boolean(normalizeBidangInput(getCsvCol(row, 'Bidang', 'bidang'))));
  }, [rawCsvRows]);

  const parsedCsvPreview = useMemo(() => {
    const validItems: PendingCsvImportItem[] = [];
    let skippedEmptyUraian = 0;

    for (const row of rawCsvRows) {
      const uraian = getCsvCol(
        row,
        'Uraian Informasi Arsip',
        'Uraian',
        'uraian'
      ).trim();

      if (!uraian) {
        skippedEmptyUraian++;
        continue;
      }

      const nomorBerkas = getCsvCol(row, 'Nomor Berkas', 'nomorBerkas').trim();
      const nomorItem = getCsvCol(
        row,
        'Nomor Item Arsip',
        'Nomor Item',
        'nomorItem'
      ).trim();
      const kodeRaw = getCsvCol(
        row,
        'Kode Klasifikasi Arsip',
        'Kode Klasifikasi',
        'kodeKlasifikasi'
      ).trim();

      const csvBidangParsed = normalizeBidangInput(getCsvCol(row, 'Bidang', 'bidang'));
      const fallbackBidang = userProfile?.bidang || 'pembinaan';
      const rowBidang: BidangId = isAdmin
        ? csvBidangParsed || importTargetBidang || fallbackBidang
        : fallbackBidang;

      const matchedJra = findJraByCodeOrPrefix(kodeRaw, rowBidang, jraList);
      const kurunWaktu = parseKurunYear(getCsvCol(row, 'Kurun Waktu', 'kurunWaktu'));

      const csvAktif = parseRetentionYears(getCsvCol(row, 'Retensi Aktif', 'retensiAktif'));
      const csvInaktif = parseRetentionYears(
        getCsvCol(row, 'Retensi Inaktif', 'retensiInaktif')
      );
      const csvKetAkhirRaw = getCsvCol(row, 'Keterangan Akhir', 'keteranganAkhir')
        .trim()
        .toLowerCase();

      const retensiAktif = csvAktif !== null ? csvAktif : (matchedJra?.retensiAktif ?? 2);
      const retensiInaktif = csvInaktif !== null ? csvInaktif : (matchedJra?.retensiInaktif ?? 3);
      const keteranganAkhir: KeteranganAkhir = csvKetAkhirRaw.includes('perm')
        ? 'Permanen'
        : csvKetAkhirRaw.includes('musnah')
          ? 'Musnah'
          : (matchedJra?.keteranganAkhir ?? 'Musnah');

      const rawKetTambahan = getCsvCol(
        row,
        'Keterangan Tambahan',
        'Keterangan',
        'keterangan'
      ).trim();
      const explicitCsvStatus = normalizeArchiveStatus(rawKetTambahan);
      const finalKeteranganTambahan =
        explicitCsvStatus ||
        computeArchiveStatus(kurunWaktu, retensiAktif, retensiInaktif, keteranganAkhir);

      const rawTanggalInput = getCsvCol(row, 'Tanggal Input', 'tanggalInput').trim();
      const parsedTanggalIso = parseIndonesianDateToIso(rawTanggalInput) || todayIsoDate();

      const combinedKode = kodeRaw
        ? kodeRaw
        : matchedJra
          ? formatCombinedKodeKlasifikasi(matchedJra.kodeKlasifikasi, matchedJra.uraian)
          : '';

      validItems.push({
        bidang: rowBidang,
        nomorBerkas: nomorBerkas.slice(0, 60),
        nomorItem: nomorItem.slice(0, 60),
        kodeKlasifikasi: combinedKode.slice(0, 300),
        uraian: uraian.slice(0, 2000),
        kurunWaktu,
        tingkatPerkembangan: normalizeTingkatPerkembangan(
          getCsvCol(row, 'Tingkat Perkembangan', 'tingkatPerkembangan')
        ),
        jumlah: getCsvCol(row, 'Jumlah', 'jumlah').trim().slice(0, 100) || '1',
        filingCabinet: getCsvCol(
          row,
          'Nomor Filing Cabinet',
          'Filing Cabinet',
          'filingCabinet'
        )
          .trim()
          .slice(0, 60),
        laci: getCsvCol(row, 'Nomor Laci', 'Laci', 'laci').trim().slice(0, 60),
        folder: getCsvCol(row, 'Nomor Folder', 'Folder', 'folder').trim().slice(0, 60),
        klasifikasiKeamanan: normalizeKeamanan(
          getCsvCol(row, 'Klasifikasi Keamanan', 'klasifikasiKeamanan')
        ),
        kondisiFisik: normalizeKondisi(
          getCsvCol(row, 'Kondisi', 'Kondisi Fisik', 'kondisiFisik')
        ),
        penataan: normalizePenataan(getCsvCol(row, 'Penataan', 'Penataan Arsip', 'penataan')),
        retensiAktif,
        retensiInaktif,
        keteranganAkhir,
        dasarRetensi: getCsvCol(
          row,
          'Dasar Perhitungan Retensi',
          'Dasar Retensi',
          'dasarRetensi'
        )
          .trim()
          .slice(0, 300),
        nomorBoks: getCsvCol(row, 'Nomor Boks', 'nomorBoks').trim().slice(0, 60),
        catatanRecordCenter: getCsvCol(row, 'Catatan Record Center', 'catatanRecordCenter')
          .trim()
          .slice(0, 1000),
        keterangan: finalKeteranganTambahan.slice(0, 1000),
        tanggalInput: rawTanggalInput ? rawTanggalInput.slice(0, 60) : undefined,
        tanggalInputISO: parsedTanggalIso,
      });
    }

    return { validItems, skippedEmptyUraian };
  }, [rawCsvRows, isAdmin, userProfile, importTargetBidang, jraList]);

  const openImportModal = () => {
    setImportTargetBidang(userProfile?.bidang || 'pembinaan');
    setImportFileName('');
    setRawCsvRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setImportModalOpen(true);
  };

  const handleSelectCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingCsv(true);
    setImportFileName(file.name);
    try {
      const records = await parseCsvFile(file);
      setRawCsvRows(records);
      if (records.length === 0) {
        showToast('File CSV kosong atau tidak memiliki baris data.', 'error');
      }
    } catch (err: unknown) {
      setRawCsvRows([]);
      showToast(err instanceof Error ? err.message : 'Gagal membaca berkas CSV.', 'error');
    } finally {
      setParsingCsv(false);
    }
  };

  const handleConfirmImportCsv = async () => {
    if (!userProfile) return;
    if (parsedCsvPreview.validItems.length === 0) {
      showToast(
        'Tidak ada baris valid (kolom Uraian Informasi Arsip wajib terisi).',
        'error'
      );
      return;
    }

    setImporting(true);
    try {
      const count = await importArchiveItems(parsedCsvPreview.validItems);
      showToast(`Berhasil mengimpor ${count} arsip ke INPUT_UTAMA.`);
      setImportModalOpen(false);
      setRawCsvRows([]);
      setImportFileName('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mengimpor CSV arsip.', 'error');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const openResetModal = () => {
    setResetStep(1);
    setResetConfirmText('');
    setResetModalOpen(true);
  };

  const handleConfirmResetAll = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'RESET ARSIP') return;
    setResetting(true);
    try {
      const deleted = await resetAllArchives();
      showToast(`Berhasil mengosongkan ${deleted} dokumen data arsip.`);
      setResetModalOpen(false);
      setResetConfirmText('');
      setResetStep(1);
    } catch (err: unknown) {
      showToast(
        err instanceof Error ? err.message : 'Gagal mengosongkan database arsip.',
        'error'
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold font-display text-slate-900">
            Input &amp; Daftar Utama Arsip (INPUT_UTAMA)
          </h2>
          <p className="text-xs text-slate-500">
            Selaras 19 kolom standar Google Sheets Kejaksaan Negeri Grobogan. Tanggal Input terkunci permanen dan Keterangan Tambahan memuat status daur hidup.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              onClick={openResetModal}
              disabled={archives.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset / Kosongkan Data Arsip</span>
            </button>
          )}

          {canMutate && (
            <button
              type="button"
              onClick={openImportModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Impor CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV (19 Kolom)</span>
          </button>

          {canMutate && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Input Arsip Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Pencarian, Bidang & Rentang Tanggal Input */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor berkas, kode klasifikasi, uraian, tahun, atau status..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          {(isAdmin || isPimpinan) && (
            <div className="flex items-center gap-2">
              <label htmlFor="arsip-filter-bidang" className="text-xs font-medium text-slate-600">
                Filter Bidang:
              </label>
              <select
                id="arsip-filter-bidang"
                value={filterBidang}
                onChange={(e) => setFilterBidang(e.target.value as 'all' | BidangId)}
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white"
              >
                <option value="all">Semua Bidang ({archives.length})</option>
                {BIDANG_LIST.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.singkatan} — {b.nama}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            label="Filter Rentang Tanggal Input"
          />

          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 whitespace-nowrap">
            {inputDateFrom || inputDateTo ? (
              <span>
                Menampilkan <strong className="text-emerald-800 font-mono-tabular">{filteredArchives.length}</strong> arsip yang diinput pada{' '}
                <strong className="text-slate-900">{formatDateRangeLabel(inputDateFrom, inputDateTo)}</strong>
              </span>
            ) : (
              <span>
                Menampilkan <strong className="text-emerald-800 font-mono-tabular">{filteredArchives.length}</strong> arsip (Keseluruhan Data)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabel 19 Kolom Baku */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                <th className="py-3 px-3 whitespace-nowrap">Bidang</th>
                <th className="py-3 px-3 whitespace-nowrap">Nomor Berkas</th>
                <th className="py-3 px-3 whitespace-nowrap">Nomor Item Arsip</th>
                <th className="py-3 px-3 min-w-[220px]">Kode Klasifikasi Arsip</th>
                <th className="py-3 px-3 min-w-[260px]">Uraian Informasi Arsip</th>
                <th className="py-3 px-3 whitespace-nowrap">Kurun Waktu</th>
                <th className="py-3 px-3 whitespace-nowrap">Tingkat Perkembangan</th>
                <th className="py-3 px-3 whitespace-nowrap">Jumlah</th>
                <th className="py-3 px-3 whitespace-nowrap">Nomor Filing Cabinet</th>
                <th className="py-3 px-3 whitespace-nowrap">Nomor Laci</th>
                <th className="py-3 px-3 whitespace-nowrap">Nomor Folder</th>
                <th className="py-3 px-3 whitespace-nowrap">Klasifikasi Keamanan</th>
                <th className="py-3 px-3 whitespace-nowrap">Kondisi</th>
                <th className="py-3 px-3 whitespace-nowrap">Penataan</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">Retensi Aktif</th>
                <th className="py-3 px-3 whitespace-nowrap text-right">Retensi Inaktif</th>
                <th className="py-3 px-3 whitespace-nowrap">Keterangan Akhir</th>
                <th className="py-3 px-3 min-w-[180px]">Dasar Perhitungan Retensi</th>
                <th className="py-3 px-3 whitespace-nowrap">Tanggal Input</th>
                <th className="py-3 px-3 whitespace-nowrap">Keterangan Tambahan</th>
                <th className="py-3 px-3 text-right whitespace-nowrap sticky right-0 bg-slate-50 border-l border-slate-200">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingData ? (
                <tr>
                  <td colSpan={21} className="py-10 text-center text-sm text-slate-500">
                    Memuat data arsip...
                  </td>
                </tr>
              ) : filteredArchives.length === 0 ? (
                <tr>
                  <td colSpan={21} className="py-10 text-center text-sm text-slate-500">
                    Belum ada data arsip yang tercatat pada INPUT_UTAMA.
                  </td>
                </tr>
              ) : (
                filteredArchives.map((item) => {
                  const effectiveStatus = getEffectiveArchiveStatus(item);
                  const isLockedDestroyed =
                    isArchiveDestroyed(item) || effectiveStatus === 'Musnah';
                  const keamananLabel =
                    item.klasifikasiKeamanan === 'Biasa'
                      ? 'Biasa/Terbuka'
                      : item.klasifikasiKeamanan;
                  return (
                    <tr
                      key={item.id}
                      className={
                        isLockedDestroyed
                          ? 'bg-slate-50/80 text-slate-600 align-top'
                          : 'hover:bg-slate-50/70 align-top'
                      }
                    >
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <BidangBadge bidang={item.bidang} size="xs" />
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-800 whitespace-nowrap">
                        {item.nomorBerkas || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-700 whitespace-nowrap">
                        {item.nomorItem || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium leading-snug">
                        {item.kodeKlasifikasi || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 leading-snug">{item.uraian}</td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-800 whitespace-nowrap">
                        {item.kurunWaktu}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {item.tingkatPerkembangan}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {item.jumlah}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {item.filingCabinet || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {item.laci || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {item.folder || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {keamananLabel}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {item.kondisiFisik}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {item.penataan}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-right text-slate-800 whitespace-nowrap">
                        {item.retensiAktif}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-right text-slate-800 whitespace-nowrap">
                        {item.retensiInaktif}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 whitespace-nowrap">
                        {item.keteranganAkhir}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 leading-snug">
                        {item.dasarRetensi || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        {item.tanggalInput}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <LifecycleStatusBadge status={effectiveStatus} />
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap sticky right-0 bg-white border-l border-slate-100">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailItem(item)}
                            title="Lihat Detail & Jejak Audit"
                            className="p-1.5 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {isLockedDestroyed ? (
                            <span
                              title="Terkunci Read-Only Permanen (Arsip Sudah Dimusnahkan)"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded bg-slate-900 text-white"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Read-Only</span>
                            </span>
                          ) : (
                            canMutate && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEdit(item)}
                                  title="Edit Arsip"
                                  className="p-1.5 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(item)}
                                  title="Hapus Arsip"
                                  className="p-1.5 rounded text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail + Jejak Audit */}
      {detailItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-semibold font-display text-slate-900">
                  Detail Berkas {detailItem.nomorBerkas ? `#${detailItem.nomorBerkas}` : 'Arsip'}
                </h3>
                <BidangBadge bidang={detailItem.bidang} size="xs" />
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Nomor Berkas / Item</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {detailItem.nomorBerkas || '—'} / {detailItem.nomorItem || '—'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Kurun Waktu</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {detailItem.kurunWaktu}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Keterangan Tambahan (Status)</span>
                <LifecycleStatusBadge status={getEffectiveArchiveStatus(detailItem)} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <span className="text-slate-400 block">Kode Klasifikasi Arsip</span>
                <span className="font-medium text-slate-900">
                  {detailItem.kodeKlasifikasi || '—'}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <span className="text-slate-400 block">Uraian Informasi Arsip</span>
                <p className="text-sm text-slate-800 mt-0.5">{detailItem.uraian}</p>
              </div>
              <div>
                <span className="text-slate-400 block">Tingkat Perkembangan</span>
                <span className="text-slate-800">{detailItem.tingkatPerkembangan}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Jumlah</span>
                <span className="text-slate-800">{detailItem.jumlah}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Keamanan / Kondisi</span>
                <span className="text-slate-800">
                  {detailItem.klasifikasiKeamanan === 'Biasa'
                    ? 'Biasa/Terbuka'
                    : detailItem.klasifikasiKeamanan}{' '}
                  · {detailItem.kondisiFisik}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Filing Cabinet / Laci / Folder</span>
                <span className="text-slate-800">
                  {detailItem.filingCabinet || '-'} / {detailItem.laci || '-'} /{' '}
                  {detailItem.folder || '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Penataan / Nomor Boks</span>
                <span className="text-slate-800">
                  {detailItem.penataan} · Boks: {detailItem.nomorBoks || 'Belum diisi'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Retensi (Aktif / Inaktif)</span>
                <span className="font-mono-tabular text-slate-800">
                  {detailItem.retensiAktif} th / {detailItem.retensiInaktif} th (
                  {detailItem.keteranganAkhir})
                </span>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <span className="text-slate-400 block">Dasar Perhitungan Retensi</span>
                <span className="text-slate-800">{detailItem.dasarRetensi || '—'}</span>
              </div>
              {detailItem.catatanRecordCenter && (
                <div className="col-span-2 sm:col-span-3">
                  <span className="text-slate-400 block">Catatan Record Center</span>
                  <span className="text-slate-800">{detailItem.catatanRecordCenter}</span>
                </div>
              )}
              {(isArchiveDestroyed(detailItem) ||
                getEffectiveArchiveStatus(detailItem) === 'Musnah') && (
                <div className="col-span-2 sm:col-span-3 bg-slate-900 text-slate-100 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Bukti Hukum Pemusnahan Arsip (Read-Only Permanen)</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block">Nomor Persetujuan ANRI</span>
                      <span className="font-mono-tabular font-semibold">
                        {detailItem.nomorSuratAnri || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Tanggal Persetujuan ANRI</span>
                      <span className="font-mono-tabular">
                        {detailItem.tanggalPersetujuanAnri || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Nomor BA Pemusnahan</span>
                      <span className="font-mono-tabular font-semibold">
                        {detailItem.nomorBaPemusnahan || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Tanggal &amp; Metode Pemusnahan</span>
                      <span>
                        {detailItem.tanggalPemusnahan || '—'} ·{' '}
                        {detailItem.metodePemusnahan || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="col-span-2 sm:col-span-3 bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <span className="font-semibold text-slate-700 block">Jejak Audit</span>
                <p className="text-slate-600">
                  Tanggal Input Terkunci: <strong>{detailItem.tanggalInput}</strong>
                  {getArchiveInputIsoDate(detailItem) && (
                    <span className="ml-1.5 text-[11px] font-mono-tabular text-slate-500">
                      (ISO: {getArchiveInputIsoDate(detailItem)})
                    </span>
                  )}
                </p>
                <p className="text-slate-600">
                  Diinput oleh: <strong>{detailItem.diinputOleh || detailItem.createdByName}</strong>
                </p>
                <p className="text-slate-600">
                  Pembaruan terakhir oleh: <strong>{detailItem.updatedByName}</strong>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah / Edit Arsip (19 Kolom Baku + Internal Background) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-semibold font-display text-slate-900">
                  {editingItem ? 'Edit Data Arsip (INPUT_UTAMA)' : 'Input Data Arsip Baru (19 Kolom)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih Kode Klasifikasi dari Master JRA atau ketik format gabungan kode &amp; uraian. Keterangan Tambahan terisi otomatis.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
              {/* Bidang + 1 & 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Unit Kerja / Bidang (Internal)
                  </label>
                  <select
                    disabled={!isAdmin}
                    value={form.bidang}
                    onChange={(e) => handleBidangChange(e.target.value as BidangId)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    {BIDANG_LIST.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.singkatan} — {b.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    1. Nomor Berkas (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.nomorBerkas}
                    onChange={(e) => setForm({ ...form, nomorBerkas: e.target.value })}
                    placeholder="Kosongkan jika belum ada"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    2. Nomor Item Arsip (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.nomorItem}
                    onChange={(e) => setForm({ ...form, nomorItem: e.target.value })}
                    placeholder="Kosongkan jika belum ada"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>

              {/* 4. Uraian + Rekomendasi AI */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-700">
                    4. Uraian Informasi Arsip <span className="text-red-600">*</span>
                  </label>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={() => void handleAskAiRecommendation()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 disabled:opacity-60 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {aiLoading ? 'Menganalisis Pedoman JRA...' : 'Rekomendasi Kode AI'}
                    </span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  required
                  maxLength={2000}
                  value={form.uraian}
                  onChange={(e) => setForm({ ...form, uraian: e.target.value })}
                  placeholder="Tuliskan uraian informasi arsip..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />

                {aiSuggestions.length > 0 && (
                  <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-2">
                    <div className="text-xs font-semibold text-emerald-900">
                      Rekomendasi Kode Klasifikasi dari Master JRA (Klik untuk menerapkan):
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {aiSuggestions.map((rec) => (
                        <button
                          key={rec.kodeKlasifikasi}
                          type="button"
                          onClick={() => applyAiSuggestion(rec)}
                          className="text-left p-2.5 rounded-lg bg-white border border-emerald-200 hover:border-emerald-500 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono-tabular text-xs font-bold text-emerald-800">
                              {rec.kodeKlasifikasi}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono-tabular">
                              {rec.retensiAktif}th Aktif · {rec.retensiInaktif}th Inaktif ·{' '}
                              {rec.keteranganAkhir}
                            </span>
                          </div>
                          <div className="text-xs font-medium text-slate-800 mt-0.5">
                            {rec.uraian}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{rec.alasan}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Kode Klasifikasi Arsip (Format gabungan + picker Master JRA) */}
              <div className="space-y-2 bg-slate-50/80 border border-slate-200 rounded-lg p-3.5">
                <label className="block text-xs font-medium text-slate-700">
                  3. Kode Klasifikasi Arsip (Gabungan Kode &amp; Uraian, Boleh Kosong)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <select
                    value={matchedJraIdForSelect}
                    onChange={(e) => handleSelectMasterJra(e.target.value)}
                    aria-label="Pilih dari Master JRA"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Pilih dari Master JRA (Opsional) --</option>
                    {allowedJraForForm.map((j) => (
                      <option key={j.id} value={j.id}>
                        {formatCombinedKodeKlasifikasi(j.kodeKlasifikasi, j.uraian)} (
                        {j.bidang === 'pembinaan' ? 'Pembinaan' : j.bidang.toUpperCase()})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    maxLength={300}
                    value={form.kodeKlasifikasi}
                    onChange={(e) => handleKodeTextChange(e.target.value)}
                    placeholder="Contoh: KP.08.03 Rekreasi, olah raga, dan kesenian"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              {/* 5, 6, 7 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    5. Kurun Waktu <span className="text-red-600">*</span>
                  </label>
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
                  <label className="text-xs font-medium text-slate-700">
                    6. Tingkat Perkembangan
                  </label>
                  <select
                    value={form.tingkatPerkembangan}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tingkatPerkembangan: e.target.value as TingkatPerkembangan,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {TINGKAT_PERKEMBANGAN_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">7. Jumlah</label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={form.jumlah}
                    onChange={(e) => setForm({ ...form, jumlah: e.target.value })}
                    placeholder="Contoh: 1"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* 8, 9, 10 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    8. Nomor Filing Cabinet (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.filingCabinet}
                    onChange={(e) => setForm({ ...form, filingCabinet: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    9. Nomor Laci (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.laci}
                    onChange={(e) => setForm({ ...form, laci: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    10. Nomor Folder (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.folder}
                    onChange={(e) => setForm({ ...form, folder: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* 11, 12, 13 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    11. Klasifikasi Keamanan
                  </label>
                  <select
                    value={form.klasifikasiKeamanan}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        klasifikasiKeamanan: e.target.value as KlasifikasiKeamanan,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {KLASIFIKASI_KEAMANAN_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">12. Kondisi</label>
                  <select
                    value={form.kondisiFisik}
                    onChange={(e) =>
                      setForm({ ...form, kondisiFisik: e.target.value as KondisiFisik })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {KONDISI_FISIK_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">13. Penataan</label>
                  <select
                    value={form.penataan}
                    onChange={(e) =>
                      setForm({ ...form, penataan: e.target.value as PenataanArsip })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {PENATAAN_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 14, 15, 16 Retensi (Otomatis dari JRA, dapat disesuaikan bila perlu) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    14. Retensi Aktif (Tahun)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.retensiAktif}
                    onChange={(e) =>
                      setForm({ ...form, retensiAktif: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded bg-white text-slate-800 font-mono-tabular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    15. Retensi Inaktif (Tahun)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.retensiInaktif}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        retensiInaktif: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded bg-white text-slate-800 font-mono-tabular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    16. Keterangan Akhir
                  </label>
                  <select
                    value={form.keteranganAkhir}
                    onChange={(e) =>
                      setForm({ ...form, keteranganAkhir: e.target.value as KeteranganAkhir })
                    }
                    className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded bg-white text-slate-800 font-medium"
                  >
                    <option value="Musnah">Musnah</option>
                    <option value="Permanen">Permanen</option>
                  </select>
                </div>
              </div>

              {/* 17 + Internal Nomor Boks & Catatan Record Center */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    17. Dasar Perhitungan Retensi (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={300}
                    value={form.dasarRetensi}
                    onChange={(e) => setForm({ ...form, dasarRetensi: e.target.value })}
                    placeholder="Mis. PERJA Pedoman JRA"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Nomor Boks (Internal Record Center)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    value={form.nomorBoks}
                    onChange={(e) => setForm({ ...form, nomorBoks: e.target.value })}
                    placeholder="Contoh: B-01"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Catatan Record Center (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={1000}
                    value={form.catatanRecordCenter}
                    onChange={(e) => setForm({ ...form, catatanRecordCenter: e.target.value })}
                    placeholder="Lokasi rak / catatan boks"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* 18 & 19 Locked Date & Keterangan Tambahan (Status Otomatis) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>18. Tanggal Input (Terkunci Permanen / Read-Only)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={editingItem ? editingItem.tanggalInput : formatIndonesianDateTime()}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded bg-slate-100 text-slate-700 cursor-not-allowed"
                  />
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-2">
                    <span>
                      ISO:{' '}
                      <strong className="font-mono-tabular">
                        {editingItem ? getArchiveInputIsoDate(editingItem) || '—' : todayIsoDate()}
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Diinput oleh:{' '}
                      <strong>
                        {editingItem
                          ? editingItem.diinputOleh || editingItem.createdByName
                          : userProfile?.displayName || userProfile?.email || '—'}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">
                    19. Keterangan Tambahan (Status Daur Hidup Otomatis)
                  </label>
                  <div className="py-1 flex items-center gap-2">
                    <LifecycleStatusBadge status={liveFormStatus} />
                    <span className="text-[11px] text-slate-500">
                      Dihitung real-time dari Kurun Waktu + Retensi
                    </span>
                  </div>
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
                  className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Simpan Arsip'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Impor CSV Kompatibel Google Sheets (19 Kolom) */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-semibold font-display text-slate-900">
                  Impor CSV Arsip (Format 19 Kolom Google Sheets)
                </h3>
                <p className="text-xs text-slate-500">
                  Mendukung tanda kutip ganda (quoted fields). Baris valid selama Uraian Informasi Arsip terisi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 1. Pilih Bidang untuk Data Ini */}
              <div className="space-y-1.5">
                <label
                  htmlFor="import-target-bidang"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Pilih Bidang untuk Data Ini
                </label>
                <select
                  id="import-target-bidang"
                  disabled={!isAdmin}
                  value={importTargetBidang}
                  onChange={(e) => setImportTargetBidang(e.target.value as BidangId)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-600"
                >
                  {BIDANG_LIST.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama} ({b.singkatan})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  {isAdmin
                    ? 'Otomatis menetapkan Bidang untuk seluruh baris CSV ekspor Google Sheets yang tidak memiliki kolom Bidang.'
                    : 'Akun Staf Bidang otomatis mengimpor data ke unit kerja bidang Anda sendiri.'}
                </p>
              </div>

              {/* 2. Unggah Berkas CSV */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="import-csv-file"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Pilih File CSV (.csv)
                  </label>
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="text-[11px] font-medium text-emerald-700 hover:underline cursor-pointer"
                  >
                    Unduh Contoh Templat 19 Kolom
                  </button>
                </div>
                <input
                  id="import-csv-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void handleSelectCsvFile(e)}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border file:border-slate-300 file:text-xs file:font-medium file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer border border-dashed border-slate-300 rounded-lg p-2.5 bg-slate-50/50"
                />
              </div>

              {/* 3. Ringkasan & Pratinjau Hasil Parsing */}
              {parsingCsv && (
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  Membaca dan memvalidasi isi berkas CSV...
                </div>
              )}

              {!parsingCsv && importFileName && (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="font-semibold text-slate-900">
                      Berkas: <span className="font-mono-tabular">{importFileName}</span>
                    </div>
                    <div className="text-slate-700 tabular-nums">
                      Baris valid siap impor: <strong>{parsedCsvPreview.validItems.length}</strong>{' '}
                      baris
                      {parsedCsvPreview.skippedEmptyUraian > 0 && (
                        <span className="text-slate-500">
                          {' '}
                          · {parsedCsvPreview.skippedEmptyUraian} baris dilewati karena Uraian Informasi Arsip kosong
                        </span>
                      )}
                    </div>
                    {csvHasBidangCol && isAdmin && (
                      <div className="text-emerald-800">
                        Kolom &ldquo;Bidang&rdquo; terdeteksi di dalam CSV dan akan diprioritaskan per baris.
                      </div>
                    )}
                  </div>

                  {parsedCsvPreview.validItems.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        Pratinjau 5 Baris Pertama
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-[11px] text-slate-500 bg-white">
                              <th className="py-2 px-3">Bidang</th>
                              <th className="py-2 px-3">Kode Klasifikasi Arsip</th>
                              <th className="py-2 px-3">Uraian Informasi Arsip</th>
                              <th className="py-2 px-3">Tahun</th>
                              <th className="py-2 px-3">Tanggal Input → ISO</th>
                              <th className="py-2 px-3">Retensi</th>
                              <th className="py-2 px-3">Keterangan Tambahan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {parsedCsvPreview.validItems.slice(0, 5).map((row, idx) => {
                              const statusVal = getEffectiveArchiveStatus(row);
                              return (
                                <tr key={idx}>
                                  <td className="py-2 px-3">
                                    <BidangBadge bidang={row.bidang} size="xs" />
                                  </td>
                                  <td className="py-2 px-3 max-w-[160px] truncate text-slate-700">
                                    {row.kodeKlasifikasi || '—'}
                                  </td>
                                  <td className="py-2 px-3 max-w-[200px] truncate text-slate-800">
                                    {row.uraian}
                                  </td>
                                  <td className="py-2 px-3 font-mono-tabular">{row.kurunWaktu}</td>
                                  <td className="py-2 px-3 whitespace-nowrap text-[11px]">
                                    <div className="text-slate-700">
                                      {row.tanggalInput || 'Otomatis (Hari Ini)'}
                                    </div>
                                    <div className="font-mono-tabular text-emerald-700">
                                      → {row.tanggalInputISO}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-mono-tabular whitespace-nowrap">
                                    {row.retensiAktif}/{row.retensiInaktif} ({row.keteranganAkhir})
                                  </td>
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <LifecycleStatusBadge status={statusVal} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setImportModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={importing || parsingCsv || parsedCsvPreview.validItems.length === 0}
                  onClick={() => void handleConfirmImportCsv()}
                  className="px-5 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 cursor-pointer"
                >
                  {importing
                    ? 'Mengimpor...'
                    : `Impor ${parsedCsvPreview.validItems.length} Arsip`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Ganda: Reset / Kosongkan Data Arsip (Khusus Admin) */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-red-200 rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-red-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-semibold font-display">
                  {resetStep === 1
                    ? 'Reset / Kosongkan Data Arsip'
                    : 'Konfirmasi Akhir Penghapusan'}
                </h3>
              </div>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setResetModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetStep === 1 ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 space-y-1.5 leading-relaxed">
                  <p>
                    Tindakan ini akan menghapus secara permanen seluruh{' '}
                    <strong>{archives.length} dokumen arsip</strong> pada koleksi{' '}
                    <code className="font-mono-tabular">INPUT_UTAMA</code> (termasuk data Central File, Record Center, Usul Musnah, dan Arsip Statis).
                  </p>
                  <p className="text-red-700">
                    Data Master JRA, Data Arsip Vital, Register Pinjam, Pustaka Materi, dan Pengguna tidak akan dihapus.
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setResetModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetStep(2)}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                  >
                    Lanjutkan Konfirmasi
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Penghapusan tidak dapat dibatalkan. Ketik{' '}
                  <strong className="font-mono-tabular text-red-700">RESET ARSIP</strong> di bawah ini untuk mengosongkan seluruh data arsip uji coba:
                </p>

                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Ketik RESET ARSIP"
                  className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
                />

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={() => setResetStep(1)}
                    className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Kembali
                  </button>
                  <button
                    type="button"
                    disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET ARSIP'}
                    onClick={() => void handleConfirmResetAll()}
                    className="px-4 py-2 text-xs font-medium rounded-lg bg-red-700 hover:bg-red-800 text-white disabled:opacity-50 cursor-pointer"
                  >
                    {resetting ? 'Menghapus Data...' : 'Ya, Kosongkan Semua Data'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
