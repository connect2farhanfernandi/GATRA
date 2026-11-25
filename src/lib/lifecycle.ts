import {
  ArchiveItem,
  ArchiveLifecycleStatus,
  BidangId,
  BidangStatSummary,
  KeteranganAkhir,
  LoanStatus,
} from '../types/archive';

export function computeArchiveStatus(
  kurunWaktu: number,
  retensiAktif: number,
  retensiInaktif: number,
  keteranganAkhir: KeteranganAkhir,
  referenceYear: number = new Date().getFullYear()
): ArchiveLifecycleStatus {
  const aktifUntil = Number(kurunWaktu) + Number(retensiAktif);
  const inaktifUntil = aktifUntil + Number(retensiInaktif);

  if (referenceYear <= aktifUntil) {
    return 'Aktif';
  }
  if (referenceYear <= inaktifUntil) {
    return 'Inaktif';
  }
  if (keteranganAkhir === 'Musnah') {
    return 'Usul Musnah';
  }
  return 'Pendataan Arsip Statis';
}

export function normalizeArchiveStatus(
  raw: string | undefined | null
): ArchiveLifecycleStatus | null {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!v) return null;
  if (v === 'aktif') return 'Aktif';
  if (v === 'inaktif') return 'Inaktif';
  if (v === 'usul musnah') return 'Usul Musnah';
  if (v === 'musnah' || v === 'dimusnahkan' || v === 'arsip dimusnahkan') return 'Musnah';
  if (v === 'pendataan arsip statis' || v === 'arsip statis') {
    return 'Pendataan Arsip Statis';
  }
  return null;
}

export function isArchiveDestroyed(item: { keterangan?: string }): boolean {
  return normalizeArchiveStatus(item.keterangan) === 'Musnah';
}

export function getEffectiveArchiveStatus(
  item: {
    kurunWaktu: number;
    retensiAktif: number;
    retensiInaktif: number;
    keteranganAkhir: KeteranganAkhir;
    keterangan?: string;
  },
  referenceYear: number = new Date().getFullYear()
): ArchiveLifecycleStatus {
  const explicit = normalizeArchiveStatus(item.keterangan);
  if (explicit) return explicit;
  return computeArchiveStatus(
    item.kurunWaktu,
    item.retensiAktif,
    item.retensiInaktif,
    item.keteranganAkhir,
    referenceYear
  );
}

export function formatCombinedKodeKlasifikasi(kode: string, uraian?: string): string {
  const cleanKode = kode.trim();
  const cleanUraian = (uraian || '').trim();
  if (!cleanKode) return '';
  if (!cleanUraian) return cleanKode;
  if (cleanKode.toLowerCase().includes(cleanUraian.toLowerCase())) {
    return cleanKode;
  }
  return `${cleanKode} ${cleanUraian}`;
}

function getJakartaDateParts(date: Date = new Date()): {
  year: string;
  month: string;
  day: string;
} {
  // Asia/Jakarta (WIB) selalu UTC+7 tanpa Daylight Saving Time.
  const wib = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return {
    year: String(wib.getUTCFullYear()).padStart(4, '0'),
    month: String(wib.getUTCMonth() + 1).padStart(2, '0'),
    day: String(wib.getUTCDate()).padStart(2, '0'),
  };
}

export function todayIsoDate(): string {
  const { year, month, day } = getJakartaDateParts(new Date());
  return `${year}-${month}-${day}`;
}

export function formatIndonesianDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatIndonesianDateTime(date: Date = new Date()): string {
  const datePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  const timePart = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('.', ':');

  return `${datePart}, ${timePart} WIB`;
}

export function formatIndonesianTimestamp(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const INDONESIAN_MONTH_MAP: Record<string, number> = {
  januari: 1,
  jan: 1,
  january: 1,
  februari: 2,
  feb: 2,
  pebruari: 2,
  peb: 2,
  february: 2,
  maret: 3,
  mar: 3,
  mart: 3,
  march: 3,
  april: 4,
  apr: 4,
  mei: 5,
  may: 5,
  juni: 6,
  jun: 6,
  june: 6,
  juli: 7,
  jul: 7,
  july: 7,
  agustus: 8,
  agu: 8,
  agt: 8,
  agst: 8,
  agust: 8,
  ags: 8,
  aug: 8,
  august: 8,
  september: 9,
  sep: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  oct: 10,
  october: 10,
  november: 11,
  nov: 11,
  nop: 11,
  nopember: 11,
  desember: 12,
  des: 12,
  dec: 12,
  december: 12,
};

function toValidIso(year: number, month: number, day: number): string | null {
  if (year < 1945 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIndonesianDateToIso(raw: string | undefined | null): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  // 1. Format ISO YYYY-MM-DD (atau timestamp diawali YYYY-MM-DD)
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|T|\s)/);
  if (isoMatch) {
    return toValidIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  // 2. Format YYYY/MM/DD
  const ymdSlash = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:$|\s)/);
  if (ymdSlash) {
    return toValidIso(Number(ymdSlash[1]), Number(ymdSlash[2]), Number(ymdSlash[3]));
  }

  // 3. Format teks bahasa Indonesia / Inggris, mis. "9 November 2026", "25 November 2026, 09:05 WIB", "25 Nov 2026"
  const textDateMatch = text
    .toLowerCase()
    .match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (textDateMatch) {
    const day = Number(textDateMatch[1]);
    const monthName = textDateMatch[2].replace(/[^a-z]/g, '');
    const year = Number(textDateMatch[3]);
    const month = INDONESIAN_MONTH_MAP[monthName];
    if (month) {
      return toValidIso(year, month, day);
    }
  }

  // 4. Format DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:$|\s|,)/);
  if (dmyMatch) {
    return toValidIso(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
  }

  return null;
}

