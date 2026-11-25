import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import {
  computeBidangArchiveStats,
  formatIndonesianDateTime,
  generateSafeDocId,
  isArchiveDestroyed,
  normalizeArchiveStatus,
  parseIndonesianDateToIso,
  todayIsoDate,
} from '../lib/lifecycle';
import {
  BIDANG_LIST,
  MAX_DOKUMEN_BASE64_LENGTH,
  MAX_DOKUMEN_FILE_BYTES,
  isPrimaryAdminEmail,
} from '../constants/bidang';
import { INITIAL_VITAL_ARCHIVES_SEED } from '../constants/vitalArchivesSeed';
import { useAuth } from './AuthContext';
import {
  ArchiveItem,
  BidangId,
  BidangStatSummary,
  DokumenKearsipanItem,
  JraItem,
  LibraryItem,
  LoanItem,
  MetodePemusnahan,
  StatistikSatkerDoc,
  UserProfile,
  UserRole,
  UserStatus,
  VitalArchiveItem,
} from '../types/archive';

export interface DestructionMetadata {
  nomorSuratAnri: string;
  tanggalPersetujuanAnri: string;
  nomorBaPemusnahan: string;
  tanggalPemusnahan: string;
  metodePemusnahan: MetodePemusnahan;
}

interface ArchiveDataContextValue {
  jraList: JraItem[];
  archives: ArchiveItem[];
  vitalArchives: VitalArchiveItem[];
  loans: LoanItem[];
  libraryItems: LibraryItem[];
  dokumenList: DokumenKearsipanItem[];
  usersList: UserProfile[];
  satkerStats: StatistikSatkerDoc | null;
  loadingData: boolean;
  saveJraItem: (
    data: Omit<JraItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  deleteJraItem: (id: string) => Promise<void>;
  importJraItems: (
    items: Array<Omit<JraItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>>
  ) => Promise<number>;
  saveArchiveItem: (
    data: Omit<
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
    >,
    existingItem?: ArchiveItem
  ) => Promise<void>;
  quickUpdateArchiveBox: (
    item: ArchiveItem,
    nomorBoks: string,
    catatanRecordCenter: string
  ) => Promise<void>;
  markArchivesDestroyed: (
    items: ArchiveItem[],
    metadata: DestructionMetadata
  ) => Promise<number>;
  deleteArchiveItem: (id: string) => Promise<void>;
  resetAllArchives: () => Promise<number>;
  importArchiveItems: (
    items: Array<
      Omit<
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
      > & { tanggalInput?: string; tanggalInputISO?: string }
    >
  ) => Promise<number>;
  saveLoanItem: (
    data: Omit<LoanItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>,
    existingLoan?: LoanItem
  ) => Promise<void>;
  deleteLoanItem: (id: string) => Promise<void>;
  saveLibraryItem: (
    data: Omit<LibraryItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>,
    existingId?: string
  ) => Promise<void>;
  deleteLibraryItem: (id: string) => Promise<void>;
  updateUserAccess: (
    targetUser: UserProfile,
    updates: {
      role: UserRole;
      bidang: BidangId | '';
      status: UserStatus;
    }
  ) => Promise<void>;
  saveVitalArchive: (
    data: Omit<
      VitalArchiveItem,
      | 'id'
      | 'createdByUid'
      | 'createdByName'
      | 'updatedByUid'
      | 'updatedByName'
      | 'createdAt'
      | 'updatedAt'
    >,
    existingItem?: VitalArchiveItem
  ) => Promise<void>;
  deleteVitalArchive: (id: string) => Promise<void>;
  importVitalArchives: (
    items: Array<
      Omit<
        VitalArchiveItem,
        | 'id'
        | 'createdByUid'
        | 'createdByName'
        | 'updatedByUid'
        | 'updatedByName'
        | 'createdAt'
        | 'updatedAt'
      >
    >
  ) => Promise<number>;
  saveDokumenKearsipan: (
    data: Omit<
      DokumenKearsipanItem,
      'id' | 'createdByUid' | 'createdByName' | 'createdAt' | 'updatedAt'
    >
  ) => Promise<void>;
  deleteDokumenKearsipan: (id: string) => Promise<void>;
}

const ArchiveDataContext = createContext<ArchiveDataContextValue | null>(null);

export function ArchiveDataProvider({ children }: { children: React.ReactNode }) {
  const { authReady, firebaseUser, userProfile } = useAuth();

  const [jraList, setJraList] = useState<JraItem[]>([]);
  const [archives, setArchives] = useState<ArchiveItem[]>([]);
  const [vitalArchives, setVitalArchives] = useState<VitalArchiveItem[]>([]);
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [dokumenList, setDokumenList] = useState<DokumenKearsipanItem[]>([]);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [satkerStats, setSatkerStats] = useState<StatistikSatkerDoc | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  const [archivesReady, setArchivesReady] = useState(false);
  const [satkerStatsLoaded, setSatkerStatsLoaded] = useState(false);
  const [vitalLoaded, setVitalLoaded] = useState(false);
  const [vitalSeedAttempted, setVitalSeedAttempted] = useState(false);

  useEffect(() => {
    const isAuthorizedActive = Boolean(
      authReady &&
        firebaseUser &&
        userProfile &&
        (isPrimaryAdminEmail(userProfile.email) || userProfile.status === 'Aktif') &&
        (userProfile.role !== 'staf' || Boolean(userProfile.bidang))
    );

    if (!isAuthorizedActive || !firebaseUser || !userProfile) {
      setJraList([]);
      setArchives([]);
      setVitalArchives([]);
      setLoans([]);
      setLibraryItems([]);
      setDokumenList([]);
      setUsersList([]);
      setSatkerStats(null);
      setArchivesReady(false);
      setSatkerStatsLoaded(false);
      setVitalLoaded(false);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setArchivesReady(false);
    setSatkerStatsLoaded(false);
    setVitalLoaded(false);
    let jraLoaded = false;
    let archivesLoaded = false;
    let loansLoaded = false;
    let libraryLoaded = false;

    const markLoaded = () => {
      if (archivesLoaded || (jraLoaded && loansLoaded && libraryLoaded)) {
        setLoadingData(false);
      }
    };

    const unsubJra = onSnapshot(
      collection(db, 'jra_master'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as JraItem))
          .sort((a, b) => Number(a.nomor) - Number(b.nomor));
        setJraList(rows);
        jraLoaded = true;
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'jra_master')
    );

    const archivesQuery =
      userProfile.role === 'staf'
        ? query(collection(db, 'archives'), where('bidang', '==', userProfile.bidang))
        : collection(db, 'archives');

    const unsubArchives = onSnapshot(
      archivesQuery,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as ArchiveItem))
          .sort((a, b) => {
            if (b.kurunWaktu !== a.kurunWaktu) return b.kurunWaktu - a.kurunWaktu;
            return a.nomorBerkas.localeCompare(b.nomorBerkas, 'id', { numeric: true });
          });
        setArchives(rows);
        archivesLoaded = true;
        setArchivesReady(true);
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'archives')
    );

    const vitalQuery =
      userProfile.role === 'staf'
        ? query(collection(db, 'vital_archives'), where('bidang', '==', userProfile.bidang))
        : collection(db, 'vital_archives');

    const unsubVital = onSnapshot(
      vitalQuery,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as VitalArchiveItem))
          .sort((a, b) => Number(a.nomor) - Number(b.nomor));
        setVitalArchives(rows);
        setVitalLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'vital_archives')
    );

    const loansQuery =
      userProfile.role === 'staf'
        ? query(collection(db, 'loans'), where('bidang', '==', userProfile.bidang))
        : collection(db, 'loans');

    const unsubLoans = onSnapshot(
      loansQuery,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as LoanItem))
          .sort((a, b) => Number(b.nomor) - Number(a.nomor));
        setLoans(rows);
        loansLoaded = true;
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'loans')
    );

    const unsubLibrary = onSnapshot(
      collection(db, 'library_items'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as LibraryItem))
          .sort((a, b) => a.judul.localeCompare(b.judul, 'id'));
        setLibraryItems(rows);
        libraryLoaded = true;
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'library_items')
    );

    const unsubDokumen = onSnapshot(
      collection(db, 'dokumen_kearsipan'),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as DokumenKearsipanItem))
          .sort((a, b) => {
            const dateDiff = (b.tanggalDokumen || '').localeCompare(a.tanggalDokumen || '');
            if (dateDiff !== 0) return dateDiff;
            return a.judul.localeCompare(b.judul, 'id');
          });
        setDokumenList(rows);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'dokumen_kearsipan')
    );

    let unsubUsers: (() => void) | null = null;
    if (
      userProfile.role === 'admin' &&
      (isPrimaryAdminEmail(userProfile.email) || userProfile.status === 'Aktif')
    ) {
      const toMillis = (val: unknown): number => {
        if (!val) return 0;
        if (typeof val === 'object' && val !== null && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
          return (val as { toMillis: () => number }).toMillis();
        }
        if (typeof val === 'object' && val !== null && 'seconds' in val) {
          return Number((val as { seconds: number }).seconds) * 1000;
        }
        return 0;
      };

      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const rows = snap.docs
            .map((d) => {
              const raw = d.data() as Partial<UserProfile>;
              const isPrimary = isPrimaryAdminEmail(raw.email);
              const fallbackStatus: UserStatus = isPrimary
                ? 'Aktif'
                : raw.status || (raw.bidang ? 'Aktif' : 'Pending');
              return {
                uid: raw.uid || d.id,
                email: raw.email || '',
                displayName: raw.displayName || raw.email || 'Pengguna',
                photoURL: raw.photoURL || '',
                bidang: raw.bidang ?? '',
                role: isPrimary ? 'admin' : raw.role || 'staf',
                status: fallbackStatus,
                lastLogin: raw.lastLogin,
                createdAt: raw.createdAt,
                updatedAt: raw.updatedAt,
              } as UserProfile;
            })
            .sort((a, b) => {
              const diff = toMillis(b.lastLogin) - toMillis(a.lastLogin);
              if (diff !== 0) return diff;
              return a.displayName.localeCompare(b.displayName, 'id');
            });
          setUsersList(rows);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      );
    } else {
      setUsersList([]);
    }

    const unsubSatkerStats = onSnapshot(
      doc(db, 'metadata', 'statistik_satker'),
      (snap) => {
        setSatkerStats(snap.exists() ? (snap.data() as StatistikSatkerDoc) : null);
        setSatkerStatsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'metadata/statistik_satker')
    );

    return () => {
      unsubJra();
      unsubArchives();
      unsubVital();
      unsubLoans();
      unsubLibrary();
      unsubDokumen();
      unsubSatkerStats();
      if (unsubUsers) unsubUsers();
    };
  }, [authReady, firebaseUser, userProfile]);

  const syncSatkerStatsForBidangs = useCallback(
    async (bidangs: BidangId[], snapshotItems: ArchiveItem[]) => {
      if (!firebaseUser || !userProfile) return;
      if (userProfile.role === 'pimpinan') return;

      const allowedBidangs: BidangId[] =
        userProfile.role === 'staf'
          ? userProfile.bidang
            ? [userProfile.bidang]
            : []
          : Array.from(new Set(bidangs));

      if (allowedBidangs.length === 0) return;

      const payload: Record<string, unknown> = {
        updatedByUid: firebaseUser.uid,
        updatedAt: serverTimestamp(),
      };
      for (const b of allowedBidangs) {
        payload[b] = computeBidangArchiveStats(snapshotItems, b);
      }

      try {
        await setDoc(doc(db, 'metadata', 'statistik_satker'), payload, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'metadata/statistik_satker');
      }
    },
    [firebaseUser, userProfile]
  );

  useEffect(() => {
    if (!archivesReady || !satkerStatsLoaded || !firebaseUser || !userProfile) return;
    if (userProfile.role === 'pimpinan') return;

    const scopeBidangs: BidangId[] =
      userProfile.role === 'admin'
        ? BIDANG_LIST.map((b) => b.id)
        : userProfile.bidang
          ? [userProfile.bidang]
          : [];

    if (scopeBidangs.length === 0) return;

    const isSameStat = (a: BidangStatSummary | undefined, b: BidangStatSummary): boolean =>
      Boolean(
        a &&
          a.aktif === b.aktif &&
          a.inaktif === b.inaktif &&
          a.usulMusnah === b.usulMusnah &&
          a.statis === b.statis &&
          a.musnah === b.musnah &&
          a.total === b.total
      );

    const dirtyBidangs = scopeBidangs.filter((bidang) => {
      const computed = computeBidangArchiveStats(archives, bidang);
      const current = satkerStats?.[bidang];
      return !isSameStat(current, computed);
    });

    if (dirtyBidangs.length > 0) {
      void syncSatkerStatsForBidangs(dirtyBidangs, archives);
    }
  }, [
    archivesReady,
    satkerStatsLoaded,
    firebaseUser,
    userProfile,
    archives,
    satkerStats,
    syncSatkerStatsForBidangs,
  ]);

  const saveJraItem = useCallback(
    async (
      data: Omit<JraItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ) => {
      if (!firebaseUser) throw new Error('Belum terautentikasi.');
      if (existingId) {
        try {
          await updateDoc(doc(db, 'jra_master', existingId), {
            ...data,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `jra_master/${existingId}`);
        }
      } else {
        const id = generateSafeDocId('jra');
        try {
          await setDoc(doc(db, 'jra_master', id), {
            ...data,
            createdByUid: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `jra_master/${id}`);
        }
      }
    },
    [firebaseUser]
  );

  const deleteJraItem = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'jra_master', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `jra_master/${id}`);
    }
  }, []);

  const importJraItems = useCallback(
    async (
      items: Array<Omit<JraItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>>
    ): Promise<number> => {
      if (!firebaseUser) throw new Error('Belum terautentikasi.');
      let count = 0;
      const chunkSize = 400;
      for (let i = 0; i < items.length; i += chunkSize) {
        const slice = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of slice) {
          const id = generateSafeDocId('jra');
          batch.set(doc(db, 'jra_master', id), {
            ...item,
            createdByUid: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          count++;
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'jra_master');
        }
      }
      return count;
    },
    [firebaseUser]
  );

  const saveArchiveItem = useCallback(
    async (
      data: Omit<
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
      >,
      existingItem?: ArchiveItem
    ) => {
      if (!firebaseUser || !userProfile) throw new Error('Belum terautentikasi.');
      if (existingItem && isArchiveDestroyed(existingItem)) {
        throw new Error('Arsip berstatus Musnah terkunci Read-Only permanen dan tidak dapat diubah.');
      }
      if (normalizeArchiveStatus(data.keterangan) === 'Musnah') {
        throw new Error('Gunakan menu Usul Musnah untuk menandai arsip sudah dimusnahkan.');
      }
      const actorName = userProfile.displayName || userProfile.email;
      const diinputOleh = (
        userProfile.displayName && userProfile.email && userProfile.displayName !== userProfile.email
          ? `${userProfile.displayName} (${userProfile.email})`
          : actorName
      ).slice(0, 200);

      if (existingItem) {
        try {
          await updateDoc(doc(db, 'archives', existingItem.id), {
            ...data,
            catatanRecordCenter: (data.catatanRecordCenter ?? existingItem.catatanRecordCenter ?? '')
              .trim()
              .slice(0, 1000),
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
            updatedAt: serverTimestamp(),
          });
          const nextList = archives.map((a) =>
            a.id === existingItem.id ? ({ ...a, ...data } as ArchiveItem) : a
          );
          await syncSatkerStatsForBidangs([existingItem.bidang, data.bidang], nextList);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `archives/${existingItem.id}`);
        }
      } else {
        const id = generateSafeDocId('arsip');
        const createdTanggalInput = formatIndonesianDateTime();
        const createdTanggalIso = todayIsoDate();
        try {
          await setDoc(doc(db, 'archives', id), {
            ...data,
            catatanRecordCenter: (data.catatanRecordCenter || '').trim().slice(0, 1000),
            tanggalInput: createdTanggalInput,
            tanggalInputISO: createdTanggalIso,
            diinputOleh,
            createdByUid: firebaseUser.uid,
            createdByName: actorName,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          const nextList: ArchiveItem[] = [
            ...archives,
            {
              ...data,
              id,
              tanggalInput: createdTanggalInput,
              tanggalInputISO: createdTanggalIso,
              diinputOleh,
              createdByUid: firebaseUser.uid,
              createdByName: actorName,
              updatedByUid: firebaseUser.uid,
              updatedByName: actorName,
            },
          ];
          await syncSatkerStatsForBidangs([data.bidang], nextList);
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `archives/${id}`);
        }
      }
    },
    [firebaseUser, userProfile, archives, syncSatkerStatsForBidangs]
  );

  const quickUpdateArchiveBox = useCallback(
    async (item: ArchiveItem, nomorBoks: string, catatanRecordCenter: string) => {
      if (!firebaseUser || !userProfile) throw new Error('Belum terautentikasi.');
      if (isArchiveDestroyed(item)) {
        throw new Error('Arsip berstatus Musnah terkunci Read-Only permanen.');
      }
      const actorName = userProfile.displayName || userProfile.email;
      try {
        await updateDoc(doc(db, 'archives', item.id), {
          nomorBoks: nomorBoks.trim().slice(0, 60),
          catatanRecordCenter: catatanRecordCenter.trim().slice(0, 1000),
          updatedByUid: firebaseUser.uid,
          updatedByName: actorName,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `archives/${item.id}`);
      }
    },
    [firebaseUser, userProfile]
  );

  const markArchivesDestroyed = useCallback(
    async (items: ArchiveItem[], metadata: DestructionMetadata): Promise<number> => {
      if (!firebaseUser || userProfile?.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat menandai arsip sudah dimusnahkan.');
      }
      const nomorSuratAnri = metadata.nomorSuratAnri.trim().slice(0, 120);
      const tanggalPersetujuanAnri = metadata.tanggalPersetujuanAnri.trim().slice(0, 30);
      const nomorBaPemusnahan = metadata.nomorBaPemusnahan.trim().slice(0, 120);
      const tanggalPemusnahan = metadata.tanggalPemusnahan.trim().slice(0, 30);

      if (
        !nomorSuratAnri ||
        !tanggalPersetujuanAnri ||
        !nomorBaPemusnahan ||
        !tanggalPemusnahan ||
        !metadata.metodePemusnahan
      ) {
        throw new Error('Seluruh metadata persetujuan ANRI dan Berita Acara Pemusnahan wajib diisi.');
      }

      const eligible = items.filter((item) => !isArchiveDestroyed(item));
      if (eligible.length === 0) return 0;

      const actorName = userProfile.displayName || userProfile.email;
      let updatedCount = 0;
      const chunkSize = 400;

      for (let i = 0; i < eligible.length; i += chunkSize) {
        const slice = eligible.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of slice) {
          batch.update(doc(db, 'archives', item.id), {
            keterangan: 'Musnah',
            nomorSuratAnri,
            tanggalPersetujuanAnri,
            nomorBaPemusnahan,
            tanggalPemusnahan,
            metodePemusnahan: metadata.metodePemusnahan,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
            updatedAt: serverTimestamp(),
          });
          updatedCount++;
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'archives');
        }
      }

      const eligibleIds = new Set(eligible.map((item) => item.id));
      const nextList = archives.map((a) =>
        eligibleIds.has(a.id) ? ({ ...a, keterangan: 'Musnah' } as ArchiveItem) : a
      );
      await syncSatkerStatsForBidangs(
        eligible.map((item) => item.bidang),
        nextList
      );

      return updatedCount;
    },
    [firebaseUser, userProfile, archives, syncSatkerStatsForBidangs]
  );

  const deleteArchiveItem = useCallback(
    async (id: string) => {
      const target = archives.find((a) => a.id === id);
      try {
        await deleteDoc(doc(db, 'archives', id));
        if (target) {
          const nextList = archives.filter((a) => a.id !== id);
          await syncSatkerStatsForBidangs([target.bidang], nextList);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `archives/${id}`);
      }
    },
    [archives, syncSatkerStatsForBidangs]
  );

  const resetAllArchives = useCallback(async (): Promise<number> => {
    if (!firebaseUser || userProfile?.role !== 'admin') {
      throw new Error('Hanya Admin yang diizinkan mengosongkan seluruh data arsip.');
    }
    let deletedCount = 0;
    try {
      const snap = await getDocs(collection(db, 'archives'));
      const docs = snap.docs;
      const chunkSize = 400;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const slice = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const d of slice) {
          batch.delete(d.ref);
          deletedCount++;
        }
        await batch.commit();
      }
      await syncSatkerStatsForBidangs(
        BIDANG_LIST.map((b) => b.id),
        []
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'archives');
    }
    return deletedCount;
  }, [firebaseUser, userProfile?.role, syncSatkerStatsForBidangs]);

  const importArchiveItems = useCallback(
    async (
      items: Array<
        Omit<
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
        > & { tanggalInput?: string; tanggalInputISO?: string }
      >
    ): Promise<number> => {
      if (!firebaseUser || !userProfile) throw new Error('Belum terautentikasi.');
      const actorName = userProfile.displayName || userProfile.email;
      const diinputOleh = (
        userProfile.displayName && userProfile.email && userProfile.displayName !== userProfile.email
          ? `${userProfile.displayName} (${userProfile.email})`
          : actorName
      ).slice(0, 200);
      const inputDateTime = formatIndonesianDateTime();
      const fallbackIso = todayIsoDate();
      let count = 0;
      const insertedItems: ArchiveItem[] = [];
      const chunkSize = 400;
      for (let i = 0; i < items.length; i += chunkSize) {
        const slice = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of slice) {
          const {
            tanggalInput: customTanggal,
            tanggalInputISO: customTanggalIso,
            ...restItem
          } = item;
          const resolvedTanggal = (customTanggal || '').trim().slice(0, 60) || inputDateTime;
          const resolvedIso =
            customTanggalIso && /^\d{4}-\d{2}-\d{2}$/.test(customTanggalIso)
              ? customTanggalIso
              : parseIndonesianDateToIso(resolvedTanggal) || fallbackIso;
          const id = generateSafeDocId('arsip');
          const record = {
            ...restItem,
            catatanRecordCenter: (restItem.catatanRecordCenter || '').trim().slice(0, 1000),
            tanggalInput: resolvedTanggal,
            tanggalInputISO: resolvedIso,
            diinputOleh,
            createdByUid: firebaseUser.uid,
            createdByName: actorName,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          batch.set(doc(db, 'archives', id), record);
          insertedItems.push({
            ...restItem,
            id,
            catatanRecordCenter: record.catatanRecordCenter,
            tanggalInput: resolvedTanggal,
            tanggalInputISO: resolvedIso,
            diinputOleh,
            createdByUid: firebaseUser.uid,
            createdByName: actorName,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
          });
          count++;
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'archives');
        }
      }
      if (insertedItems.length > 0) {
        const nextList = [...archives, ...insertedItems];
        await syncSatkerStatsForBidangs(
          insertedItems.map((it) => it.bidang),
          nextList
        );
      }
      return count;
    },
    [firebaseUser, userProfile, archives, syncSatkerStatsForBidangs]
  );

  const saveLoanItem = useCallback(
    async (
      data: Omit<LoanItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>,
      existingLoan?: LoanItem
    ) => {
      if (!firebaseUser) throw new Error('Belum terautentikasi.');
      if (existingLoan) {
        try {
          await updateDoc(doc(db, 'loans', existingLoan.id), {
            ...data,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `loans/${existingLoan.id}`);
        }
      } else {
        const id = generateSafeDocId('pinjam');
        try {
          await setDoc(doc(db, 'loans', id), {
            ...data,
            createdByUid: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `loans/${id}`);
        }
      }
    },
    [firebaseUser]
  );

  const deleteLoanItem = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'loans', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `loans/${id}`);
    }
  }, []);

  const saveLibraryItem = useCallback(
    async (
      data: Omit<LibraryItem, 'id' | 'createdByUid' | 'createdAt' | 'updatedAt'>,
      existingId?: string
    ) => {
      if (!firebaseUser) throw new Error('Belum terautentikasi.');
      if (existingId) {
        try {
          await updateDoc(doc(db, 'library_items', existingId), {
            ...data,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `library_items/${existingId}`);
        }
      } else {
        const id = generateSafeDocId('pustaka');
        try {
          await setDoc(doc(db, 'library_items', id), {
            ...data,
            createdByUid: firebaseUser.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `library_items/${id}`);
        }
      }
    },
    [firebaseUser]
  );

  const deleteLibraryItem = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'library_items', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `library_items/${id}`);
    }
  }, []);

  const updateUserAccess = useCallback(
    async (
      targetUser: UserProfile,
      updates: {
        role: UserRole;
        bidang: BidangId | '';
        status: UserStatus;
      }
    ) => {
      if (!firebaseUser || userProfile?.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat mengubah hak akses pengguna.');
      }

      const isTargetPrimary = isPrimaryAdminEmail(targetUser.email);
      if (isTargetPrimary && (updates.role !== 'admin' || updates.status !== 'Aktif')) {
        throw new Error('Role dan status Admin Utama dilindungi dan tidak dapat diubah.');
      }

      const nextRole: UserRole = isTargetPrimary ? 'admin' : updates.role;
      const nextStatus: UserStatus = isTargetPrimary ? 'Aktif' : updates.status;
      const nextBidang: BidangId | '' = isTargetPrimary
        ? updates.bidang || 'pembinaan'
        : updates.bidang;

      if (nextRole === 'staf' && nextStatus === 'Aktif' && !nextBidang) {
        throw new Error(
          'Pilih Bidang unit kerja pegawai terlebih dahulu sebelum mengaktifkan akun Staf Bidang.'
        );
      }

      const payload: Record<string, unknown> = {
        role: nextRole,
        bidang: nextBidang,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      };

      if (!targetUser.lastLogin) {
        payload.lastLogin = serverTimestamp();
      }

      try {
        await updateDoc(doc(db, 'users', targetUser.uid), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
      }
    },
    [firebaseUser, userProfile?.role]
  );

  useEffect(() => {
    if (
      !vitalLoaded ||
      vitalSeedAttempted ||
      !firebaseUser ||
      !userProfile ||
      !(
        userProfile.role === 'admin' ||
        (userProfile.role === 'staf' && userProfile.bidang === 'pembinaan')
      )
    ) {
      return;
    }

    setVitalSeedAttempted(true);
    const seedFlagKey = 'gatra_vital_33_seeded_v1';
    if (window.localStorage.getItem(seedFlagKey)) return;

    const existingKeys = new Set(
      vitalArchives.map((v) => `${Number(v.nomor)}::${v.uraian.trim().toLowerCase()}`)
    );
    const existingIds = new Set(vitalArchives.map((v) => v.id));

    const missing = INITIAL_VITAL_ARCHIVES_SEED.filter(
      (row) =>
        !existingIds.has(row.docId) &&
        !existingKeys.has(`${row.nomor}::${row.uraian.trim().toLowerCase()}`)
    );

    if (missing.length === 0) {
      window.localStorage.setItem(seedFlagKey, '1');
      return;
    }

    const actorName = userProfile.displayName || userProfile.email;
    const batch = writeBatch(db);
    for (const row of missing) {
      batch.set(doc(db, 'vital_archives', row.docId), {
        nomor: row.nomor,
        bidang: row.bidang,
        kodeKlasifikasi: '',
        uraian: row.uraian,
        kurunWaktu: row.kurunWaktu,
        mediaSimpan: row.mediaSimpan,
        jumlah: row.jumlah,
        jangkaSimpan: row.jangkaSimpan,
        metodePerlindungan: row.metodePerlindungan,
        lokasiSimpan: row.lokasiSimpan,
        tingkatKerawanan: 'Sangat Vital',
        tautanBackup: '',
        keterangan: row.keterangan,
        createdByUid: firebaseUser.uid,
        createdByName: actorName,
        updatedByUid: firebaseUser.uid,
        updatedByName: actorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    void batch
      .commit()
      .then(() => {
        window.localStorage.setItem(seedFlagKey, '1');
      })
      .catch((err) => handleFirestoreError(err, OperationType.WRITE, 'vital_archives'));
  }, [vitalLoaded, vitalSeedAttempted, firebaseUser, userProfile, vitalArchives]);

  const saveVitalArchive = useCallback(
    async (
      data: Omit<
        VitalArchiveItem,
        | 'id'
        | 'createdByUid'
        | 'createdByName'
        | 'updatedByUid'
        | 'updatedByName'
        | 'createdAt'
        | 'updatedAt'
      >,
      existingItem?: VitalArchiveItem
    ) => {
      if (!firebaseUser || !userProfile) throw new Error('Belum terautentikasi.');
      const actorName = userProfile.displayName || userProfile.email;
      const sanitizedPayload = {
        ...data,
        kodeKlasifikasi: (data.kodeKlasifikasi || '').trim().slice(0, 300),
        jangkaSimpan: (data.jangkaSimpan || 'Permanen').trim().slice(0, 100),
        tingkatKerawanan: data.tingkatKerawanan || 'Sangat Vital',
        tautanBackup: (data.tautanBackup || '').trim().slice(0, 1000),
      };
      if (existingItem) {
        try {
          await updateDoc(doc(db, 'vital_archives', existingItem.id), {
            ...sanitizedPayload,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `vital_archives/${existingItem.id}`);
        }
      } else {
        const id = generateSafeDocId('vital');
        try {
          await setDoc(doc(db, 'vital_archives', id), {
            ...sanitizedPayload,
            createdByUid: firebaseUser.uid,
            createdByName: actorName,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `vital_archives/${id}`);
        }
      }
    },
    [firebaseUser, userProfile]
  );

  const deleteVitalArchive = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vital_archives', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `vital_archives/${id}`);
    }
  }, []);

  const importVitalArchives = useCallback(
    async (
      items: Array<
        Omit<
          VitalArchiveItem,
          | 'id'
          | 'createdByUid'
          | 'createdByName'
          | 'updatedByUid'
          | 'updatedByName'
          | 'createdAt'
          | 'updatedAt'
        >
      >
    ): Promise<number> => {
      if (!firebaseUser || !userProfile) throw new Error('Belum terautentikasi.');
      const actorName = userProfile.displayName || userProfile.email;
      let count = 0;
      const chunkSize = 400;
      for (let i = 0; i < items.length; i += chunkSize) {
        const slice = items.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of slice) {
          const id = generateSafeDocId('vital');
          batch.set(doc(db, 'vital_archives', id), {
            ...item,
            kodeKlasifikasi: (item.kodeKlasifikasi || '').trim().slice(0, 300),
            jangkaSimpan: (item.jangkaSimpan || 'Permanen').trim().slice(0, 100),
            tingkatKerawanan: item.tingkatKerawanan || 'Sangat Vital',
            tautanBackup: (item.tautanBackup || '').trim().slice(0, 1000),
            createdByUid: firebaseUser.uid,
            createdByName: actorName,
            updatedByUid: firebaseUser.uid,
            updatedByName: actorName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          count++;
        }
        try {
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, 'vital_archives');
        }
      }
      return count;
    },
    [firebaseUser, userProfile]
  );

  const saveDokumenKearsipan = useCallback(
    async (
      data: Omit<
        DokumenKearsipanItem,
        'id' | 'createdByUid' | 'createdByName' | 'createdAt' | 'updatedAt'
      >
    ) => {
      if (!firebaseUser || userProfile?.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat menambahkan dokumen kearsipan.');
      }

      const judul = data.judul.trim().slice(0, 250);
      const nomorSurat = data.nomorSurat.trim().slice(0, 120);
      const tanggalDokumen = data.tanggalDokumen.trim().slice(0, 30);

      if (!judul || !nomorSurat || !tanggalDokumen) {
        throw new Error('Judul Dokumen, Nomor Surat/BA, dan Tanggal Dokumen wajib diisi.');
      }

      const actorName = (userProfile.displayName || userProfile.email || 'Admin').slice(0, 150);
      const id = generateSafeDocId('dok');

      const basePayload: Record<string, unknown> = {
        judul,
        kategori: data.kategori,
        nomorSurat,
        tanggalDokumen,
        bidangTerkait: data.bidangTerkait,
        tipeLampiran: data.tipeLampiran,
        createdByUid: firebaseUser.uid,
        createdByName: actorName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (data.tipeLampiran === 'gdrive') {
        const url = (data.urlGoogleDrive || '').trim().slice(0, 1000);
        if (!/^https?:\/\/.+$/i.test(url)) {
          throw new Error('URL Tautan Google Drive harus diawali dengan http:// atau https://.');
        }
        basePayload.urlGoogleDrive = url;
      } else {
        const fileName = (data.fileName || '').trim().slice(0, 255);
        const fileMimeType = (data.fileMimeType || 'application/octet-stream').trim().slice(0, 150);
        const fileSize = Number(data.fileSize || 0);
        const fileBase64 = (data.fileBase64 || '').trim();
        if (!fileName || !fileBase64 || fileSize <= 0) {
          throw new Error('Pilih file PDF atau DOCX terlebih dahulu.');
        }
        if (fileSize > MAX_DOKUMEN_FILE_BYTES || fileBase64.length > MAX_DOKUMEN_BASE64_LENGTH) {
          throw new Error('Ukuran file melebihi batas maksimal 750 KB.');
        }
        basePayload.fileName = fileName;
        basePayload.fileMimeType = fileMimeType;
        basePayload.fileSize = fileSize;
        basePayload.fileBase64 = fileBase64;
      }

      try {
        await setDoc(doc(db, 'dokumen_kearsipan', id), basePayload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `dokumen_kearsipan/${id}`);
      }
    },
    [firebaseUser, userProfile]
  );

  const deleteDokumenKearsipan = useCallback(
    async (id: string) => {
      if (!firebaseUser || userProfile?.role !== 'admin') {
        throw new Error('Hanya Admin yang dapat menghapus dokumen kearsipan.');
      }
      try {
        await deleteDoc(doc(db, 'dokumen_kearsipan', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `dokumen_kearsipan/${id}`);
      }
    },
    [firebaseUser, userProfile?.role]
  );

  return (
    <ArchiveDataContext.Provider
      value={{
        jraList,
        archives,
        vitalArchives,
        loans,
        libraryItems,
        dokumenList,
        usersList,
        satkerStats,
        loadingData,
        saveJraItem,
        deleteJraItem,
        importJraItems,
        saveArchiveItem,
        quickUpdateArchiveBox,
        markArchivesDestroyed,
        deleteArchiveItem,
        resetAllArchives,
        importArchiveItems,
        saveLoanItem,
        deleteLoanItem,
        saveLibraryItem,
        deleteLibraryItem,
        updateUserAccess,
        saveVitalArchive,
        deleteVitalArchive,
        importVitalArchives,
        saveDokumenKearsipan,
        deleteDokumenKearsipan,
      }}
    >
      {children}
    </ArchiveDataContext.Provider>
  );
}

export function useArchiveData() {
  const ctx = useContext(ArchiveDataContext);
  if (!ctx) {
    throw new Error('useArchiveData must be used within ArchiveDataProvider');
  }
  return ctx;
}
