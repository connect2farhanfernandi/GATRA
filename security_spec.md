# Security Specification — GATRA 2.0 Firestore Rules

## 1. Data Invariants
1. Setiap operasi baca/tulis mewajibkan akun Google terautentikasi dan terverifikasi (`request.auth != null && request.auth.token.email_verified == true`).
2. Pengguna pertama yang mendaftar mengunci `/system/bootstrap` secara atomik; pendaftar berikutnya tidak dapat memilih peran `admin` atau `pimpinan` secara mandiri.
3. Field `tanggalInput`, `createdAt`, dan `createdByUid` pada `/archives` bersifat permanen (immutable) setelah dibuat.
4. Staf Bidang hanya dapat membuat dan memperbarui arsip serta peminjaman milik `bidang` mereka sendiri.
5. Pimpinan hanya memiliki akses baca (read-only) dan dilarang menulis/mengubah/menghapus dokumen operasional apa pun.
6. Hanya Admin yang dapat mengubah `role`/`bidang` pengguna lain, mengelola `jra_master`, mengelola `library_items`, dan menambah/menghapus dokumen resmi di `dokumen_kearsipan` (Admin, Staf Bidang, dan Pimpinan aktif dapat membaca/mengunduh `dokumen_kearsipan`).
7. Dokumen `/metadata/statistik_satker` hanya menyimpan rekap numerik agregat per bidang tanpa rincian uraian/judul arsip; seluruh pengguna aktif dapat membaca dokumen tunggal ini, sementara Staf Bidang hanya diperbolehkan memperbarui kunci statistik milik `bidang` dirinya sendiri.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unverified Email Write**: Pengguna dengan `email_verified: false` mencoba membuat `/archives/doc1`.
2. **Self-Privilege Escalation**: Pengguna kedua mencoba membuat `/users/uid2` dengan `role: 'admin'` ketika `/system/bootstrap` sudah ada.
3. **Role Tampering Update**: Staf mencoba mengubah field `role` miliknya sendiri menjadi `'admin'` via `update`.
4. **PII Blanket Read**: Staf mencoba membaca profil `/users/otherUid` atau melakukan `list` pada `/users`.
5. **Cross-Bidang Archive Creation**: Staf `pidum` mencoba membuat arsip dengan `bidang: 'intelijen'`.
6. **Cross-Bidang Archive Update**: Staf `pidum` mencoba mengubah arsip milik `pidsus`.
7. **Immutable Tanggal Input Tampering**: Staf mencoba mengubah `tanggalInput` atau `createdAt` saat mengedit arsip miliknya.
8. **Pimpinan Write Attempt**: Pengguna ber-role `pimpinan` mencoba membuat atau mengedit arsip di `/archives`.
9. **Staf JRA Mutation**: Staf mencoba menambah atau menghapus kode di `/jra_master`.
10. **Shadow Field Injection**: Penyerang menyertakan field tak dikenal `isVerified: true` pada payload `/archives/doc1`.
11. **Oversized ID Poisoning**: Penyerang mencoba menulis dokumen dengan ID sepanjang > 128 karakter atau karakter ilegal `../admin`.
12. **Client Timestamp Forgery**: Pengguna mengirim `createdAt` bukan `request.time` atau `url: 'javascript:alert(1)'` pada `/library_items`.
