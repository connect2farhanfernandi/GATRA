import { DEFAULT_EMBLEM_URL, OFFICIAL_KOP_SURAT } from '../constants/bidang';

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const LAMPIRAN_12_HEADERS = [
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

function buildKopSuratHtml(emblemDataUri: string | null): string {
  const logoCell = emblemDataUri
    ? `<td style="width:82px; vertical-align:middle; text-align:center; border:none; padding:0 10px 0 0;">
        <img src="${emblemDataUri}" width="72" height="72" alt="Logo Kejaksaan RI" style="width:72px; height:72px;" />
      </td>`
    : '';

  return `
    <table style="width:100%; border-collapse:collapse; border:none; border-bottom:3px double #000000; margin-bottom:16px;">
      <tr>
        ${logoCell}
        <td style="text-align:center; vertical-align:middle; border:none; padding-bottom:8px; line-height:1.25;">
          <div style="font-size:13pt; font-weight:bold; letter-spacing:0.5px;">${OFFICIAL_KOP_SURAT.namaKejaksaanRI}</div>
          <div style="font-size:12pt; font-weight:bold;">${OFFICIAL_KOP_SURAT.namaKejati}</div>
          <div style="font-size:14pt; font-weight:bold;">${OFFICIAL_KOP_SURAT.namaInstansi}</div>
          <div style="font-size:9.5pt;">${OFFICIAL_KOP_SURAT.alamat}</div>
          <div style="font-size:9.5pt;">${OFFICIAL_KOP_SURAT.teleponFaxWebsite}</div>
        </td>
      </tr>
    </table>
  `;
}

function buildSignature2x2Table(labels: {
  pihak1Jabatan: string;
  pihak2Jabatan: string;
  saksi1Ket: string;
  saksi2Ket: string;
}): string {
  return `
    <table style="width:100%; border-collapse:collapse; border:none; margin-top:26px; font-size:11pt; line-height:1.35;">
      <tr>
        <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:8px 12px 24px 12px;">
          <div style="font-weight:bold;">PIHAK PERTAMA</div>
          <div>${labels.pihak1Jabatan}</div>
          <div style="height:64px;">&nbsp;</div>
          <div>( ........................................ )</div>
          <div>NIP. ........................................</div>
        </td>
        <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:8px 12px 24px 12px;">
          <div style="font-weight:bold;">PIHAK KEDUA</div>
          <div>${labels.pihak2Jabatan}</div>
          <div style="height:64px;">&nbsp;</div>
          <div>( ........................................ )</div>
          <div>NIP. ........................................</div>
        </td>
      </tr>
      <tr>
        <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:12px 12px 8px 12px;">
          <div style="font-weight:bold;">SAKSI I</div>
          <div>${labels.saksi1Ket}</div>
          <div style="height:64px;">&nbsp;</div>
          <div>( ........................................ )</div>
          <div>NIP. ........................................</div>
        </td>
        <td style="width:50%; text-align:center; vertical-align:top; border:none; padding:12px 12px 8px 12px;">
          <div style="font-weight:bold;">SAKSI II</div>
          <div>${labels.saksi2Ket}</div>
          <div style="height:64px;">&nbsp;</div>
          <div>( ........................................ )</div>
          <div>NIP. ........................................</div>
        </td>
      </tr>
    </table>
  `;
}

function buildLampiran12KolomHtml(judulLampiran: string): string {
  const headerCells = LAMPIRAN_12_HEADERS.map(
    (h) =>
      `<th style="border:1px solid #000000; padding:5px 4px; background-color:#F1F5F9; font-weight:bold; text-align:center; font-size:8.5pt;">${h}</th>`
  ).join('');

  const emptyRows = Array.from({ length: 12 }, (_, idx) => {
    const cells = LAMPIRAN_12_HEADERS.map((_, colIdx) => {
      if (colIdx === 0) {
        return `<td style="border:1px solid #000000; padding:6px 4px; text-align:center; font-size:8.5pt;">${idx + 1}</td>`;
      }
      return `<td style="border:1px solid #000000; padding:6px 4px; font-size:8.5pt;">&nbsp;</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <br clear="all" style="page-break-before:always; mso-break-type:section-break;" />
    <div style="page-break-before:always;">
      <div style="text-align:center; margin-bottom:14px; line-height:1.4;">
        <div style="font-size:12pt; font-weight:bold;">${judulLampiran}</div>
        <div style="font-size:11pt;">Nomor : ........................................</div>
        <div style="font-size:10.5pt; font-weight:bold; margin-top:4px;">Unit Pengolah / Bidang : ........................................</div>
      </div>

      <table style="width:100%; border-collapse:collapse; border:1px solid #000000; font-size:8.5pt;">
        <thead>
          <tr>${headerCells}</tr>
        </thead>
        <tbody>
          ${emptyRows}
        </tbody>
      </table>
    </div>
  `;
}

function wrapWordDocumentHtml(title: string, bodyContent: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page {
    size: A4 portrait;
    margin: 2cm 2cm 2cm 2cm;
  }
  body {
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    color: #000000;
    line-height: 1.5;
  }
  p {
    margin: 0 0 10px 0;
    text-align: justify;
  }
</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

function triggerWordDocDownload(filename: string, htmlContent: string): void {
  const blob = new Blob(['\uFEFF' + htmlContent], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.doc') ? filename : `${filename}.doc`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function downloadBaPemindahanDoc(): Promise<void> {
  const emblemDataUri = await fetchImageAsDataUri(DEFAULT_EMBLEM_URL);
  const kop = buildKopSuratHtml(emblemDataUri);
  const ttd = buildSignature2x2Table({
    pihak1Jabatan: 'Kepala Seksi / Kepala Sub Bagian ....................',
    pihak2Jabatan: 'Kepala Sub Bagian Pembinaan',
    saksi1Ket: 'Staf Unit Pengolah (....................)',
    saksi2Ket: 'Staf Unit Kearsipan (Sub Bagian Pembinaan)',
  });
  const lampiran = buildLampiran12KolomHtml('LAMPIRAN BERITA ACARA PEMINDAHAN ARSIP');

  const body = `
    ${kop}
    <div style="text-align:center; margin:16px 0 18px 0;">
      <div style="font-size:13pt; font-weight:bold; text-decoration:underline;">BERITA ACARA PEMINDAHAN ARSIP</div>
      <div style="font-size:11pt; margin-top:2px;">Nomor : ........................................</div>
    </div>

    <p>
      Pada hari ini ................ tanggal ........ bulan ................ tahun ........, bertempat di Kantor ${OFFICIAL_KOP_SURAT.namaInstansi}, ${OFFICIAL_KOP_SURAT.alamat}, kami yang bertanda tangan di bawah ini:
    </p>

    <table style="width:100%; border-collapse:collapse; border:none; margin:8px 0 10px 18px; font-size:11pt; line-height:1.5;">
      <tr>
        <td style="width:95px; border:none; padding:2px 0;">Nama</td>
        <td style="width:14px; border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">Jabatan</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">Kepala Seksi / Kepala Sub Bagian ....................................</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">NIP</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
    </table>
    <p>
      Dalam hal ini bertindak untuk dan atas nama Unit Pengolah (Central File), yang selanjutnya disebut sebagai <strong>PIHAK PERTAMA</strong>.
    </p>

    <table style="width:100%; border-collapse:collapse; border:none; margin:8px 0 10px 18px; font-size:11pt; line-height:1.5;">
      <tr>
        <td style="width:95px; border:none; padding:2px 0;">Nama</td>
        <td style="width:14px; border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">Jabatan</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">Kepala Sub Bagian Pembinaan (Penanggung Jawab Unit Kearsipan)</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">NIP</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
    </table>
    <p>
      Dalam hal ini bertindak untuk dan atas nama Unit Kearsipan (Record Center) Kejaksaan Negeri Grobogan, yang selanjutnya disebut sebagai <strong>PIHAK KEDUA</strong>.
    </p>

    <p>
      <strong>PIHAK PERTAMA</strong> telah menyerahkan arsip inaktif kepada <strong>PIHAK KEDUA</strong> dalam keadaan baik/rusak* sebanyak ........ (................) berkas dalam ........ (................) boks arsip, sebagaimana tercantum dalam Daftar Arsip Inaktif yang Dipindahkan terlampir.
    </p>
    <p>
      Demikian Berita Acara Pemindahan Arsip ini dibuat dengan sesungguhnya dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya, dan masing-masing pihak menerima satu rangkap yang mempunyai kekuatan hukum yang sama.
    </p>

    ${ttd}
    ${lampiran}
  `;

  const html = wrapWordDocumentHtml('Format Berita Acara Pemindahan Arsip', body);
  triggerWordDocDownload('Format_BA_Pemindahan_Arsip_Kejari_Grobogan.doc', html);
}

export async function downloadBaPemusnahanDoc(): Promise<void> {
  const emblemDataUri = await fetchImageAsDataUri(DEFAULT_EMBLEM_URL);
  const kop = buildKopSuratHtml(emblemDataUri);
  const ttd = buildSignature2x2Table({
    pihak1Jabatan: 'Ketua Panitia Penilai Arsip / Kasubbag Pembinaan',
    pihak2Jabatan: 'Perwakilan Unit Pengolah (....................)',
    saksi1Ket: 'Unsur Pengawasan / Pembinaan',
    saksi2Ket: 'Unsur Unit Kearsipan',
  });
  const lampiran = buildLampiran12KolomHtml('LAMPIRAN BERITA ACARA PEMUSNAHAN ARSIP');

  const body = `
    ${kop}
    <div style="text-align:center; margin:16px 0 18px 0;">
      <div style="font-size:13pt; font-weight:bold; text-decoration:underline;">BERITA ACARA PEMUSNAHAN ARSIP</div>
      <div style="font-size:11pt; margin-top:2px;">Nomor : ........................................</div>
    </div>

    <p>
      Pada hari ini ................ tanggal ........ bulan ................ tahun ........, bertempat di Kantor ${OFFICIAL_KOP_SURAT.namaInstansi}, ${OFFICIAL_KOP_SURAT.alamat}, kami yang bertanda tangan di bawah ini berdasarkan Surat Persetujuan Kepala Arsip Nasional Republik Indonesia (ANRI) Nomor ........................................ tanggal ........................................ telah melaksanakan pemusnahan arsip yang telah habis masa retensinya dan tidak memiliki nilai guna lagi:
    </p>

    <table style="width:100%; border-collapse:collapse; border:none; margin:8px 0 10px 18px; font-size:11pt; line-height:1.5;">
      <tr>
        <td style="width:95px; border:none; padding:2px 0;">Nama</td>
        <td style="width:14px; border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">Jabatan</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">Ketua Panitia Penilai Arsip / Kepala Sub Bagian Pembinaan</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">NIP</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
    </table>
    <p>
      Yang selanjutnya disebut sebagai <strong>PIHAK PERTAMA</strong>.
    </p>

    <table style="width:100%; border-collapse:collapse; border:none; margin:8px 0 10px 18px; font-size:11pt; line-height:1.5;">
      <tr>
        <td style="width:95px; border:none; padding:2px 0;">Nama</td>
        <td style="width:14px; border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">Jabatan</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">Perwakilan Unit Pengolah / Bidang ....................................</td>
      </tr>
      <tr>
        <td style="border:none; padding:2px 0;">NIP</td>
        <td style="border:none; padding:2px 0;">:</td>
        <td style="border:none; padding:2px 0;">............................................................</td>
      </tr>
    </table>
    <p>
      Yang selanjutnya disebut sebagai <strong>PIHAK KEDUA</strong>.
    </p>

    <p>
      Pemusnahan arsip dilaksanakan terhadap ........ (................) berkas arsip sebagaimana tercantum dalam Daftar Pertelaan Arsip Terlampir, dengan metode pemusnahan berupa ........................................ sehingga tidak dapat dikenali baik isi maupun bentuk fisiknya, disaksikan oleh dua orang saksi.
    </p>
    <p>
      Demikian Berita Acara Pemusnahan Arsip ini dibuat dengan sesungguhnya dalam rangkap 2 (dua) untuk dipergunakan sebagaimana mestinya dan sebagai bukti pertanggungjawaban hukum penyusutan arsip di lingkungan ${OFFICIAL_KOP_SURAT.namaInstansi}.
    </p>

    ${ttd}
    ${lampiran}
  `;

  const html = wrapWordDocumentHtml('Format Berita Acara Pemusnahan Arsip', body);
  triggerWordDocDownload('Format_BA_Pemusnahan_Arsip_Kejari_Grobogan.doc', html);
}
