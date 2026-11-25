import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface FirebaseClientConfig {
  apiKey: string;
  projectId: string;
}

function loadFirebaseConfig(): FirebaseClientConfig | null {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw) as FirebaseClientConfig;
    }
  } catch (err) {
    console.error('Failed to read firebase-applet-config.json:', err);
  }
  return null;
}

const firebaseConfig = loadFirebaseConfig();

async function verifyFirebaseToken(idToken: string): Promise<{ uid: string; email: string } | null> {
  if (!firebaseConfig?.apiKey || !idToken) {
    return null;
  }
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; email?: string; emailVerified?: boolean }>;
    };
    const user = data.users?.[0];
    if (!user?.localId || !user?.email || user.emailVerified !== true) {
      return null;
    }
    return { uid: user.localId, email: user.email };
  } catch {
    return null;
  }
}

interface JraCandidate {
  kodeKlasifikasi: string;
  uraian: string;
  bidang: string;
  retensiAktif: number;
  retensiInaktif: number;
  keteranganAkhir: string;
}

const VALID_BIDANG = new Set(['pembinaan', 'datun', 'papbb', 'pidum', 'pidsus', 'intelijen']);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/ai/recommend-jra', async (req, res) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const verifiedUser = await verifyFirebaseToken(token);
      if (!verifiedUser) {
        return res.status(401).json({ error: 'Autentikasi tidak valid atau email belum terverifikasi.' });
      }

      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
        return res.status(503).json({
          error: 'Kunci GEMINI_API_KEY belum dikonfigurasi pada panel Settings > Secrets.',
        });
      }

      const { uraian, bidang, candidates } = req.body as {
        uraian?: unknown;
        bidang?: unknown;
        candidates?: unknown;
      };

      if (typeof uraian !== 'string' || uraian.trim().length < 3 || uraian.length > 2000) {
        return res.status(400).json({ error: 'Uraian informasi arsip minimal 3 karakter (maksimal 2000).' });
      }
      if (typeof bidang !== 'string' || !VALID_BIDANG.has(bidang)) {
        return res.status(400).json({ error: 'Bidang tidak valid.' });
      }
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({
          error: 'Daftar Master JRA untuk bidang ini kosong. Silakan isi atau impor Master JRA terlebih dahulu.',
        });
      }

      const allowedCandidates: JraCandidate[] = candidates
        .filter((item): item is JraCandidate => {
          if (!item || typeof item !== 'object') return false;
          const obj = item as Record<string, unknown>;
          return (
            typeof obj.kodeKlasifikasi === 'string' &&
            obj.kodeKlasifikasi.trim().length > 0 &&
            typeof obj.uraian === 'string' &&
            typeof obj.bidang === 'string' &&
            (obj.bidang === bidang || obj.bidang === 'pembinaan')
          );
        })
        .slice(0, 400);

      if (allowedCandidates.length === 0) {
        return res.status(400).json({
          error: 'Tidak ada kode JRA yang valid untuk bidang terpilih maupun Sub Bagian Pembinaan.',
        });
      }

      const candidateMap = new Map<string, JraCandidate>();
      for (const c of allowedCandidates) {
        candidateMap.set(c.kodeKlasifikasi.trim().toLowerCase(), c);
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const catalogLines = allowedCandidates
        .map(
          (c, idx) =>
            `${idx + 1}. Kode: "${c.kodeKlasifikasi}" | Bidang: ${c.bidang} | Uraian: ${c.uraian} | Retensi: ${c.retensiAktif}th aktif / ${c.retensiInaktif}th inaktif (${c.keteranganAkhir})`
        )
        .join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Analisis uraian informasi arsip berikut dan pilih maksimal 3 Kode Klasifikasi yang paling relevan dari daftar resmi di bawah ini.\n\nURAIAN ARSIP:\n"${uraian.trim()}"\n\nDAFTAR RESMI KODE KLASIFIKASI JRA (HANYA BOLEH MEMILIH DARI DAFTAR INI):\n${catalogLines}`,
        config: {
          systemInstruction:
            'Anda adalah Arsiparis Ahli Kejaksaan Republik Indonesia. Tugas Anda mencocokkan uraian arsip dengan maksimal 3 Kode Klasifikasi dari daftar JRA yang diberikan. ATURAN MUTLAK: DILARANG KERAS mengarang, memodifikasi, atau menyebut kode klasifikasi yang tidak persis tertulis di daftar yang diberikan. Berikan alasan singkat dalam Bahasa Indonesia mengapa kode tersebut cocok.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    kodeKlasifikasi: {
                      type: Type.STRING,
                      description: 'Harus sama persis dengan salah satu Kode Klasifikasi pada daftar yang diberikan.',
                    },
                    alasan: {
                      type: Type.STRING,
                      description: 'Alasan singkat kesesuaian kode dengan uraian arsip.',
                    },
                  },
                  required: ['kodeKlasifikasi', 'alasan'],
                },
              },
            },
            required: ['recommendations'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      let parsed: { recommendations?: Array<{ kodeKlasifikasi?: string; alasan?: string }> } = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return res.status(502).json({ error: 'Respons AI tidak dapat diparsing. Silakan coba lagi.' });
      }

      const seen = new Set<string>();
      const validRecommendations: Array<{
        kodeKlasifikasi: string;
        uraian: string;
        bidang: string;
        retensiAktif: number;
        retensiInaktif: number;
        keteranganAkhir: string;
        alasan: string;
      }> = [];

      for (const rec of parsed.recommendations ?? []) {
        if (!rec.kodeKlasifikasi) continue;
        const matched = candidateMap.get(rec.kodeKlasifikasi.trim().toLowerCase());
        if (!matched) continue;
        if (seen.has(matched.kodeKlasifikasi)) continue;
        seen.add(matched.kodeKlasifikasi);
        validRecommendations.push({
          kodeKlasifikasi: matched.kodeKlasifikasi,
          uraian: matched.uraian,
          bidang: matched.bidang,
          retensiAktif: matched.retensiAktif,
          retensiInaktif: matched.retensiInaktif,
          keteranganAkhir: matched.keteranganAkhir,
          alasan: (rec.alasan || 'Sesuai dengan klasifikasi pedoman JRA.').slice(0, 280),
        });
        if (validRecommendations.length >= 3) break;
      }

      return res.json({ recommendations: validRecommendations });
    } catch (err: unknown) {
      console.error('Error /api/ai/recommend-jra:', err);
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat menghubungi layanan Gemini AI.';
      return res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GATRA 2.0 server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
