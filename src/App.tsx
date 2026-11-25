import { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './context/AuthContext';
import { ArchiveDataProvider } from './context/ArchiveDataContext';
import { AuthGate } from './components/AuthGate';
import { NavPage, SidebarLayout } from './components/SidebarLayout';
import { DashboardPage } from './pages/DashboardPage';
import { InputUtamaPage } from './pages/InputUtamaPage';
import { DistribusiPage } from './pages/DistribusiPage';
import { RegisterPinjamPage } from './pages/RegisterPinjamPage';
import { PemindahanArsipPage } from './pages/PemindahanArsipPage';
import { ManajemenDokumenPage } from './pages/ManajemenDokumenPage';
import { MasterJraPage } from './pages/MasterJraPage';
import { PustakaPage } from './pages/PustakaPage';
import { PengaturanPenggunaPage } from './pages/PengaturanPenggunaPage';
import { ArsipVitalPage } from './pages/ArsipVitalPage';
import { LaporanArsipPage } from './pages/LaporanArsipPage';
import { ArsipDimusnahkanPage } from './pages/ArsipDimusnahkanPage';

function WorkspaceRouter() {
  const [activePage, setActivePage] = useState<NavPage>('dashboard');

  return (
    <SidebarLayout activePage={activePage} onNavigate={setActivePage}>
      {activePage === 'dashboard' && <DashboardPage onNavigate={setActivePage} />}
      {activePage === 'input_utama' && <InputUtamaPage />}
      {activePage === 'central_file' && <DistribusiPage mode="central_file" />}
      {activePage === 'record_center' && <DistribusiPage mode="record_center" />}
      {activePage === 'usul_musnah' && <DistribusiPage mode="usul_musnah" />}
      {activePage === 'arsip_dimusnahkan' && <ArsipDimusnahkanPage />}
      {activePage === 'arsip_statis' && <DistribusiPage mode="arsip_statis" />}
      {activePage === 'arsip_vital' && <ArsipVitalPage />}
      {activePage === 'register_pinjam' && <RegisterPinjamPage />}
      {activePage === 'pemindahan_arsip' && <PemindahanArsipPage />}
      {activePage === 'manajemen_dokumen' && <ManajemenDokumenPage />}
      {activePage === 'laporan_arsip' && <LaporanArsipPage />}
      {activePage === 'master_jra' && <MasterJraPage />}
      {activePage === 'pustaka' && <PustakaPage />}
      {activePage === 'pengaturan_pengguna' && <PengaturanPenggunaPage />}
    </SidebarLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AuthGate>
            <ArchiveDataProvider>
              <WorkspaceRouter />
            </ArchiveDataProvider>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
