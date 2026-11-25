import { BIDANG_MAP } from '../constants/bidang';
import { ArchiveLifecycleStatus, BidangId, LoanStatus } from '../types/archive';

export function BidangBadge({
  bidang,
  fullName = false,
  size = 'sm',
}: {
  bidang: BidangId | '';
  fullName?: boolean;
  size?: 'xs' | 'sm';
}) {
  const paddingClass = size === 'xs' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs';

  if (!bidang || !BIDANG_MAP[bidang]) {
    return (
      <span
        className={`inline-flex items-center font-medium rounded whitespace-nowrap shrink-0 bg-slate-100 text-slate-600 border border-slate-300 ${paddingClass}`}
      >
        Belum Ditentukan
      </span>
    );
  }

  const cfg = BIDANG_MAP[bidang];

  return (
    <span
      className={`inline-flex items-center font-semibold rounded whitespace-nowrap shrink-0 ${paddingClass}`}
      style={{
        backgroundColor: cfg.bgHex,
        color: cfg.textHex,
        border: cfg.needsDarkBorder ? `1.5px solid ${cfg.borderHex}` : `1px solid ${cfg.borderHex}`,
      }}
    >
      {fullName ? cfg.nama : cfg.singkatan}
    </span>
  );
}

export function LifecycleStatusBadge({ status }: { status: ArchiveLifecycleStatus }) {
  const styles: Record<ArchiveLifecycleStatus, string> = {
    Aktif: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Inaktif: 'bg-amber-50 text-amber-900 border-amber-200',
    'Usul Musnah': 'bg-red-50 text-red-800 border-red-200',
    Musnah: 'bg-slate-900 text-white border-slate-900',
    'Pendataan Arsip Statis': 'bg-slate-100 text-slate-800 border-slate-300',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function LoanStatusBadge({
  status,
  daysLate = 0,
}: {
  status: LoanStatus;
  daysLate?: number;
}) {
  const styles: Record<LoanStatus, string> = {
    Dikembalikan: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    Terlambat: 'bg-red-100 text-red-900 border-red-300 font-semibold',
    Dipinjam: 'bg-amber-50 text-amber-900 border-amber-200',
  };

  const label =
    status === 'Terlambat' && daysLate > 0
      ? `Jatuh Tempo (Terlambat ${daysLate} Hari)`
      : status === 'Terlambat'
        ? 'Jatuh Tempo'
        : status;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border whitespace-nowrap shrink-0 ${styles[status]}`}
    >
      {label}
    </span>
  );
}
