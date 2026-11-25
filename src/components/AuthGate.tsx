import React, { useState } from 'react';
import { Shield, LogIn, Clock, Ban, LogOut, AlertTriangle } from 'lucide-react';
import {
  DEFAULT_EMBLEM_URL,
  GATRA_LOGO_URL,
  isPrimaryAdminEmail,
} from '../constants/bidang';
import { useAuth } from '../context/AuthContext';

function EmblemImage({ className = 'w-16 h-16' }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`${className} rounded-xl bg-emerald-800 text-amber-300 flex items-center justify-center border border-emerald-900`}
      >
        <Shield className="w-8 h-8" />
      </div>
    );
  }

  return (
    <img
      src={DEFAULT_EMBLEM_URL}
      alt="Logo Kejaksaan Republik Indonesia"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-contain`}
    />
  );
}

function GatraLogoImage({ className = 'h-16' }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <img
      src={GATRA_LOGO_URL}
      alt="Logo GATRA Gerbang Arsip Terpadu"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} object-contain`}
    />
  );
}

function AccessNoticeScreen({
  variant,
  title,
  badgeText,
  message,
  email,
  displayName,
  photoURL,
  onSignOut,
}: {
  variant: 'pending' | 'blocked' | 'unassigned' | 'error';
  title: string;
  badgeText: string;
  message: string;
  email: string;
  displayName: string;
  photoURL?: string;
  onSignOut: () => Promise<void>;
}) {
  const isBlocked = variant === 'blocked' || variant === 'error';
  const Icon = isBlocked ? (variant === 'error' ? AlertTriangle : Ban) : Clock;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="flex items-center justify-center gap-4">
            <EmblemImage className="w-12 h-12" />
            <div className="h-9 w-px bg-slate-200" />
            <GatraLogoImage className="h-14" />
          </div>

          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center border ${
              isBlocked
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}
          >
            <Icon className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold border ${
                isBlocked
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : 'bg-amber-50 text-amber-900 border-amber-200'
              }`}
            >
              {badgeText}
            </span>
            <h1 className="text-xl font-bold font-display text-slate-900 tracking-tight">
              {title}
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3.5">
          {photoURL ? (
            <img
              src={photoURL}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-800 text-white flex items-center justify-center font-semibold text-sm shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900 truncate">{displayName}</div>
            <div className="text-xs text-slate-500 font-mono-tabular truncate">{email}</div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500 text-center sm:text-left">
            Hubungi Admin / Arsiparis Sub Bagian Pembinaan Kejaksaan Negeri Grobogan untuk penyesuaian akses.
          </p>
          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer shrink-0 w-full sm:w-auto"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    firebaseUser,
    userProfile,
    authReady,
    signingIn,
    authError,
    signInWithGoogle,
    signOut,
  } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <div className="w-8 h-8 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Memuat sesi GATRA 2.0...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="flex items-center justify-center gap-5">
              <EmblemImage className="w-16 h-16" />
              <div className="h-12 w-px bg-slate-200" />
              <GatraLogoImage className="h-20" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-emerald-800">
                KEJAKSAAN NEGERI GROBOGAN
              </p>
              <h1 className="text-xl font-bold font-display text-slate-900 tracking-tight">
                GATRA 2.0 — Gerbang Arsip Terpadu
              </h1>
              <p className="text-sm text-slate-600">
                Sistem Manajemen Kearsipan, Arsip Vital, &amp; Jadwal Retensi Arsip
              </p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-4">
            {authError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {authError}
              </div>
            )}

            <button
              type="button"
              disabled={signingIn}
              onClick={() => void signInWithGoogle()}
              className="w-full flex items-center justify-center gap-3 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-medium text-sm rounded-lg transition-colors cursor-pointer"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>{signingIn ? 'Menghubungkan akun Google...' : 'Masuk dengan Akun Google'}</span>
            </button>

            <p className="text-xs text-slate-500 text-center leading-relaxed">
              Gunakan akun Google terverifikasi. Akun baru akan tercatat otomatis dan menunggu aktivasi dari Admin Sub Bagian Pembinaan.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!userProfile) {
    if (authError) {
      return (
        <AccessNoticeScreen
          variant="error"
          badgeText="Sinkronisasi Akun Gagal"
          title="Gagal Memuat Profil Akun"
          message={authError}
          email={firebaseUser.email || ''}
          displayName={firebaseUser.displayName || 'Pegawai Kejari Grobogan'}
          photoURL={firebaseUser.photoURL || undefined}
          onSignOut={signOut}
        />
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3 text-slate-600">
          <div className="w-8 h-8 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Menyiapkan profil pengguna GATRA 2.0...</p>
        </div>
      </div>
    );
  }

  const isPrimary = isPrimaryAdminEmail(userProfile.email);

  if (!isPrimary && userProfile.status === 'Pending') {
    return (
      <AccessNoticeScreen
        variant="pending"
        badgeText="Status Akses: Pending"
        title="Akun Menunggu Persetujuan Admin"
        message="Akun Anda telah tercatat pada sistem GATRA 2.0, namun saat ini masih berstatus Pending. Silakan menunggu persetujuan serta penetapan Bidang dan Role oleh Admin (Arsiparis Sub Bagian Pembinaan) sebelum dapat mengakses menu maupun data arsip."
        email={userProfile.email}
        displayName={userProfile.displayName}
        photoURL={userProfile.photoURL}
        onSignOut={signOut}
      />
    );
  }

  if (!isPrimary && userProfile.status === 'Diblokir') {
    return (
      <AccessNoticeScreen
        variant="blocked"
        badgeText="Status Akses: Diblokir"
        title="Akses Akun Dinonaktifkan"
        message="Akun Anda saat ini berstatus Diblokir atau telah dinonaktifkan oleh Admin (Arsiparis Sub Bagian Pembinaan). Anda tidak memiliki akses ke menu aplikasi maupun data arsip Kejaksaan Negeri Grobogan."
        email={userProfile.email}
        displayName={userProfile.displayName}
        photoURL={userProfile.photoURL}
        onSignOut={signOut}
      />
    );
  }

  if (!isPrimary && userProfile.role === 'staf' && !userProfile.bidang) {
    return (
      <AccessNoticeScreen
        variant="pending"
        badgeText="Unit Kerja Belum Ditetapkan"
        title="Bidang Pegawai Belum Ditentukan"
        message="Akun Anda telah aktif sebagai Staf Bidang, tetapi unit kerja (Bidang) belum ditetapkan oleh Admin (Arsiparis Sub Bagian Pembinaan). Mohon hubungi Admin untuk menetapkan Bidang Anda."
        email={userProfile.email}
        displayName={userProfile.displayName}
        photoURL={userProfile.photoURL}
        onSignOut={signOut}
      />
    );
  }

  return <>{children}</>;
}
