export type BidangId =
  | 'pembinaan'
  | 'datun'
  | 'papbb'
  | 'pidum'
  | 'pidsus'
  | 'intelijen';

export type UserRole = 'admin' | 'staf' | 'pimpinan';

export type UserStatus = 'Aktif' | 'Pending' | 'Diblokir';

export type KeteranganAkhir = 'Musnah' | 'Permanen';

export type TingkatPerkembangan = 'Asli' | 'Fotokopi' | 'Salinan' | 'Tembusan';

export type KlasifikasiKeamanan =
  | 'Biasa/Terbuka'
  | 'Biasa'
  | 'Terbatas'
  | 'Rahasia'
  | 'Sangat Rahasia';

export type KondisiFisik = 'Baik' | 'Rusak Ringan' | 'Rusak Berat' | 'Berjamur';

export type PenataanArsip =
  | 'Bundel'
  | 'Jilid'
  | 'Dalam Folder'
  | 'Diikat'
  | 'Dalam Map'
  | 'Boks';

export type ArchiveLifecycleStatus =
  | 'Aktif'
  | 'Inaktif'
  | 'Usul Musnah'
  | 'Musnah'
  | 'Pendataan Arsip Statis';

export type MetodePemusnahan =
  | 'Peleburan / Pulping'
  | 'Pencacahan'
  | 'Pembakaran'
  | 'Lainnya';

export type LoanStatus = 'Dikembalikan' | 'Terlambat' | 'Dipinjam';

export type LibraryCategory =
  | 'Pedoman Klasifikasi Arsip'
  | 'JRA'
  | 'SOP Kearsipan'
  | 'E-Book/Modul';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  bidang: BidangId | '';
  role: UserRole;
  status: UserStatus;
  lastLogin?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface JraItem {
  id: string;
  nomor: number;
  kodeKlasifikasi: string;
  uraian: string;
  retensiAktif: number;
  retensiInaktif: number;
  keteranganAkhir: KeteranganAkhir;
  bidang: BidangId;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ArchiveItem {
  id: string;
  nomorBerkas: string;
  nomorItem: string;
  kodeKlasifikasi: string;
  uraian: string;
  kurunWaktu: number;
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
  tanggalInput: string;
  tanggalInputISO?: string;
  diinputOleh?: string;
  nomorBoks: string;
  catatanRecordCenter?: string;
  keterangan: string;
  nomorSuratAnri?: string;
  tanggalPersetujuanAnri?: string;
  nomorBaPemusnahan?: string;
  tanggalPemusnahan?: string;
  metodePemusnahan?: MetodePemusnahan;
  bidang: BidangId;
  createdByUid: string;
  createdByName: string;
  updatedByUid: string;
  updatedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LoanItem {
  id: string;
  nomor: number;
  tanggalPinjam: string;
  kodeKlasifikasi: string;
  uraianBerkas: string;
  namaPeminjam: string;
  bidang: BidangId;
  targetKembali: string;
  realisasiKembali: string;
  keterangan: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LibraryItem {
  id: string;
  judul: string;
  kategori: LibraryCategory;
  deskripsi: string;
  url: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiRecommendation {
  kodeKlasifikasi: string;
  uraian: string;
  bidang: BidangId;
  retensiAktif: number;
  retensiInaktif: number;
  keteranganAkhir: KeteranganAkhir;
  alasan: string;
}

export type VitalMediaType = string;

export type VitalProtectionMethod = string;

export type VitalRiskLevel = 'Sangat Vital' | 'Vital';

export interface VitalArchiveItem {
  id: string;
  nomor: number;
  bidang: BidangId;
  kodeKlasifikasi?: string;
  uraian: string;
  kurunWaktu: number;
  mediaSimpan: VitalMediaType;
  jumlah: string;
  jangkaSimpan: string;
  metodePerlindungan: VitalProtectionMethod;
  lokasiSimpan: string;
  tingkatKerawanan?: VitalRiskLevel | '';
  tautanBackup?: string;
  keterangan: string;
  createdByUid: string;
  createdByName: string;
  updatedByUid: string;
  updatedByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type DokumenKearsipanCategory =
  | 'BA Pemindahan Arsip'
  | 'BA & Laporan Pemusnahan Arsip'
  | 'Surat Persetujuan ANRI'
  | 'BA Penyerahan Arsip Statis'
  | 'Daftar Arsip Disahkan'
  | 'SK / Laporan Kearsipan Lainnya';

export type DokumenAttachmentType = 'gdrive' | 'upload';

export interface DokumenKearsipanItem {
  id: string;
  judul: string;
  kategori: DokumenKearsipanCategory;
  nomorSurat: string;
  tanggalDokumen: string;
  bidangTerkait: BidangId | 'lintas_bidang';
  tipeLampiran: DokumenAttachmentType;
  urlGoogleDrive?: string;
  fileName?: string;
  fileMimeType?: string;
  fileSize?: number;
  fileBase64?: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BidangStatSummary {
  aktif: number;
  inaktif: number;
  usulMusnah: number;
  statis: number;
  musnah: number;
  total: number;
}

export interface StatistikSatkerDoc {
  pembinaan?: BidangStatSummary;
  datun?: BidangStatSummary;
  papbb?: BidangStatSummary;
  pidum?: BidangStatSummary;
  pidsus?: BidangStatSummary;
  intelijen?: BidangStatSummary;
  updatedByUid?: string;
  updatedAt?: unknown;
}
