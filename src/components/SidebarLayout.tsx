import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  FilePlus2,
  FolderOpen,
  Archive,
  Trash2,
  Landmark,
  BookOpenCheck,
  ArrowRightLeft,
  FileCheck2,
  BookMarked,
  Library,
  Users,
  LogOut,
  Menu,
  X,
  Shield,
  ShieldCheck,
  FileBarChart2,
  Bell,
  Clock,
  ArrowRight,
  ArchiveX,
} from 'lucide-react';
import { DEFAULT_EMBLEM_URL, GATRA_LOGO_URL, isPrimaryAdminEmail, ROLE_LABELS } from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { formatRemainingRetention, getInaktifRetentionAlerts } from '../lib/lifecycle';
import { BidangBadge } from './BidangBadge';

export type NavPage =
  | 'dashboard'
  | 'input_utama'
  | 'central_file'
  | 'record_center'
  | 'usul_musnah'
  | 'arsip_dimusnahkan'
  | 'arsip_statis'
  | 'arsip_vital'
  | 'register_pinjam'
  | 'pemindahan_arsip'
  | 'manajemen_dokumen'
  | 'laporan_arsip'
  | 'master_jra'
  | 'pustaka'
  | 'pengaturan_pengguna';

const PAGE_TITLES: Record<NavPage, string> = {
  dashboard: 'Dashboard Eksekutif',
  input_utama: 'Input & Daftar Utama Arsip',
  central_file: 'Central File (Arsip Aktif)',
  record_center: 'Record Center (Arsip Inaktif)',
  usul_musnah: 'Usul Musnah',
  arsip_dimusnahkan: 'Arsip Dimusnahkan',
  arsip_statis: 'Pendataan Arsip Statis',
  arsip_vital: 'Data Arsip Vital',
  register_pinjam: 'Register Peminjaman Arsip',
  pemindahan_arsip: 'Pemindahan Arsip & Format BA',
  manajemen_dokumen: 'Manajemen Dokumen',
  laporan_arsip: 'Pusat Unduhan Laporan Arsip',
  master_jra: 'Master Pedoman JRA',
  pustaka: 'Pustaka & Unduhan Materi',
  pengaturan_pengguna: 'Manajemen Pengguna',
};

