import { BidangId } from '../types/archive';

export interface InfographicBidangStat {
  id: BidangId;
  nama: string;
  singkatan: string;
  count: number;
  bgHex: string;
  borderHex: string;
  needsDarkBorder: boolean;
}

export interface InfographicStatusStat {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export interface InfographicSnapshot {
  bidangLabel: string;
  tahunLabel: string;
  periodeInputLabel: string;
  tanggalCetak: string;
  emblemUrl: string;
  gatraLogoUrl: string;
  totalArsipFisik: number;
  aktifCount: number;
  inaktifCount: number;
  siapSusutCount: number;
  usulMusnahCount: number;
  statisCount: number;
  musnahCount: number;
  inaktifTanpaBoks: number;
  retensi6BulanTotal: number;
  retensi6BulanMusnah: number;
  retensi6BulanStatis: number;
  bidangStats: InfographicBidangStat[];
  statusDistribution: InfographicStatusStat[];
}

export const INFOGRAPHIC_WIDTH = 1200;
export const INFOGRAPHIC_HEIGHT = 1500;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2
): number {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  lines.forEach((line, idx) => {
    let output = line;
    if (idx === maxLines - 1 && ctx.measureText(output).width > maxWidth) {
      while (output.length > 3 && ctx.measureText(`${output}...`).width > maxWidth) {
        output = output.slice(0, -1);
      }
      output = `${output}...`;
    }
    ctx.fillText(output, x, y + idx * lineHeight);
  });

  return lines.length;
}

function loadImageSafe(src: string, timeoutMs = 3500): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('/')) {
      img.crossOrigin = 'anonymous';
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      }
    };
    img.src = src;
  });
}

function drawImageContained(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
): void {
  const ratio = Math.min(boxW / img.width, boxH / img.height);
  const drawW = img.width * ratio;
  const drawH = img.height * ratio;
  const dx = boxX + (boxW - drawW) / 2;
  const dy = boxY + (boxH - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);
}

function drawFallbackShield(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  stroke: string
): void {
  const half = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - half);
  ctx.lineTo(cx + half * 0.85, cy - half * 0.65);
  ctx.lineTo(cx + half * 0.75, cy + half * 0.25);
  ctx.quadraticCurveTo(cx, cy + half, cx, cy + half);
  ctx.quadraticCurveTo(cx, cy + half, cx - half * 0.75, cy + half * 0.25);
  ctx.lineTo(cx - half * 0.85, cy - half * 0.65);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
}