function unknownTimestampToIso(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    const parsedIndo = parseIndonesianDateToIso(val);
    if (parsedIndo) return parsedIndo;
  }
  let d: Date | null = null;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    d = (val as { toDate: () => Date }).toDate();
  } else if (typeof val === 'object' && val !== null && 'seconds' in val) {
    d = new Date(Number((val as { seconds: number }).seconds) * 1000);
  } else if (typeof val === 'object' && val !== null && '_seconds' in val) {
    d = new Date(Number((val as { _seconds: number })._seconds) * 1000);
  } else if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'string' || typeof val === 'number') {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  const { year, month, day } = getJakartaDateParts(d);
  return `${year}-${month}-${day}`;
}

export function getArchiveInputIsoDate(
  item: Pick<ArchiveItem, 'tanggalInputISO' | 'tanggalInput' | 'createdAt'>
): string {
  const isoField = (item.tanggalInputISO || '').trim();
  if (isoField) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoField)) {
      return isoField;
    }
    const parsedIsoField = parseIndonesianDateToIso(isoField);
    if (parsedIsoField) return parsedIsoField;
  }

  const fromCreatedAt = unknownTimestampToIso(item.createdAt);
  if (fromCreatedAt) return fromCreatedAt;

  const parsedFromText = parseIndonesianDateToIso(item.tanggalInput);
  if (parsedFromText) return parsedFromText;

  return '';
}

export function matchesInputDateRange(
  item: Pick<ArchiveItem, 'tanggalInputISO' | 'tanggalInput' | 'createdAt'>,
  fromIso: string,
  toIso: string
): boolean {
  const from = fromIso.trim();
  const to = toIso.trim();
  if (!from && !to) return true;
  const itemIso = getArchiveInputIsoDate(item);
  if (!itemIso) return false;
  if (from && itemIso < from) return false;
  if (to && itemIso > to) return false;
  return true;
}

const SHORT_ID_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function formatShortIndonesianDate(isoDate: string): string {
  const match = isoDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const monthIdx = Number(match[2]) - 1;
  const monthName = SHORT_ID_MONTHS[monthIdx] || match[2];
  return `${match[3]} ${monthName} ${match[1]}`;
}

export function formatDateRangeLabel(fromIso: string, toIso: string): string {
  const from = fromIso.trim();
  const to = toIso.trim();
  if (!from && !to) return 'Keseluruhan Data';
  if (from && to) {
    return `${formatShortIndonesianDate(from)} s/d ${formatShortIndonesianDate(to)}`;
  }
  if (from) return `Mulai ${formatShortIndonesianDate(from)}`;
  return `s/d ${formatShortIndonesianDate(to)}`;
}

