/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Camera, UserPlus, ShieldCheck, History, Lock,
  Sun, Moon,
} from 'lucide-react';
import { cn } from './lib/utils';
import { useUIStore } from './store/uiStore';
import { useSettingsStore } from './store/settingsStore';
import { useLicenseStore } from './store/licenseStore';
import { useFaceModels } from './hooks/useFaceModels';
import { useCamera } from './hooks/useCamera';
import { useSocketSync } from './hooks/useSocketSync';
import { useInitialize } from './hooks/useInitialize';
import LoadingScreen from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import type { Accent, TabType } from './types';

// Code-split each feature so heavy components load on demand
const ScannerView = lazy(() => import('./features/scanner/ScannerView'));
const EnrollmentView = lazy(() => import('./features/enrollment/EnrollmentView'));
const HistoryView = lazy(() => import('./features/history/HistoryView'));
const AdminView = lazy(() => import('./features/admin/AdminView'));

// ── Nav button ───────────────────────────────────────────────────────────────
function NavBtn({
  active, onClick, label, icon,
}: {
  active: boolean; onClick: () => void; label: string; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 sm:px-6 py-2.5 rounded-xl transition-all duration-200 flex items-center space-x-2.5 group cursor-pointer',
        active
          ? 'bg-accent-emerald text-white shadow-sm shadow-accent-emerald/20'
          : 'text-text-secondary hover:text-text-primary hover:bg-black/5'
      )}
    >
      <span className={cn('transition-colors', active ? 'text-white' : 'text-text-secondary group-hover:text-accent-emerald')}>
        {icon}
      </span>
      <span className="hidden md:inline text-[11px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

// ── Live clock (memoized to avoid re-rendering parent) ───────────────────────
function LiveClock() {
  const [time, setTime] = React.useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right">
      <div className="text-xs font-bold text-text-primary uppercase">
        {time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
      <div className="text-[10px] font-mono text-text-secondary uppercase mt-0.5">
        {time.toLocaleTimeString()}
      </div>
    </div>
  );
}

// ── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const isModelsLoaded = useUIStore((s) => s.isModelsLoaded);
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const accent = useSettingsStore((s) => s.accent);
  const setAccent = useSettingsStore((s) => s.setAccent);
  const isLicenseValid = useLicenseStore((s) => s.isLicenseValid);

  // Boot-time side effects (models, cameras, socket, server data)
  useFaceModels();
  useCamera();
  useSocketSync();
  useInitialize();

  // Apply theme + accent to the document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', accent);
  }, [accent]);

  // License gate: lets the user reach the Admin tab to activate, but blocks every
  // other tab until a valid license is present.
  if (!isLicenseValid && isModelsLoaded && activeTab !== 'admin') {
    return (
      <div className="min-h-screen bg-background text-text-primary font-sans flex items-center justify-center p-6">
        <div className="max-w-md mx-auto text-center glass-card p-10">
          <Lock className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="text-2xl font-extrabold text-text-primary uppercase tracking-tight mb-4">License Required</h1>
          <p className="text-text-secondary mb-8">This application requires a valid license to operate. Open the Admin panel to activate one.</p>
          <button
            onClick={() => setActiveTab('admin')}
            className="w-full py-4 bg-accent-emerald text-black rounded-xl font-black text-sm tracking-[0.2em] uppercase mb-3"
          >
            GO TO LICENSE ACTIVATION
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-surface text-text-secondary rounded-xl font-black text-xs tracking-[0.2em] uppercase border border-surface-border hover:border-accent-emerald transition-all"
          >
            REFRESH
          </button>
        </div>
      </div>
    );
  }

  if (!isModelsLoaded) return <LoadingScreen />;

  const navItems: { tab: TabType; label: string; icon: React.ReactNode }[] = [
    { tab: 'scan',     label: 'Scanner', icon: <Camera className="w-4 h-4" /> },
    { tab: 'register', label: 'Enroll',  icon: <UserPlus className="w-4 h-4" /> },
    { tab: 'history',  label: 'Logs',    icon: <History className="w-4 h-4" /> },
    { tab: 'admin',    label: 'Admin',   icon: <Lock className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background text-text-primary font-sans selection:bg-accent-emerald/30">
      {/* Navigation bar */}
      <nav className="h-[72px] border-b border-surface-border px-6 sm:px-10 flex items-center justify-between sticky top-0 z-50 backdrop-blur-xl bg-background/80">
        {/* Brand */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <div className="w-10 h-10 bg-accent-emerald rounded-xl flex items-center justify-center shadow-sm flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-extrabold tracking-tight uppercase leading-none text-text-primary">
              Sentinel Pickup
            </h1>
            <p className="text-[10px] font-medium text-text-secondary mt-1 uppercase tracking-widest opacity-70">
              Main Campus Entry Point
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex bg-surface border border-surface-border p-1 rounded-2xl shadow-sm">
          {navItems.map(({ tab, label, icon }) => (
            <NavBtn
              key={tab}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              label={label}
              icon={icon}
            />
          ))}
        </div>

        {/* Right controls */}
        <div className="hidden md:flex items-center space-x-6">
          {/* Accent dots */}
          <div className="flex items-center bg-surface p-1 rounded-lg border border-surface-border">
            <div className="flex items-center space-x-1 px-1">
              {(['emerald', 'blue', 'purple', 'amber', 'rose'] as Accent[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setAccent(a)}
                  className={cn(
                    'w-2.5 h-2.5 rounded-full transition-all border border-white/10',
                    accent === a ? 'scale-125 border-white' : 'opacity-40 hover:opacity-100',
                    a === 'emerald' && 'bg-[#10b981]',
                    a === 'blue'    && 'bg-[#3b82f6]',
                    a === 'purple'  && 'bg-[#a855f7]',
                    a === 'amber'   && 'bg-[#f59e0b]',
                    a === 'rose'    && 'bg-[#f43f5e]'
                  )}
                />
              ))}
            </div>
          </div>

          {/* Theme toggle */}
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-surface-border bg-surface hover:border-accent-emerald transition-all cursor-pointer group"
          >
            {theme === 'light'
              ? <Moon className="w-4 h-4 text-text-secondary group-hover:text-accent-emerald" />
              : <Sun className="w-4 h-4 text-text-secondary group-hover:text-amber-400" />}
          </button>

          {/* System live badge */}
          <div className="status-badge">
            <span className="w-1.5 h-1.5 bg-accent-emerald rounded-full mr-2 animate-pulse" />
            System Live
          </div>
          <div className="status-badge">
            <span className="w-1.5 h-1.5 bg-accent-emerald rounded-full mr-2 animate-pulse" />
            <a href='/logout' className="text-[10px] font-bold text-text-secondary hover:text-accent-emerald uppercase tracking-widest">
              Logout
            </a>
          </div>

          <LiveClock />
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto p-4 sm:p-6 md:p-10">
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[40vh]">
                <div className="text-[10px] font-black uppercase tracking-widest text-text-secondary animate-pulse">
                  Loading module...
                </div>
              </div>
            }
          >
            <AnimatePresence mode="wait">
              {activeTab === 'scan'     && <ScannerView    key="scan" />}
              {activeTab === 'register' && <EnrollmentView key="register" />}
              {activeTab === 'history'  && <HistoryView    key="history" />}
              {activeTab === 'admin'    && <AdminView      key="admin" />}
            </AnimatePresence>
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