export async function renderInfographicToCanvas(
  snapshot: InfographicSnapshot
): Promise<HTMLCanvasElement> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Abaikan jika browser tidak mendukung FontFaceSet.ready
    }
  }

  const [emblemImg, gatraImg] = await Promise.all([
    loadImageSafe(snapshot.emblemUrl),
    loadImageSafe(snapshot.gatraLogoUrl),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = INFOGRAPHIC_WIDTH;
  canvas.height = INFOGRAPHIC_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser tidak mendukung rendering HTML5 Canvas 2D.');
  }

  const DISPLAY_FONT = "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
  const BODY_FONT = "'DM Sans', system-ui, -apple-system, sans-serif";
  const MONO_FONT = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

  // Latar utama poster
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, INFOGRAPHIC_WIDTH, INFOGRAPHIC_HEIGHT);

  // =========================================================================
  // 1. HEADER HIJAU TUA KEJAKSAAN & AKSEN EMAS (0..256)
  // =========================================================================
  const headerHeight = 256;
  const headerGrad = ctx.createLinearGradient(0, 0, INFOGRAPHIC_WIDTH, headerHeight);
  headerGrad.addColorStop(0, '#022C22');
  headerGrad.addColorStop(0.55, '#064E3B');
  headerGrad.addColorStop(1, '#065F46');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, INFOGRAPHIC_WIDTH, headerHeight);

  // Aksen geometris halus di sudut kanan atas header
  ctx.save();
  ctx.fillStyle = 'rgba(250, 204, 21, 0.06)';
  ctx.beginPath();
  ctx.arc(1110, 46, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1010, 195, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Garis aksen emas di bagian bawah header
  const goldGrad = ctx.createLinearGradient(0, 0, INFOGRAPHIC_WIDTH, 0);
  goldGrad.addColorStop(0, '#CA8A04');
  goldGrad.addColorStop(0.5, '#FDE047');
  goldGrad.addColorStop(1, '#CA8A04');
  ctx.fillStyle = goldGrad;
  ctx.fillRect(0, headerHeight - 6, INFOGRAPHIC_WIDTH, 6);

  // Container Logo Ganda (Emblem Kejaksaan RI + Logo GATRA)
  drawRoundedRect(ctx, 56, 32, 204, 112, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.75)';
  ctx.stroke();

  if (emblemImg) {
    drawImageContained(ctx, emblemImg, 68, 44, 82, 88);
  } else {
    drawFallbackShield(ctx, 109, 88, 60, '#064E3B', '#EAB308');
  }

  // Divider tipis antar kedua logo
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(158, 50, 1.5, 76);

  if (gatraImg) {
    drawImageContained(ctx, gatraImg, 168, 44, 80, 88);
  } else {
    ctx.fillStyle = '#065F46';
    ctx.font = `800 18px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('GATRA', 208, 94);
    ctx.textAlign = 'left';
  }

  // Judul Utama Header
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = '#FDE047';
  ctx.font = `700 17px ${DISPLAY_FONT}`;
  ctx.fillText('KEJAKSAAN NEGERI GROBOGAN  —  GATRA 2.0', 286, 62);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 39px ${DISPLAY_FONT}`;
  ctx.fillText('INFOGRAFIS PENGELOLAAN ARSIP', 286, 110);

  ctx.fillStyle = '#D1FAE5';
  ctx.font = `500 17px ${BODY_FONT}`;
  ctx.fillText(
    'Gerbang Arsip Terpadu  ·  Ringkasan Kinerja & Daur Hidup Kearsipan 6 Bidang',
    286,
    140
  );

  // Baris Metadata Filter, Periode Penginputan & Tanggal Pencetakan
  drawRoundedRect(ctx, 56, 160, 1088, 72, 10);
  ctx.fillStyle = 'rgba(2, 44, 34, 0.58)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.35)';
  ctx.stroke();

  ctx.fillStyle = '#FEF9C3';
  ctx.font = `600 15.5px ${BODY_FONT}`;
  const metaLineTop = `Bidang: ${snapshot.bidangLabel}    •    Kurun Waktu: ${snapshot.tahunLabel}`;
  ctx.fillText(metaLineTop, 78, 188);

  ctx.fillStyle = '#ECFDF5';
  ctx.font = `500 15px ${BODY_FONT}`;
  const metaLineBottom = `Periode Penginputan: ${snapshot.periodeInputLabel}    •    Tanggal Cetak: ${snapshot.tanggalCetak}`;
  ctx.fillText(metaLineBottom, 78, 216);

  // =========================================================================
  // 2. STATISTIK UTAMA — 4 KARTU KPI FISIK + 1 KARTU ARSIP TELAH DIMUSNAHKAN
  // =========================================================================
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 20px ${DISPLAY_FONT}`;
  ctx.fillText('Statistik Utama Kearsipan', 56, 294);

  ctx.fillStyle = '#64748B';
  ctx.font = `400 15px ${BODY_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('Data real-time sesuai filter aktif Dashboard Eksekutif', 1144, 294);
  ctx.textAlign = 'left';

  const kpiCards = [
    {
      title: 'TOTAL ARSIP FISIK TERSIMPAN',
      value: snapshot.totalArsipFisik,
      sub: 'Aktif, Inaktif & Siap Susut (tidak termasuk arsip Musnah)',
      bg: '#F1F5F9',
      border: '#CBD5E1',
      titleColor: '#475569',
      valueColor: '#0F172A',
      accent: '#334155',
    },
    {
      title: 'ARSIP AKTIF (CENTRAL FILE)',
      value: snapshot.aktifCount,
      sub: 'Masih dikelola langsung oleh unit pengolah',
      bg: '#ECFDF5',
      border: '#A7F3D0',
      titleColor: '#065F46',
      valueColor: '#047857',
      accent: '#16A34A',
    },
    {
      title: 'ARSIP INAKTIF (RECORD CENTER)',
      value: snapshot.inaktifCount,
      sub: 'Masa simpan inaktif pada Record Center',
      bg: '#FFFBEB',
      border: '#FDE68A',
      titleColor: '#92400E',
      valueColor: '#B45309',
      accent: '#D97706',
    },
    {
      title: 'ARSIP SIAP SUSUT',
      value: snapshot.siapSusutCount,
      sub: `Usul Musnah (${snapshot.usulMusnahCount}) & Arsip Statis (${snapshot.statisCount})`,
      bg: '#FEF2F2',
      border: '#FECACA',
      titleColor: '#991B1B',
      valueColor: '#B91C1C',
      accent: '#DC2626',
    },
  ];

  const kpiCardW = 532;
  const kpiCardH = 104;
  const kpiGapX = 24;
  const kpiGapY = 14;
  const kpiStartY = 310;

  kpiCards.forEach((card, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const x = 56 + col * (kpiCardW + kpiGapX);
    const y = kpiStartY + row * (kpiCardH + kpiGapY);

    drawRoundedRect(ctx, x, y, kpiCardW, kpiCardH, 14);
    ctx.fillStyle = card.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = card.border;
    ctx.stroke();

    // Aksen kotak indikator halus di kanan kartu
    drawRoundedRect(ctx, x + kpiCardW - 58, y + 18, 36, 36, 9);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fill();
    ctx.fillStyle = card.accent;
    ctx.beginPath();
    ctx.arc(x + kpiCardW - 40, y + 36, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = card.titleColor;
    ctx.font = `700 13px ${DISPLAY_FONT}`;
    ctx.fillText(card.title, x + 22, y + 29);

    ctx.fillStyle = card.valueColor;
    ctx.font = `700 36px ${MONO_FONT}`;
    const safeCardValue = Number.isFinite(Number(card.value)) ? Number(card.value) : 0;
    ctx.fillText(String(safeCardValue.toLocaleString('id-ID')), x + 22, y + 70);

    ctx.fillStyle = '#475569';
    ctx.font = `500 13.5px ${BODY_FONT}`;
    ctx.fillText(card.sub, x + 22, y + 92);
  });

  // Kartu Indikator Terpisah: ARSIP TELAH DIMUSNAHKAN (546..614)
  const musnahCardY = 546;
  const musnahCardH = 68;
  drawRoundedRect(ctx, 56, musnahCardY, 1088, musnahCardH, 14);
  ctx.fillStyle = '#0F172A';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#334155';
  ctx.stroke();

  drawRoundedRect(ctx, 76, musnahCardY + 17, 10, 34, 4);
  ctx.fillStyle = '#FACC15';
  ctx.fill();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = `700 15px ${DISPLAY_FONT}`;
  ctx.fillText(
    'ARSIP TELAH DIMUSNAHKAN (HISTORI & BUKTI HUKUM PERSETUJUAN ANRI)',
    102,
    musnahCardY + 30
  );

  ctx.fillStyle = '#CBD5E1';
  ctx.font = `400 13.5px ${BODY_FONT}`;
  ctx.fillText(
    'Terkunci Read-Only permanen sebagai bukti legalitas penyusutan; tidak dihitung dalam Total Arsip Fisik Tersimpan maupun Siap Susut.',
    102,
    musnahCardY + 52
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FDE047';
  ctx.font = `700 28px ${MONO_FONT}`;
  ctx.fillText(
    `${snapshot.musnahCount.toLocaleString('id-ID')} berkas`,
    1120,
    musnahCardY + 44
  );
  ctx.textAlign = 'left';

  // =========================================================================
  // 3. GRAFIK SEBARAN PER BIDANG — HORIZONTAL BAR CHART (634..1008)
  // =========================================================================
  const barSectionY = 634;
  const barSectionH = 374;
  drawRoundedRect(ctx, 56, barSectionY, 1088, barSectionH, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = `700 20px ${DISPLAY_FONT}`;
  ctx.fillText('Sebaran Arsip Fisik Tersimpan per Bidang (6 Unit Kerja)', 84, barSectionY + 38);

  ctx.fillStyle = '#64748B';
  ctx.font = `400 14px ${BODY_FONT}`;
  ctx.fillText(
    'Warna batang mengikuti kode warna baku masing-masing bidang Kejaksaan Negeri Grobogan (tidak termasuk arsip Musnah)',
    84,
    barSectionY + 62
  );

  const maxBidangCount = Math.max(1, ...snapshot.bidangStats.map((b) => b.count));
  const trackX = 376;
  const trackW = 576;
  const rowStartY = barSectionY + 88;
  const rowStepY = 45;

  snapshot.bidangStats.forEach((b, idx) => {
    const ry = rowStartY + idx * rowStepY;

    // Swatch warna di sebelah nama bidang
    drawRoundedRect(ctx, 84, ry + 5, 18, 18, 4);
    ctx.fillStyle = b.bgHex;
    ctx.fill();
    ctx.lineWidth = b.needsDarkBorder ? 1.75 : 1.2;
    ctx.strokeStyle = b.needsDarkBorder ? '#0F172A' : b.borderHex;
    ctx.stroke();

    // Label Bidang
    ctx.fillStyle = '#1E293B';
    ctx.font = `600 15px ${BODY_FONT}`;
    const displayLabel =
      b.id === 'pembinaan'
        ? 'Sub Bagian Pembinaan'
        : b.id === 'datun'
          ? 'Datun (Perdata & TUN)'
          : b.id === 'papbb'
            ? 'PAPBB (Barang Bukti)'
            : b.id === 'pidum'
              ? 'Pidana Umum (Pidum)'
              : b.id === 'pidsus'
                ? 'Pidana Khusus (Pidsus)'
                : 'Intelijen';
    ctx.fillText(displayLabel, 114, ry + 20);

    // Track latar belakang batang
    drawRoundedRect(ctx, trackX, ry + 1, trackW, 26, 7);
    ctx.fillStyle = '#F1F5F9';
    ctx.fill();

    // Batang nilai aktual
    if (b.count > 0) {
      const fillW = Math.max(20, (b.count / maxBidangCount) * trackW);
      drawRoundedRect(ctx, trackX, ry + 1, fillW, 26, 7);
      ctx.fillStyle = b.bgHex;
      ctx.fill();
      ctx.lineWidth = b.needsDarkBorder ? 2 : 1.5;
      ctx.strokeStyle = b.needsDarkBorder ? '#0F172A' : b.borderHex;
      ctx.stroke();
    }

    // Angka & persentase di sebelah kanan
    const pct = snapshot.totalArsipFisik > 0 ? (b.count / snapshot.totalArsipFisik) * 100 : 0;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = `700 15px ${MONO_FONT}`;
    ctx.fillText(`${b.count.toLocaleString('id-ID')} berkas`, 1052, ry + 20);

    ctx.fillStyle = '#64748B';
    ctx.font = `500 14px ${MONO_FONT}`;
    ctx.fillText(`(${pct.toFixed(1)}%)`, 1116, ry + 20);
    ctx.textAlign = 'left';
  });

  // =========================================================================
  // 4. KOMPOSISI DAUR HIDUP & CATATAN OPERASIONAL (1028..1404)
  // =========================================================================
  const bottomY = 1028;
  const bottomH = 376;

  // Kolom Kiri: Komposisi Daur Hidup (Arsip Fisik Tersimpan)
  const leftX = 56;
  const leftW = 552;
  drawRoundedRect(ctx, leftX, bottomY, leftW, bottomH, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = `700 19px ${DISPLAY_FONT}`;
  ctx.fillText('Komposisi Daur Hidup Arsip Fisik', leftX + 26, bottomY + 38);

  ctx.fillStyle = '#64748B';
  ctx.font = `400 14px ${BODY_FONT}`;
  ctx.fillText(
    'Proporsi arsip tersimpan (Aktif, Inaktif, Usul Musnah, Statis)',
    leftX + 26,
    bottomY + 62
  );

  // Stacked Horizontal Bar
  const stackX = leftX + 26;
  const stackY = bottomY + 84;
  const stackW = leftW - 52;
  const stackH = 26;

  drawRoundedRect(ctx, stackX, stackY, stackW, stackH, 8);
  ctx.fillStyle = '#E2E8F0';
  ctx.fill();

  if (snapshot.totalArsipFisik > 0) {
    ctx.save();
    drawRoundedRect(ctx, stackX, stackY, stackW, stackH, 8);
    ctx.clip();
    let cursorX = stackX;
    for (const seg of snapshot.statusDistribution) {
      if (seg.count <= 0) continue;
      const segW = (seg.count / snapshot.totalArsipFisik) * stackW;
      ctx.fillStyle = seg.color;
      ctx.fillRect(cursorX, stackY, segW + 0.5, stackH);
      cursorX += segW;
    }
    ctx.restore();
  }

  // Rincian 4 baris status daur hidup
  const legStartY = bottomY + 136;
  const legStepY = 54;
  snapshot.statusDistribution.forEach((seg, idx) => {
    const ly = legStartY + idx * legStepY;

    drawRoundedRect(ctx, leftX + 26, ly + 8, 16, 16, 4);
    ctx.fillStyle = seg.color;
    ctx.fill();

    ctx.fillStyle = '#1E293B';
    ctx.font = `600 15px ${BODY_FONT}`;
    ctx.fillText(seg.label, leftX + 54, ly + 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#0F172A';
    ctx.font = `700 16px ${MONO_FONT}`;
    ctx.fillText(`${seg.count.toLocaleString('id-ID')} berkas`, leftX + leftW - 102, ly + 22);

    ctx.fillStyle = '#475569';
    ctx.font = `600 15px ${MONO_FONT}`;
    ctx.fillText(`${seg.pct.toFixed(1)}%`, leftX + leftW - 26, ly + 22);
    ctx.textAlign = 'left';

    if (idx < snapshot.statusDistribution.length - 1) {
      ctx.fillStyle = '#F1F5F9';
      ctx.fillRect(leftX + 26, ly + 42, leftW - 52, 1);
    }
  });

  // Kolom Kanan: Catatan Perhatian & Tindak Lanjut
  const rightX = 632;
  const rightW = 512;
  drawRoundedRect(ctx, rightX, bottomY, rightW, bottomH, 16);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.font = `700 19px ${DISPLAY_FONT}`;
  ctx.fillText('Catatan & Tindak Lanjut Prioritas', rightX + 26, bottomY + 38);

  ctx.fillStyle = '#64748B';
  ctx.font = `400 14px ${BODY_FONT}`;
  ctx.fillText('Indikator penataan Record Center & persiapan penyusutan', rightX + 26, bottomY + 62);

  // Kotak 1: Inaktif Tanpa Nomor Boks
  const box1Y = bottomY + 84;
  const boxH = 124;
  drawRoundedRect(ctx, rightX + 26, box1Y, rightW - 52, boxH, 12);
  ctx.fillStyle = snapshot.inaktifTanpaBoks > 0 ? '#FFFBEB' : '#F0FDF4';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = snapshot.inaktifTanpaBoks > 0 ? '#FDE68A' : '#BBF7D0';
  ctx.stroke();

  ctx.fillStyle = snapshot.inaktifTanpaBoks > 0 ? '#92400E' : '#166534';
  ctx.font = `700 13px ${DISPLAY_FONT}`;
  ctx.fillText('ARSIP INAKTIF BELUM MEMILIKI NOMOR BOKS', rightX + 46, box1Y + 28);

  ctx.fillStyle = snapshot.inaktifTanpaBoks > 0 ? '#B45309' : '#15803D';
  ctx.font = `700 32px ${MONO_FONT}`;
  ctx.fillText(`${snapshot.inaktifTanpaBoks.toLocaleString('id-ID')} berkas`, rightX + 46, box1Y + 66);

  ctx.fillStyle = '#475569';
  ctx.font = `400 13px ${BODY_FONT}`;
  drawWrappedText(
    ctx,
    snapshot.inaktifTanpaBoks > 0
      ? 'Segera lakukan pelabelan & pengisian Nomor Boks pada menu Record Center.'
      : 'Seluruh arsip Inaktif pada cakupan filter ini telah tertata dengan Nomor Boks.',
    rightX + 46,
    box1Y + 92,
    rightW - 92,
    18,
    2
  );

  // Kotak 2: Retensi Inaktif Berakhir <= 6 Bulan
  const box2Y = box1Y + boxH + 16;
  const hasUpcoming = snapshot.retensi6BulanTotal > 0;
  drawRoundedRect(ctx, rightX + 26, box2Y, rightW - 52, boxH, 12);
  ctx.fillStyle = hasUpcoming ? '#FEF2F2' : '#F8FAFC';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = hasUpcoming ? '#FECACA' : '#CBD5E1';
  ctx.stroke();

  ctx.fillStyle = hasUpcoming ? '#991B1B' : '#334155';
  ctx.font = `700 13px ${DISPLAY_FONT}`;
  ctx.fillText('RETENSI INAKTIF BERAKHIR ≤ 6 BULAN KE DEPAN', rightX + 46, box2Y + 28);

  ctx.fillStyle = hasUpcoming ? '#B91C1C' : '#0F172A';
  ctx.font = `700 32px ${MONO_FONT}`;
  ctx.fillText(`${snapshot.retensi6BulanTotal.toLocaleString('id-ID')} berkas`, rightX + 46, box2Y + 66);

  ctx.fillStyle = '#475569';
  ctx.font = `500 13px ${BODY_FONT}`;
  drawWrappedText(
    ctx,
    hasUpcoming
      ? `Usul Musnah: ${snapshot.retensi6BulanMusnah} berkas  •  Penyerahan Arsip Statis: ${snapshot.retensi6BulanStatis} berkas.`
      : 'Tidak ada arsip inaktif yang masa retensinya berakhir dalam 6 bulan ke depan.',
    rightX + 46,
    box2Y + 92,
    rightW - 92,
    18,
    2
  );

  // =========================================================================
  // 5. FOOTER RESMI (1426..1480)
  // =========================================================================
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(56, 1426, 1088, 1.5);

  ctx.fillStyle = '#334155';
  ctx.font = `600 14px ${DISPLAY_FONT}`;
  ctx.fillText(
    'GATRA 2.0 — Gerbang Arsip Terpadu Kejaksaan Negeri Grobogan',
    56,
    1458
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = `500 14px ${MONO_FONT}`;
  ctx.fillText(`Dihasilkan: ${snapshot.tanggalCetak}`, 1144, 1458);
  ctx.textAlign = 'left';

  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Gagal mengonversi kanvas infografis menjadi file PNG.'));
          return;
        }
        resolve(blob);
      },
      'image/png',
      1
    );
  });
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
