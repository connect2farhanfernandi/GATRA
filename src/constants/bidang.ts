import { BidangId, LibraryCategory, UserRole, UserStatus } from '../types/archive';

export interface BidangConfig {
  id: BidangId;
  nama: string;
  singkatan: string;
  jabatanPimpinan: string;
  bgHex: string;
  textHex: string;
  borderHex: string;
  chartHex: string;
  needsDarkBorder: boolean;
}

export const BIDANG_LIST: BidangConfig[] = [
  {
    id: 'pembinaan',
    nama: 'Sub Bagian Pembinaan',
    singkatan: 'Pembinaan',
    jabatanPimpinan: 'Kepala Sub Bagian Pembinaan',
    bgHex: '#FEF08A',
    textHex: '#1E293B',
    borderHex: '#EAB308',
    chartHex: '#FACC15',
    needsDarkBorder: false,
  },
  {
    id: 'datun',
    nama: 'Perdata dan Tata Usaha Negara',
    singkatan: 'Datun',
    jabatanPimpinan: 'Kepala Seksi Perdata dan Tata Usaha Negara',
    bgHex: '#FEF08A',
    textHex: '#1E293B',
    borderHex: '#EAB308',
    chartHex: '#EAB308',
    needsDarkBorder: false,
  },
  {
    id: 'papbb',
    nama: 'Pemulihan Aset dan Pengelolaan Barang Bukti',
    singkatan: 'PAPBB',
    jabatanPimpinan: 'Kepala Seksi Pemulihan Aset dan Pengelolaan Barang Bukti',
    bgHex: '#FFFFFF',
    textHex: '#0F172A',
    borderHex: '#0F172A',
    chartHex: '#E2E8F0',
    needsDarkBorder: true,
  },
  {
    id: 'pidum',
    nama: 'Pidana Umum',
    singkatan: 'Pidum',
    jabatanPimpinan: 'Kepala Seksi Tindak Pidana Umum',
    bgHex: '#EF4444',
    textHex: '#FFFFFF',
    borderHex: '#DC2626',
    chartHex: '#EF4444',
    needsDarkBorder: false,
  },
  {
    id: 'pidsus',
    nama: 'Pidana Khusus',
    singkatan: 'Pidsus',
    jabatanPimpinan: 'Kepala Seksi Tindak Pidana Khusus',
    bgHex: '#7F1D1D',
    textHex: '#FFFFFF',
    borderHex: '#7F1D1D',
    chartHex: '#7F1D1D',
    needsDarkBorder: false,
  },
  {
    id: 'intelijen',
    nama: 'Intelijen',
    singkatan: 'Intelijen',
    jabatanPimpinan: 'Kepala Seksi Intelijen',
    bgHex: '#16A34A',
    textHex: '#FFFFFF',
    borderHex: '#15803D',
    chartHex: '#16A34A',
    needsDarkBorder: false,
  },
];

export const BIDANG_MAP: Record<BidangId, BidangConfig> = BIDANG_LIST.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<BidangId, BidangConfig>
);

export const PRIMARY_ADMIN_EMAIL = 'connectfarhan.workspace@gmail.com';

export function isPrimaryAdminEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase());
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  staf: 'Staf Bidang',
  pimpinan: 'Pimpinan',
};

export const USER_STATUS_OPTIONS: UserStatus[] = ['Aktif', 'Pending', 'Diblokir'];

export const TINGKAT_PERKEMBANGAN_OPTIONS = [
  'Asli',
  'Fotokopi',
  'Salinan',
  'Tembusan',
] as const;

export const KLASIFIKASI_KEAMANAN_OPTIONS = [
  'Biasa/Terbuka',
  'Terbatas',
  'Rahasia',
  'Sangat Rahasia',
] as const;

export const KONDISI_FISIK_OPTIONS = [
  'Baik',
  'Rusak Ringan',
  'Rusak Berat',
  'Berjamur',
] as const;

export const PENATAAN_OPTIONS = [
  'Bundel',
  'Jilid',
  'Dalam Folder',
  'Diikat',
  'Dalam Map',
  'Boks',
] as const;

export const LIBRARY_CATEGORIES: LibraryCategory[] = [
  'Pedoman Klasifikasi Arsip',
  'JRA',
  'SOP Kearsipan',
  'E-Book/Modul',
];

export const OFFICIAL_KOP_SURAT = {
  namaKejaksaanRI: 'KEJAKSAAN REPUBLIK INDONESIA',
  namaKejati: 'KEJAKSAAN TINGGI JAWA TENGAH',
  namaInstansi: 'KEJAKSAAN NEGERI GROBOGAN',
  alamat: 'Jl. Bhayangkara No. 02, Purwodadi, Kabupaten Grobogan 58111',
  teleponFaxWebsite:
    'Telp. (0292) 421226 Fax. (0292) 425006, https://kejari-grobogan.kejaksaan.go.id/',
} as const;

export const DEFAULT_EMBLEM_URL = '/assets/aistudio/download_b9ef3c52.png';

export const GATRA_LOGO_URL = '/assets/aistudio/Logo_Gatra_8b1c2be9.png';

export const MEDIA_SIMPAN_VITAL_OPTIONS = [
  'Kertas',
  'Digital / Elektronik',
  'Kertas & Digital',
  'Mikrofilm / Foto',
] as const;

export const JANGKA_SIMPAN_VITAL_OPTIONS = [
  'Permanen',
  'Selama Berlaku / Aktif',
  'Sesuai JRA',
] as const;

export const METODE_PERLINDUNGAN_VITAL_OPTIONS = [
  'Vaulting & Alih Media: Disimpan di dalam Brankas Besi Tahan Api (Fireproof Safe) dengan kunci kombinasi berakses terbatas, serta diduplikasi dalam bentuk salinan digital (pindaian PDF resolusi tinggi)',
  'Duplikasi / Backup Digital',
  'Brankas Tahan Api (Vaulting)',
  'Enkripsi & Cloud Backup',
  'Penyimpanan Off-Site',
] as const;

export const TINGKAT_KERAWANAN_VITAL_OPTIONS = ['Sangat Vital', 'Vital'] as const;

export const METODE_PEMUSNAHAN_OPTIONS = [
  'Peleburan / Pulping',
  'Pencacahan',
  'Pembakaran',
  'Lainnya',
] as const;

export const DOKUMEN_KEARSIPAN_CATEGORIES = [
  'BA Pemindahan Arsip',
  'BA & Laporan Pemusnahan Arsip',
  'Surat Persetujuan ANRI',
  'BA Penyerahan Arsip Statis',
  'Daftar Arsip Disahkan',
  'SK / Laporan Kearsipan Lainnya',
] as const;

export const MAX_DOKUMEN_FILE_BYTES = 750 * 1024;
export const MAX_DOKUMEN_BASE64_LENGTH = 1030000;

