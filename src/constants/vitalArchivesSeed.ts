import { BidangId } from '../types/archive';

export interface VitalArchiveSeedRow {
  docId: string;
  nomor: number;
  uraian: string;
  bidang: BidangId;
  kurunWaktu: number;
  mediaSimpan: string;
  jumlah: string;
  jangkaSimpan: string;
  lokasiSimpan: string;
  metodePerlindungan: string;
  keterangan: string;
}

const DEFAULT_METODE_BMN =
  'Vaulting & Alih Media: Disimpan di dalam Brankas Besi Tahan Api (Fireproof Safe) dengan kunci kombinasi berakses terbatas, serta diduplikasi dalam bentuk salinan digital (pindaian PDF resolusi tinggi)';

const DEFAULT_KETERANGAN_BMN =
  'Bukti otentik kepemilikan sah atas tanah negara. Ketiadaannya berakibat fatal berupa hilangnya kepastian hukum kepemilikan aset dan memicu sengketa lahan.';

const RAW_VITAL_ENTRIES: Array<{
  nomor: number;
  uraian: string;
  kurunWaktu: number;
}> = [
  {
    nomor: 1,
    uraian:
      'Sertifikat Hak Pakai No. 18 Tahun 1978 Tanah Bangunan Kantor Kejaksaan Negeri Grobogan di Jl. Bhayangkara No. 1, Purwodadi',
    kurunWaktu: 1978,
  },
  {
    nomor: 2,
    uraian:
      'Sertifikat Hak Pakai No. 3 Tahun 1985 Tanah Bangunan Rumah Dinas Kepala Kejaksaan Negeri Grobogan di Area Simpang Lima Purwodadi',
    kurunWaktu: 1985,
  },
  {
    nomor: 3,
    uraian:
      'Sertifikat Hak Pakai No. 103 Tahun 2003 Tanah Bangunan Rumah Dinas Kepala Seksi Kejaksaan Negeri Grobogan di Jl. Ampera 8 Purwodadai',
    kurunWaktu: 2003,
  },
  {
    nomor: 4,
    uraian:
      'Sertifikat Hak Pakai No. 122 Tahun 2007 Tanah Bangunan Kantor Kejaksaan Negeri Grobogan di KS Tubun',
    kurunWaktu: 2007,
  },
  {
    nomor: 5,
    uraian: 'STNK Mobil Toyota Kijang Innova V 2011 K 1606 XF',
    kurunWaktu: 2022,
  },
  {
    nomor: 6,
    uraian: 'STNK Mobil Toyota Hilux 2.0 L M/T 2011 K 1658 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 7,
    uraian: 'STNK Mobil Toyota New Avanza 1.3 G 2013 K 1662 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 8,
    uraian: 'STNK Mobil Toyota Kijang Innova 2.0 G 2013 K 1745 XF',
    kurunWaktu: 2024,
  },
  {
    nomor: 9,
    uraian: 'STNK Sepeda Motor Honda Vario 150 eSP 2020 K 6038 XF',
    kurunWaktu: 2026,
  },
  {
    nomor: 10,
    uraian: 'STNK Sepeda Motor Honda Vario 150 eSP 2020 K 6039 XF',
    kurunWaktu: 2026,
  },
  {
    nomor: 11,
    uraian: 'STNK Sepeda Motor Yamaha NMAX 155 New 2023 K 6152 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 12,
    uraian: 'STNK Sepeda Motor Yamaha NMAX 155 New 2023 K 6154 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 13,
    uraian: 'STNK Sepeda Motor Yamaha NMAX 155 New 2023 K 6155 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 14,
    uraian: 'STNK Mobil Daihatsu Gran Max Pick Up (PU) 1.5 AC PS 2021 K 8017 XF',
    kurunWaktu: 2021,
  },
  {
    nomor: 15,
    uraian: 'STNK Mobil Hilux Pick Up 2.0 M/T 2023 K 8503 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 16,
    uraian: 'STNK Mobil Chevrolet Captiva 2.4L 2011 K 1520 XF',
    kurunWaktu: 2025,
  },
  {
    nomor: 17,
    uraian: 'STNK Sepeda Motor Yamaha NMAX 155 New 2023 K 6139 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 18,
    uraian: 'BPKB Mobil Honda CRV 2.0 CVT CKD 2017 K 5 F',
    kurunWaktu: 2017,
  },
  {
    nomor: 19,
    uraian: 'BPKB Mobil Toyota Kijang Innova 2.4 G M/T 2022 K 1085 XF',
    kurunWaktu: 2022,
  },
  {
    nomor: 20,
    uraian: 'BPKB Mobil Chevrolet Captiva 2.4L A/T FL 2011 K 1520 XF',
    kurunWaktu: 2011,
  },
  {
    nomor: 21,
    uraian: 'BPKB Mobil Toyota Kijang Innova V 2011 K 3 F',
    kurunWaktu: 2011,
  },
  {
    nomor: 22,
    uraian: 'BPKB Mobil Toyota Hilux PU 2.0L MT 2011 K 9501 RF',
    kurunWaktu: 2011,
  },
  {
    nomor: 23,
    uraian: 'BPKB Mobil Toyota New Avanza 1.3 G MT 2013 K 9504 SF',
    kurunWaktu: 2013,
  },
  {
    nomor: 24,
    uraian: 'BPKB Mobil Toyota Kijang Innova 2.0 G MT 2018 K 9515 AF',
    kurunWaktu: 2018,
  },
  {
    nomor: 25,
    uraian: 'BPKB Sepeda Motor Honda Vario 150 eSP 2020 K 6038 XF',
    kurunWaktu: 2020,
  },
  {
    nomor: 26,
    uraian: 'BPKB Sepeda Motor Honda Vario 150 eSP 2020 K 6039 XF',
    kurunWaktu: 2020,
  },
  {
    nomor: 27,
    uraian: 'BPKB Sepeda Motor Yamaha NMAX New 2023 K 6139 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 28,
    uraian: 'BPKB Sepeda Motor Yamaha NMAX New 2023 K 6152 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 29,
    uraian: 'BPKB Sepeda Motor Yamaha NMAX New 2023 K 6153 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 30,
    uraian: 'BPKB Sepeda Motor Yamaha NMAX New 2023 K 6154 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 31,
    uraian: 'BPKB Sepeda Motor Yamaha NMAX New 2023 K 6155 XF',
    kurunWaktu: 2023,
  },
  {
    nomor: 32,
    uraian: 'BPKB Mobil Tahanan Daihatsu Gran Max Pickup (PU) 1.5 2018 K 9599 DF',
    kurunWaktu: 2023,
  },
  {
    nomor: 33,
    uraian: 'BPKB Mobil Hilux Pick Up 2.0 M.T 2023 K 8503 XF',
    kurunWaktu: 2023,
  },
];

export const INITIAL_VITAL_ARCHIVES_SEED: VitalArchiveSeedRow[] = RAW_VITAL_ENTRIES.map(
  (row) => ({
    docId: `vital_kejari_${String(row.nomor).padStart(2, '0')}`,
    nomor: row.nomor,
    uraian: row.uraian,
    bidang: 'pembinaan',
    kurunWaktu: row.kurunWaktu,
    mediaSimpan: 'Kertas',
    jumlah: '1 Berkas',
    jangkaSimpan: 'Permanen',
    lokasiSimpan: 'Brankas Utama BMN',
    metodePerlindungan: DEFAULT_METODE_BMN,
    keterangan: DEFAULT_KETERANGAN_BMN,
  })
);
