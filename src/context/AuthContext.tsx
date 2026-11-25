import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { BIDANG_MAP, isPrimaryAdminEmail, PRIMARY_ADMIN_EMAIL } from '../constants/bidang';
import { auth, db, googleProvider, testConnection } from '../lib/firebase';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { BidangId, UserProfile, UserStatus } from '../types/archive';

interface AuthContextValue {
  firebaseUser: User | null;
  userProfile: UserProfile | null;
  authReady: boolean;
  signingIn: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUserProfile(raw: Partial<UserProfile>, uid: string, email: string): UserProfile {
  const isPrimary = isPrimaryAdminEmail(raw.email || email);
  const validBidang =
    raw.bidang && raw.bidang in BIDANG_MAP ? (raw.bidang as BidangId) : '';

  const fallbackStatus: UserStatus = isPrimary
    ? 'Aktif'
    : raw.status === 'Aktif' || raw.status === 'Pending' || raw.status === 'Diblokir'
      ? raw.status
      : raw.role === 'admin' || raw.role === 'pimpinan' || Boolean(validBidang)
        ? 'Aktif'
        : 'Pending';

  return {
    uid: raw.uid || uid,
    email: raw.email || email,
    displayName: raw.displayName || email.split('@')[0] || 'Pegawai Kejari Grobogan',
    photoURL: raw.photoURL || '',
    bidang: isPrimary ? validBidang || 'pembinaan' : validBidang,
    role: isPrimary ? 'admin' : raw.role || 'staf',
    status: fallbackStatus,
    lastLogin: raw.lastLogin,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const syncedUidRef = useRef<string | null>(null);

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    let active = true;

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      setFirebaseUser(user);
      setAuthError(null);

      if (!user) {
        syncedUidRef.current = null;
        setUserProfile(null);
        setAuthReady(true);
        return;
      }

      setAuthReady(false);
      const userRef = doc(db, 'users', user.uid);

      if (syncedUidRef.current !== user.uid) {
        syncedUidRef.current = user.uid;
        try {
          const snap = await getDoc(userRef);
          const displayName = (
            user.displayName?.trim() ||
            user.email?.split('@')[0] ||
            'Pegawai Kejari Grobogan'
          ).slice(0, 150);
          const photoURL = (user.photoURL || '').slice(0, 500);
          const isPrimary = isPrimaryAdminEmail(user.email);

          if (!snap.exists()) {
            if (isPrimary) {
              await setDoc(userRef, {
                uid: user.uid,
                email: user.email || PRIMARY_ADMIN_EMAIL,
                displayName,
                photoURL,
                bidang: 'pembinaan',
                role: 'admin',
                status: 'Aktif',
                lastLogin: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } else {
              await setDoc(userRef, {
                uid: user.uid,
                email: user.email || '',
                displayName,
                photoURL,
                bidang: '',
                role: 'staf',
                status: 'Pending',
                lastLogin: serverTimestamp(),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }
          } else {
            const existing = snap.data() as Partial<UserProfile>;
            const updatePayload: Record<string, unknown> = {
              displayName,
              photoURL,
              lastLogin: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };

            if (isPrimary) {
              const validBidang =
                existing.bidang && existing.bidang in BIDANG_MAP ? existing.bidang : 'pembinaan';
              updatePayload.role = 'admin';
              updatePayload.status = 'Aktif';
              updatePayload.bidang = validBidang;
            } else if (!existing.status) {
              const hasValidBidang = Boolean(existing.bidang && existing.bidang in BIDANG_MAP);
              updatePayload.status =
                existing.role === 'admin' || existing.role === 'pimpinan' || hasValidBidang
                  ? 'Aktif'
                  : 'Pending';
            }

            await updateDoc(userRef, updatePayload);
          }
        } catch (err: unknown) {
          if (!active) return;
          syncedUidRef.current = null;
          setAuthError(
            err instanceof Error
              ? err.message
              : 'Gagal menyinkronkan profil pengguna saat masuk.'
          );
          setAuthReady(true);
          return;
        }
      }

      if (!active) return;

      unsubProfile = onSnapshot(
        userRef,
        (snap) => {
          if (!active) return;
          if (snap.exists()) {
            setUserProfile(
              normalizeUserProfile(snap.data() as Partial<UserProfile>, user.uid, user.email || '')
            );
          } else {
            setUserProfile(null);
          }
          setAuthReady(true);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
        }
      );
    });

    return () => {
      active = false;
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Gagal masuk dengan akun Google.';
      setAuthError(msg);
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    syncedUidRef.current = null;
    await firebaseSignOut(auth);
  }, []);

  const getIdToken = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('Sesi autentikasi tidak ditemukan.');
    }
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        authReady,
        signingIn,
        authError,
        signInWithGoogle,
        signOut,
        getIdToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
