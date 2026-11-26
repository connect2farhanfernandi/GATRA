import { useMemo, useState } from 'react';
import { Lock, Search, ShieldAlert } from 'lucide-react';
import {
  BIDANG_LIST,
  isPrimaryAdminEmail,
  ROLE_LABELS,
  USER_STATUS_OPTIONS,
} from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge } from '../components/BidangBadge';
import { DatabaseBackupPanel } from '../components/DatabaseBackupPanel';
import { BidangId, UserProfile, UserRole, UserStatus } from '../types/archive';

function formatLastLogin(val: unknown): string {
  if (!val) return '—';
  let date: Date | null = null;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    date = (val as { toDate: () => Date }).toDate();
  } else if (typeof val === 'object' && val !== null && 'seconds' in val) {
    date = new Date(Number((val as { seconds: number }).seconds) * 1000);
  } else if (val instanceof Date) {
    date = val;
  } else if (typeof val === 'string' || typeof val === 'number') {
    const parsed = new Date(val);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  if (!date || Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const STATUS_SELECT_CLASSES: Record<UserStatus, string> = {
  Aktif: 'border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold',
  Pending: 'border-amber-300 bg-amber-50 text-amber-900 font-semibold',
  Diblokir: 'border-red-300 bg-red-50 text-red-900 font-semibold',
};

export function PengaturanPenggunaPage() {
  const { userProfile } = useAuth();
  const { usersList, updateUserAccess } = useArchiveData();
  const { showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [savingUid, setSavingUid] = useState<string | null>(null);

  const statusCounts = useMemo(() => {
    const counts = { all: usersList.length, Aktif: 0, Pending: 0, Diblokir: 0 };
    for (const u of usersList) {
      if (u.status === 'Aktif') counts.Aktif += 1;
      else if (u.status === 'Diblokir') counts.Diblokir += 1;
      else counts.Pending += 1;
    }
    return counts;
  }, [usersList]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return usersList.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (q) {
        const hay = `${u.displayName} ${u.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [usersList, statusFilter, searchTerm]);

  if (userProfile?.role !== 'admin') {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
        Halaman ini hanya dapat diakses oleh Admin / Arsiparis Sub Bagian Pembinaan.
      </div>
    );
  }

  const handleUserChange = async (
    targetUser: UserProfile,
    updates: {
      role: UserRole;
      bidang: BidangId | '';
      status: UserStatus;
    }
  ) => {
    setSavingUid(targetUser.uid);
    try {
      await updateUserAccess(targetUser, updates);
      showToast(`Akses pengguna "${targetUser.displayName}" berhasil diperbarui.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal memperbarui pengguna.', 'error');
    } finally {
      setSavingUid(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cadangan & Pemulihan Database (Khusus Admin) */}
      <DatabaseBackupPanel />

      {/* Manajemen Pengguna */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold font-display text-slate-900">
                Manajemen Pengguna
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Setujui pendaftar baru (Pending → Aktif), tetapkan unit kerja (Bidang), atur Role, atau blokir akun pegawai yang mutasi dalam satu klik.
              </p>
            </div>
            {statusCounts.Pending > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 shrink-0">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>{statusCounts.Pending} akun menunggu persetujuan</span>
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Semua (${statusCounts.all})` },
                  { id: 'Pending', label: `Pending (${statusCounts.Pending})` },
                  { id: 'Aktif', label: `Aktif (${statusCounts.Aktif})` },
                  { id: 'Diblokir', label: `Diblokir (${statusCounts.Diblokir})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama atau email..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Nama &amp; Email</th>
                <th className="py-3 px-4 whitespace-nowrap">Waktu Login Terakhir</th>
                <th className="py-3 px-4">Bidang</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status Akses</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-xs text-slate-500">
                    Tidak ada akun pengguna yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isPrimary = isPrimaryAdminEmail(u.email);
                  const isSelf = u.uid === userProfile.uid;
                  const lockRoleAndStatus = isPrimary || isSelf;
                  const isSaving = savingUid === u.uid;

                  return (
                    <tr
                      key={u.uid}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        u.status === 'Pending' ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3 min-w-[220px]">
                          {u.photoURL ? (
                            <img
                              src={u.photoURL}
                              alt={u.displayName}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-emerald-800 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                              {u.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-slate-900 truncate">
                                {u.displayName}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                                  Anda
                                </span>
                              )}
                              {isPrimary && (
                                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-amber-300 font-semibold">
                                  <Lock className="w-2.5 h-2.5" />
                                  Admin Utama
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-mono-tabular truncate">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-600 font-mono-tabular whitespace-nowrap">
                        {formatLastLogin(u.lastLogin)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="space-y-1.5">
                          <select
                            aria-label={`Bidang untuk ${u.displayName}`}
                            disabled={isSaving}
                            value={u.bidang}
                            onChange={(e) =>
                              void handleUserChange(u, {
                                role: u.role,
                                bidang: e.target.value as BidangId | '',
                                status: u.status,
                              })
                            }
                            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white min-w-[200px] disabled:opacity-60"
                          >
                            {!isPrimary && <option value="">-- Belum Ditentukan --</option>}
                            {BIDANG_LIST.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.singkatan} — {b.nama}
                              </option>
                            ))}
                          </select>
                          <div>
                            <BidangBadge bidang={u.bidang} size="xs" />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <select
                          aria-label={`Role untuk ${u.displayName}`}
                          disabled={lockRoleAndStatus || isSaving}
                          value={isPrimary ? 'admin' : u.role}
                          title={
                            isPrimary
                              ? 'Role Admin Utama dikunci permanen'
                              : isSelf
                                ? 'Tidak dapat mengubah role akun Anda sendiri'
                                : undefined
                          }
                          onChange={(e) =>
                            void handleUserChange(u, {
                              role: e.target.value as UserRole,
                              bidang: u.bidang,
                              status: u.status,
                            })
                          }
                          className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white disabled:bg-slate-100 disabled:text-slate-600 disabled:cursor-not-allowed"
                        >
                          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Status Akses untuk ${u.displayName}`}
                            disabled={lockRoleAndStatus || isSaving}
                            value={isPrimary ? 'Aktif' : u.status}
                            title={
                              isPrimary
                                ? 'Status Admin Utama dikunci permanen (Aktif)'
                                : isSelf
                                  ? 'Tidak dapat menonaktifkan akun Anda sendiri'
                                  : undefined
                            }
                            onChange={(e) =>
                              void handleUserChange(u, {
                                role: u.role,
                                bidang: u.bidang,
                                status: e.target.value as UserStatus,
                              })
                            }
                            className={`text-xs border rounded-lg px-2.5 py-1.5 disabled:opacity-70 disabled:cursor-not-allowed ${
                              STATUS_SELECT_CLASSES[isPrimary ? 'Aktif' : u.status]
                            }`}
                          >
                            {USER_STATUS_OPTIONS.map((st) => (
                              <option key={st} value={st} className="bg-white text-slate-900">
                                {st}
                              </option>
                            ))}
                          </select>
                          {isSaving && (
                            <span className="text-[11px] text-slate-400">Menyimpan...</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