interface NavItemDef {
  id: NavPage;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_GROUPS: Array<{ title: string; items: NavItemDef[] }> = [
  {
    title: 'Ringkasan & Input',
    items: [
      { id: 'dashboard', label: 'Dashboard Eksekutif', icon: LayoutDashboard },
      { id: 'input_utama', label: 'Input & Daftar Utama', icon: FilePlus2 },
    ],
  },
  {
    title: 'Distribusi Daur Hidup',
    items: [
      { id: 'central_file', label: 'Central File', icon: FolderOpen },
      { id: 'record_center', label: 'Record Center', icon: Archive },
      { id: 'usul_musnah', label: 'Usul Musnah', icon: Trash2 },
      { id: 'arsip_dimusnahkan', label: 'Arsip Dimusnahkan', icon: ArchiveX },
      { id: 'arsip_statis', label: 'Arsip Statis', icon: Landmark },
      { id: 'arsip_vital', label: 'Data Arsip Vital', icon: ShieldCheck },
    ],
  },
  {
    title: 'Layanan & Pencetakan',
    items: [
      { id: 'register_pinjam', label: 'Register Peminjaman', icon: BookOpenCheck },
      { id: 'pemindahan_arsip', label: 'Pemindahan Arsip & Format BA', icon: ArrowRightLeft },
      { id: 'manajemen_dokumen', label: 'Manajemen Dokumen', icon: FileCheck2 },
      { id: 'laporan_arsip', label: 'Laporan Arsip', icon: FileBarChart2 },
    ],
  },
  {
    title: 'Pedoman & Administrasi',
    items: [
      { id: 'master_jra', label: 'Master Pedoman JRA', icon: BookMarked },
      { id: 'pustaka', label: 'Pustaka Materi', icon: Library },
      {
        id: 'pengaturan_pengguna',
        label: 'Manajemen Pengguna',
        icon: Users,
        adminOnly: true,
      },
    ],
  },
];

export function SidebarLayout({
  activePage,
  onNavigate,
  children,
}: {
  activePage: NavPage;
  onNavigate: (page: NavPage) => void;
  children: React.ReactNode;
}) {
  const { userProfile, signOut } = useAuth();
  const { archives } = useArchiveData();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const retentionAlerts = useMemo(() => {
    if (!userProfile) return { upcoming6Months: [], overdueInaktif: [] };
    const scoped =
      userProfile.role === 'staf'
        ? archives.filter((a) => a.bidang === userProfile.bidang)
        : archives;
    return getInaktifRetentionAlerts(scoped);
  }, [archives, userProfile]);

  if (!userProfile) return null;

  const isAdmin =
    userProfile.role === 'admin' &&
    (isPrimaryAdminEmail(userProfile.email) || userProfile.status === 'Aktif');
  const upcomingCount = retentionAlerts.upcoming6Months.length;

  const handleSelect = (page: NavPage) => {
    onNavigate(page);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-4 py-3.5 border-b border-slate-200 flex items-center gap-2.5">
        {imgError ? (
          <div className="w-9 h-9 rounded-lg bg-emerald-800 text-amber-300 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <img
              src={DEFAULT_EMBLEM_URL}
              alt="Logo Kejaksaan RI"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-8 h-8 object-contain"
            />
            <img
              src={GATRA_LOGO_URL}
              alt="Logo GATRA"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="h-9 w-auto object-contain"
            />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-bold font-display text-slate-900 tracking-tight leading-tight">
            GATRA 2.0
          </div>
          <div className="text-[11px] font-medium text-emerald-800 truncate">
            Kejari Grobogan
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter((i) => !i.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.title} className="space-y-1">
              <div className="px-3 text-[11px] font-semibold text-slate-400 tracking-wide">
                {group.title}
              </div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    {item.id === 'dashboard' && upcomingCount > 0 && (
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold font-mono-tabular rounded-md shrink-0 ${
                          active
                            ? 'bg-amber-300 text-slate-900'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                        title={`${upcomingCount} arsip retensi inaktif berakhir ≤ 6 bulan`}
                      >
                        {upcomingCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 space-y-2.5">
        <div className="px-2 py-1.5 space-y-1">
          <div className="text-xs font-semibold text-slate-900 truncate">
            {userProfile.displayName}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {ROLE_LABELS[userProfile.role]}
          </div>
          <div className="pt-0.5">
            <BidangBadge bidang={userProfile.bidang} size="xs" />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          <span>Keluar Akun</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="no-print hidden lg:block w-[264px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-[264px] max-w-[80vw] h-full z-10">
            <button
              type="button"
              aria-label="Tutup menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print bg-white border-b border-slate-200 px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Buka navigasi"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline whitespace-nowrap">
                GATRA 2.0
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-semibold font-display text-slate-900 truncate">
                {PAGE_TITLES[activePage]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Lonceng Notifikasi Retensi Inaktif 6 Bulan */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifikasi jatuh tempo retensi inaktif"
                className="relative p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {upcomingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold font-mono-tabular flex items-center justify-center border-2 border-white">
                    {upcomingCount > 99 ? '99+' : upcomingCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-xs font-semibold text-slate-900">
                        Retensi Inaktif Berakhir ≤ 6 Bulan ({upcomingCount})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate('dashboard');
                      }}
                      className="text-[11px] font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer shrink-0"
                    >
                      Buka Dashboard
                    </button>
                  </div>

                  {upcomingCount === 0 ? (
                    <div className="p-5 text-center text-xs text-slate-500">
                      Tidak ada arsip inaktif yang masa retensinya berakhir dalam 6 bulan ke depan.
                    </div>
                  ) : (
                    <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                      {retentionAlerts.upcoming6Months.slice(0, 8).map((alert) => (
                        <button
                          key={alert.item.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            onNavigate(alert.targetPage);
                          }}
                          className="w-full text-left p-3.5 hover:bg-slate-50 transition-colors cursor-pointer space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <BidangBadge bidang={alert.item.bidang} size="xs" />
                              <span className="text-[11px] font-mono-tabular text-slate-500 truncate">
                                {alert.item.kodeKlasifikasi || 'Tanpa Kode'}
                              </span>
                            </div>
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border shrink-0 ${
                                alert.recommendedAction === 'Usul Musnah'
                                  ? 'bg-red-50 text-red-800 border-red-200'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                            >
                              {alert.recommendedAction}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-900 line-clamp-1">
                            {alert.item.uraian}
                          </p>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Jatuh tempo: {alert.expiryLabel}</span>
                            <span className="font-semibold text-amber-700 font-mono-tabular">
                              {formatRemainingRetention(alert.daysRemaining)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {upcomingCount > 0 && (
                    <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">
                        {upcomingCount > 8
                          ? `Menampilkan 8 dari ${upcomingCount} arsip`
                          : 'Klik item untuk menindaklanjuti'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          onNavigate('dashboard');
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                      >
                        <span>Lihat Detail</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <span className="hidden md:inline text-xs text-slate-500 whitespace-nowrap">
              {ROLE_LABELS[userProfile.role]}
            </span>
            <BidangBadge bidang={userProfile.bidang} />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto print:p-0 print:max-w-none">
          {children}
        </main>
      </div>
    </div>
  );
}