export function getQuickDateRange(preset: 'today' | '7days' | 'month'): {
  from: string;
  to: string;
} {
  const today = todayIsoDate();
  const [y, m, d] = today.split('-').map(Number);

  if (preset === 'today') {
    return { from: today, to: today };
  }
  if (preset === 'month') {
    return {
      from: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`,
      to: today,
    };
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 6);
  const from = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  return { from, to: today };
}

export function computeLoanStatus(
  targetKembali: string,
  realisasiKembali: string,
  referenceDate: string = todayIsoDate()
): LoanStatus {
  if (realisasiKembali && realisasiKembali.trim().length > 0) {
    return 'Dikembalikan';
  }
  if (targetKembali && referenceDate > targetKembali) {
    return 'Terlambat';
  }
  return 'Dipinjam';
}

export function getLoanOverdueDays(
  targetKembali: string,
  realisasiKembali: string,
  referenceDate: string = todayIsoDate()
): number {
  if (realisasiKembali && realisasiKembali.trim().length > 0) {
    return 0;
  }
  const targetMatch = String(targetKembali || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const refMatch = String(referenceDate || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!targetMatch || !refMatch) return 0;

  const targetUtc = Date.UTC(
    Number(targetMatch[1]),
    Number(targetMatch[2]) - 1,
    Number(targetMatch[3])
  );
  const refUtc = Date.UTC(Number(refMatch[1]), Number(refMatch[2]) - 1, Number(refMatch[3]));
  if (refUtc <= targetUtc) return 0;
  return Math.max(1, Math.round((refUtc - targetUtc) / (1000 * 60 * 60 * 24)));
}

export function computeBidangArchiveStats(
  items: ArchiveItem[],
  bidang: BidangId,
  referenceYear: number = new Date().getFullYear()
): BidangStatSummary {
  const summary: BidangStatSummary = {
    aktif: 0,
    inaktif: 0,
    usulMusnah: 0,
    statis: 0,
    musnah: 0,
    total: 0,
  };

  for (const item of items) {
    if (item.bidang !== bidang) continue;
    const status = getEffectiveArchiveStatus(item, referenceYear);
    if (status === 'Aktif') summary.aktif += 1;
    else if (status === 'Inaktif') summary.inaktif += 1;
    else if (status === 'Usul Musnah') summary.usulMusnah += 1;
    else if (status === 'Pendataan Arsip Statis') summary.statis += 1;
    else if (status === 'Musnah') summary.musnah += 1;
  }

  summary.total =
    summary.aktif +
    summary.inaktif +
    summary.usulMusnah +
    summary.statis +
    summary.musnah;

  return summary;
}

export function isSafeHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeBidangInput(raw: string): BidangId | null {
  const v = raw.trim().toLowerCase();
  if (v === 'pembinaan' || v.includes('pembinaan')) return 'pembinaan';
  if (v === 'datun' || v.includes('perdata')) return 'datun';
  if (v === 'papbb' || v.includes('barang bukti') || v.includes('pemulihan aset')) return 'papbb';
  if (v === 'pidum' || v.includes('pidana umum')) return 'pidum';
  if (v === 'pidsus' || v.includes('pidana khusus')) return 'pidsus';
  if (v === 'intelijen' || v.includes('intel')) return 'intelijen';
  return null;
}

export function generateSafeDocId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

export interface InaktifExpiryAlert {
  item: ArchiveItem;
  expiryYear: number;
  expiryDate: Date;
  expiryLabel: string;
  daysRemaining: number;
  recommendedAction: 'Usul Musnah' | 'Penyerahan Arsip Statis';
  targetPage: 'usul_musnah' | 'arsip_statis';
  isOverdue: boolean;
}

export function formatRemainingRetention(daysRemaining: number): string {
  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    if (overdueDays >= 30) {
      return `Lewat ~${Math.max(1, Math.round(overdueDays / 30))} bln (${overdueDays} hr)`;
    }
    return `Lewat ${overdueDays} hari`;
  }
  if (daysRemaining === 0) return 'Berakhir hari ini';
  if (daysRemaining < 30) return `Sisa ${daysRemaining} hari`;
  const months = Math.max(1, Math.round(daysRemaining / 30));
  return `Sisa ~${months} bln (${daysRemaining} hr)`;
}

export function getInaktifRetentionAlerts(
  archives: ArchiveItem[],
  referenceDate: Date = new Date()
): {
  upcoming6Months: InaktifExpiryAlert[];
  overdueInaktif: InaktifExpiryAlert[];
} {
  const todayStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const horizonEnd = new Date(todayStart);
  horizonEnd.setMonth(horizonEnd.getMonth() + 6);
  horizonEnd.setHours(23, 59, 59, 999);

  const upcoming6Months: InaktifExpiryAlert[] = [];
  const overdueInaktif: InaktifExpiryAlert[] = [];

  for (const item of archives) {
    const status = getEffectiveArchiveStatus(item, referenceDate.getFullYear());
    if (status !== 'Inaktif') continue;

    const kurun = Number(item.kurunWaktu);
    const aktif = Number(item.retensiAktif);
    const inaktif = Number(item.retensiInaktif);
    if (!Number.isFinite(kurun) || !Number.isFinite(aktif) || !Number.isFinite(inaktif)) {
      continue;
    }

    const expiryYear = kurun + aktif + inaktif;
    if (!Number.isFinite(expiryYear) || expiryYear < 1900 || expiryYear > 2200) {
      continue;
    }

    // Berdasarkan kaidah JRA, masa retensi tahunan berakhir pada 31 Desember tahun jatuh tempo.
    const expiryDayStart = new Date(expiryYear, 11, 31);
    const expiryEndOfDay = new Date(expiryYear, 11, 31, 23, 59, 59, 999);
    const daysRemaining = Math.round(
      (expiryDayStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    const recommendedAction: InaktifExpiryAlert['recommendedAction'] =
      item.keteranganAkhir === 'Musnah' ? 'Usul Musnah' : 'Penyerahan Arsip Statis';
    const targetPage: InaktifExpiryAlert['targetPage'] =
      item.keteranganAkhir === 'Musnah' ? 'usul_musnah' : 'arsip_statis';

    const alert: InaktifExpiryAlert = {
      item,
      expiryYear,
      expiryDate: expiryEndOfDay,
      expiryLabel: `31 Desember ${expiryYear}`,
      daysRemaining,
      recommendedAction,
      targetPage,
      isOverdue: expiryEndOfDay < todayStart,
    };

    if (expiryEndOfDay >= todayStart && expiryEndOfDay <= horizonEnd) {
      upcoming6Months.push(alert);
    } else if (expiryEndOfDay < todayStart) {
      overdueInaktif.push(alert);
    }
  }

  upcoming6Months.sort((a, b) => a.daysRemaining - b.daysRemaining);
  overdueInaktif.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return { upcoming6Months, overdueInaktif };
}
