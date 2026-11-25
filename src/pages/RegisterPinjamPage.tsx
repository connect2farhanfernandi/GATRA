import React, { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { BIDANG_LIST, BIDANG_MAP } from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { BidangBadge, LoanStatusBadge } from '../components/BidangBadge';
import { downloadCsv } from '../lib/csv';
import { computeLoanStatus, getLoanOverdueDays, todayIsoDate } from '../lib/lifecycle';
import { BidangId, LoanItem, LoanStatus } from '../types/archive';

interface LoanFormState {
  nomor: string;
  tanggalPinjam: string;
  bidang: BidangId;
  kodeKlasifikasi: string;
  uraianBerkas: string;
  namaPeminjam: string;
  targetKembali: string;
  realisasiKembali: string;
  keterangan: string;
}

export function RegisterPinjamPage() {
  const { userProfile } = useAuth();
  const { loans, jraList, saveLoanItem, deleteLoanItem, loadingData } = useArchiveData();
  const { showToast } = useToast();

  const isAdmin = userProfile?.role === 'admin';
  const isPimpinan = userProfile?.role === 'pimpinan';
  const canMutate = !isPimpinan;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LoanStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<LoanFormState>({
    nomor: '1',
    tanggalPinjam: todayIsoDate(),
    bidang: userProfile?.bidang || 'pembinaan',
    kodeKlasifikasi: '',
    uraianBerkas: '',
    namaPeminjam: '',
    targetKembali: todayIsoDate(),
    realisasiKembali: '',
    keterangan: '',
  });

  const allowedJra = useMemo(() => {
    return jraList.filter(
      (j) => j.bidang === form.bidang || j.bidang === 'pembinaan'
    );
  }, [jraList, form.bidang]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter((l) => {
      const status = computeLoanStatus(l.targetKembali, l.realisasiKembali);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.namaPeminjam.toLowerCase().includes(q) ||
        l.uraianBerkas.toLowerCase().includes(q) ||
        l.kodeKlasifikasi.toLowerCase().includes(q) ||
        (l.keterangan || '').toLowerCase().includes(q)
      );
    });
  }, [loans, search, statusFilter]);

  const overdueCount = useMemo(
    () =>
      loans.filter(
        (l) => computeLoanStatus(l.targetKembali, l.realisasiKembali) === 'Terlambat'
      ).length,
    [loans]
  );

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      showToast('Tidak ada catatan peminjaman untuk diekspor.', 'error');
      return;
    }
    const headers = [
      'Nomor',
      'Tanggal Pinjam',
      'Kode Klasifikasi',
      'Uraian Informasi Berkas',
      'Nama Peminjam',
      'Bidang',
      'Batas Tanggal Kembali',
      'Realisasi Kembali',
      'Status Pinjam',
      'Keterangan',
    ];
    const rows = filtered.map((loan) => {
      const status = computeLoanStatus(loan.targetKembali, loan.realisasiKembali);
      const daysLate = getLoanOverdueDays(loan.targetKembali, loan.realisasiKembali);
      const statusText =
        status === 'Terlambat' && daysLate > 0
          ? `Jatuh Tempo (Terlambat ${daysLate} Hari)`
          : status === 'Terlambat'
            ? 'Jatuh Tempo'
            : status;
      return [
        loan.nomor,
        loan.tanggalPinjam,
        loan.kodeKlasifikasi,
        loan.uraianBerkas,
        loan.namaPeminjam,
        BIDANG_MAP[loan.bidang]?.singkatan || loan.bidang,
        loan.targetKembali,
        loan.realisasiKembali || '-',
        statusText,
        loan.keterangan || '-',
      ];
    });
    downloadCsv(`Register_Peminjaman_Arsip_${todayIsoDate()}.csv`, headers, rows);
    showToast(`Berhasil mengunduh ${filtered.length} data peminjaman ke CSV.`);
  };

  const openAdd = () => {
    const b = userProfile?.bidang || 'pembinaan';
    const nextNum = loans.length > 0 ? Math.max(...loans.map((l) => Number(l.nomor))) + 1 : 1;
    const eligible = jraList.filter((j) => j.bidang === b || j.bidang === 'pembinaan');
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 7);
    const targetStr = targetDate.toISOString().slice(0, 10);

    setEditingLoan(null);
    setForm({
      nomor: String(nextNum),
      tanggalPinjam: todayIsoDate(),
      bidang: b,
      kodeKlasifikasi: eligible[0]?.kodeKlasifikasi || '',
      uraianBerkas: '',
      namaPeminjam: '',
      targetKembali: targetStr,
      realisasiKembali: '',
      keterangan: '',
    });
    setModalOpen(true);
  };

  const openEdit = (loan: LoanItem) => {
    setEditingLoan(loan);
    setForm({
      nomor: String(loan.nomor),
      tanggalPinjam: loan.tanggalPinjam,
      bidang: loan.bidang,
      kodeKlasifikasi: loan.kodeKlasifikasi,
      uraianBerkas: loan.uraianBerkas,
      namaPeminjam: loan.namaPeminjam,
      targetKembali: loan.targetKembali,
      realisasiKembali: loan.realisasiKembali,
      keterangan: loan.keterangan,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.kodeKlasifikasi.trim() ||
      !form.uraianBerkas.trim() ||
      !form.namaPeminjam.trim() ||
      !form.tanggalPinjam ||
      !form.targetKembali
    ) {
      showToast('Mohon lengkapi seluruh kolom wajib peminjaman.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveLoanItem(
        {
          nomor: Math.max(1, Number(form.nomor) || 1),
          tanggalPinjam: form.tanggalPinjam,
          bidang: form.bidang,
          kodeKlasifikasi: form.kodeKlasifikasi.trim().slice(0, 60),
          uraianBerkas: form.uraianBerkas.trim().slice(0, 1000),
          namaPeminjam: form.namaPeminjam.trim().slice(0, 150),
          targetKembali: form.targetKembali,
          realisasiKembali: form.realisasiKembali.trim().slice(0, 30),
          keterangan: form.keterangan.trim().slice(0, 1000),
        },
        editingLoan || undefined
      );
      showToast(
        editingLoan ? 'Data peminjaman diperbarui.' : 'Peminjaman arsip berhasil dicatat.'
      );
      setModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan peminjaman.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (loan: LoanItem) => {
    try {
      await deleteLoanItem(loan.id);
      showToast(`Catatan peminjaman #${loan.nomor} dihapus.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus catatan.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold font-display text-slate-900">
            Register Peminjaman Arsip (REGISTER_PINJAM)
          </h2>
          <p className="text-xs text-slate-500">
            Status peminjaman dihitung otomatis: Dikembalikan, Terlambat, atau Dipinjam berdasarkan tanggal realisasi kembali.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loadingData || filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Register Pinjam (CSV)</span>
          </button>
          {canMutate && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Catat Peminjaman</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama peminjam, uraian berkas, atau kode klasifikasi..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="loan-status-filter" className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Status Pinjam
            </label>
            <select
              id="loan-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | LoanStatus)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
            >
              <option value="all">Semua Status ({loans.length})</option>
              <option value="Dipinjam">Dipinjam</option>
              <option value="Terlambat">Jatuh Tempo / Terlambat ({overdueCount})</option>
              <option value="Dikembalikan">Dikembalikan</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {overdueCount > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-800 border border-red-200 font-semibold whitespace-nowrap">
              {overdueCount} Peminjaman Jatuh Tempo
            </span>
          )}
          <span className="text-slate-500 whitespace-nowrap">
            Menampilkan <strong className="text-slate-900 font-mono-tabular">{filtered.length}</strong> data
          </span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-3 px-3">Nomor</th>
                <th className="py-3 px-3 whitespace-nowrap">Tanggal Pinjam</th>
                <th className="py-3 px-3 whitespace-nowrap">Kode Klasifikasi</th>
                <th className="py-3 px-3 min-w-[220px]">Uraian Informasi Berkas</th>
                <th className="py-3 px-3 whitespace-nowrap">Nama Peminjam</th>
                <th className="py-3 px-3">Bidang</th>
                <th className="py-3 px-3 whitespace-nowrap">Batas Tanggal Kembali</th>
                <th className="py-3 px-3 whitespace-nowrap">Realisasi Kembali</th>
                <th className="py-3 px-3 whitespace-nowrap">Status Pinjam</th>
                <th className="py-3 px-3 min-w-[140px]">Keterangan</th>
                {canMutate && <th className="py-3 px-3 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loadingData ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
                    Memuat register peminjaman...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
                    Belum ada catatan peminjaman arsip yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filtered.map((loan) => {
                  const status = computeLoanStatus(loan.targetKembali, loan.realisasiKembali);
                  const daysLate = getLoanOverdueDays(loan.targetKembali, loan.realisasiKembali);
                  const isOverdue = status === 'Terlambat';
                  return (
                    <tr
                      key={loan.id}
                      className={
                        isOverdue
                          ? 'bg-red-50/75 hover:bg-red-100/70'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-3 px-3 font-mono-tabular text-slate-600">{loan.nomor}</td>
                      <td className="py-3 px-3 font-mono-tabular text-xs whitespace-nowrap">
                        {loan.tanggalPinjam}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                        {loan.kodeKlasifikasi}
                      </td>
                      <td className="py-3 px-3 text-slate-700 leading-snug">{loan.uraianBerkas}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 whitespace-nowrap">
                        {loan.namaPeminjam}
                      </td>
                      <td className="py-3 px-3">
                        <BidangBadge bidang={loan.bidang} size="xs" />
                      </td>
                      <td
                        className={`py-3 px-3 font-mono-tabular text-xs whitespace-nowrap ${
                          isOverdue ? 'font-semibold text-red-800' : ''
                        }`}
                      >
                        {loan.targetKembali}
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-xs whitespace-nowrap">
                        {loan.realisasiKembali || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <LoanStatusBadge status={status} daysLate={daysLate} />
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600">
                        {loan.keterangan || '—'}
                      </td>
                      {canMutate && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(loan)}
                              title="Edit Peminjaman"
                              className="p-1.5 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(loan)}
                              title="Hapus Peminjaman"
                              className="p-1.5 rounded text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold font-display text-slate-900">
                {editingLoan ? 'Edit Peminjaman Arsip' : 'Catat Peminjaman Arsip'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Nomor Urut</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.nomor}
                    onChange={(e) => setForm({ ...form, nomor: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">Bidang</label>
                  <select
                    disabled={!isAdmin}
                    value={form.bidang}
                    onChange={(e) =>
                      setForm({ ...form, bidang: e.target.value as BidangId })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    {BIDANG_LIST.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.singkatan}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Kode Klasifikasi (Master JRA)
                </label>
                <select
                  required
                  value={form.kodeKlasifikasi}
                  onChange={(e) => setForm({ ...form, kodeKlasifikasi: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Pilih Kode Klasifikasi --</option>
                  {allowedJra.map((j) => (
                    <option key={j.id} value={j.kodeKlasifikasi}>
                      [{j.kodeKlasifikasi}] — {j.uraian}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Uraian Informasi Berkas
                </label>
                <textarea
                  rows={2}
                  required
                  maxLength={1000}
                  value={form.uraianBerkas}
                  onChange={(e) => setForm({ ...form, uraianBerkas: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Nama Peminjam</label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={form.namaPeminjam}
                  onChange={(e) => setForm({ ...form, namaPeminjam: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Tanggal Pinjam <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={form.tanggalPinjam}
                    onChange={(e) => setForm({ ...form, tanggalPinjam: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Batas Tanggal Kembali <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={form.targetKembali}
                    onChange={(e) => setForm({ ...form, targetKembali: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Realisasi Kembali
                  </label>
                  <input
                    type="date"
                    value={form.realisasiKembali}
                    onChange={(e) => setForm({ ...form, realisasiKembali: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Keterangan</label>
                <input
                  type="text"
                  maxLength={1000}
                  value={form.keterangan}
                  onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Peminjaman'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
