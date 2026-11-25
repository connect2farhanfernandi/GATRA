import React, { useMemo, useState } from 'react';
import { ExternalLink, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { LIBRARY_CATEGORIES } from '../constants/bidang';
import { useAuth } from '../context/AuthContext';
import { useArchiveData } from '../context/ArchiveDataContext';
import { useToast } from '../components/Toast';
import { isSafeHttpUrl } from '../lib/lifecycle';
import { LibraryCategory, LibraryItem } from '../types/archive';

interface LibraryFormState {
  judul: string;
  kategori: LibraryCategory;
  deskripsi: string;
  url: string;
}

export function PustakaPage() {
  const { userProfile } = useAuth();
  const { libraryItems, saveLibraryItem, deleteLibraryItem, loadingData } = useArchiveData();
  const { showToast } = useToast();

  const isAdmin = userProfile?.role === 'admin';
  const isPimpinan = userProfile?.role === 'pimpinan';

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | LibraryCategory>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<LibraryFormState>({
    judul: '',
    kategori: 'Pedoman Klasifikasi Arsip',
    deskripsi: '',
    url: '',
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return libraryItems.filter((item) => {
      if (filterCategory !== 'all' && item.kategori !== filterCategory) return false;
      if (!q) return true;
      return (
        item.judul.toLowerCase().includes(q) ||
        item.deskripsi.toLowerCase().includes(q)
      );
    });
  }, [libraryItems, filterCategory, search]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({
      judul: '',
      kategori: 'Pedoman Klasifikasi Arsip',
      deskripsi: '',
      url: '',
    });
    setModalOpen(true);
  };

  const openEdit = (item: LibraryItem) => {
    setEditingItem(item);
    setForm({
      judul: item.judul,
      kategori: item.kategori,
      deskripsi: item.deskripsi,
      url: item.url,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.judul.trim()) {
      showToast('Judul dokumen wajib diisi.', 'error');
      return;
    }
    if (!isSafeHttpUrl(form.url)) {
      showToast('Tautan URL wajib diawali http:// atau https://.', 'error');
      return;
    }

    setSaving(true);
    try {
      await saveLibraryItem(
        {
          judul: form.judul.trim().slice(0, 200),
          kategori: form.kategori,
          deskripsi: form.deskripsi.trim().slice(0, 1000),
          url: form.url.trim().slice(0, 1000),
        },
        editingItem?.id
      );
      showToast(editingItem ? 'Materi pustaka diperbarui.' : 'Materi pustaka ditambahkan.');
      setModalOpen(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan materi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: LibraryItem) => {
    try {
      await deleteLibraryItem(item.id);
      showToast(`Materi "${item.judul}" dihapus.`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus materi.', 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold font-display text-slate-900">
            Pustaka &amp; Unduhan Materi Kearsipan
          </h2>
          <p className="text-xs text-slate-500">
            Pusat rujukan Pedoman Klasifikasi Arsip, JRA, SOP Kearsipan, dan E-Book/Modul untuk seluruh pegawai Kejari Grobogan.
          </p>
        </div>

        {!isPimpinan && isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Materi</span>
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul dokumen atau deskripsi..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setFilterCategory('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              filterCategory === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua
          </button>
          {LIBRARY_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                filterCategory === cat
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loadingData ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Memuat pustaka materi...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Belum ada dokumen materi kearsipan yang ditambahkan.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const safeUrl = isSafeHttpUrl(item.url) ? item.url : '#';
            return (
              <div
                key={item.id}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="text-xs font-medium text-emerald-800">{item.kategori}</div>
                  <h3 className="text-base font-semibold font-display text-slate-900 leading-snug">
                    {item.judul}
                  </h3>
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {item.deskripsi || 'Dokumen referensi resmi kearsipan.'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Pratinjau</span>
                    </button>

                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Unduh / Buka Materi</span>
                    </a>
                  </div>

                  {!isPimpinan && isAdmin && (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        title="Edit Materi"
                        className="p-1.5 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        title="Hapus Materi"
                        className="p-1.5 rounded text-slate-500 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Pratinjau Materi */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-medium text-emerald-800">{previewItem.kategori}</div>
                <h3 className="text-base font-semibold font-display text-slate-900 mt-0.5">
                  {previewItem.judul}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-700 leading-relaxed">
              {previewItem.deskripsi || 'Tidak ada deskripsi tambahan.'}
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 break-all font-mono-tabular">
              Tautan Sumber: {previewItem.url}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Tutup
              </button>
              <a
                href={isSafeHttpUrl(previewItem.url) ? previewItem.url : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Unduh / Buka Materi</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah / Edit Materi */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-semibold font-display text-slate-900">
                {editingItem ? 'Edit Materi Pustaka' : 'Tambah Materi Kearsipan'}
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
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Judul Dokumen</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  value={form.judul}
                  onChange={(e) => setForm({ ...form, judul: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Kategori</label>
                <select
                  value={form.kategori}
                  onChange={(e) =>
                    setForm({ ...form, kategori: e.target.value as LibraryCategory })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {LIBRARY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Deskripsi Singkat</label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={form.deskripsi}
                  onChange={(e) => setForm({ ...form, deskripsi: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">
                  Tautan URL / Google Drive File PDF
                </label>
                <input
                  type="url"
                  required
                  maxLength={1000}
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://drive.google.com/file/d/..."
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
                  {saving ? 'Menyimpan...' : 'Simpan Materi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
