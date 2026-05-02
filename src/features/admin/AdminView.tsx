import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Lock, Search, Database, Download, Upload, FileJson, ShieldCheck,
  Trash2, Palette, Eye, EyeOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRegistryStore } from '../../store/registryStore';
import { useUIStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useBackup } from '../../hooks/useBackup';
import { exportRegistryToPDF, exportTechnicalDoc, exportPresentationDoc } from '../../lib/pdfExport';
import type { BackupInterval, Accent } from '../../types';

type AdminView = 'registry' | 'settings';

export default function AdminView() {
  const registry = useRegistryStore((s) => s.registry);
  const removeEntry = useRegistryStore((s) => s.removeEntry);
  const isAuthenticated = useUIStore((s) => s.isAdminAuthenticated);
  const isLoginError = useUIStore((s) => s.isLoginError);
  const setAdminAuthenticated = useUIStore((s) => s.setAdminAuthenticated);
  const setLoginError = useUIStore((s) => s.setLoginError);
  const systemSettings = useSettingsStore((s) => s.systemSettings);
  const setSystemSettings = useSettingsStore((s) => s.setSystemSettings);
  const backupInterval = useSettingsStore((s) => s.backupInterval);
  const setBackupInterval = useSettingsStore((s) => s.setBackupInterval);
  const accent = useSettingsStore((s) => s.accent);
  const setAccent = useSettingsStore((s) => s.setAccent);
  const { exportBackup, importBackup } = useBackup();

  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [view, setView] = useState<AdminView>('registry');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState(systemSettings.systemPassword ?? '');
  const [showNewPass, setShowNewPass] = useState(false);
  const [saveStatus, setSaveStatus] = useState(false);

  const filteredRegistry = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return registry.filter((p) =>
      p.childName.toLowerCase().includes(q) ||
      p.scholarNo.toLowerCase().includes(q) ||
      p.guardians?.some((g) => g.name.toLowerCase().includes(q))
    );
  }, [registry, searchTerm]);

  const handleLogin = useCallback((password: string) => {
    if (password === systemSettings.systemPassword) {
      setAdminAuthenticated(true);
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  }, [systemSettings.systemPassword, setAdminAuthenticated, setLoginError]);

  const handleSavePassword = useCallback(async () => {
    await setSystemSettings({ ...systemSettings, systemPassword: newPassword });
    setSaveStatus(true);
    setTimeout(() => setSaveStatus(false), 2000);
  }, [systemSettings, newPassword, setSystemSettings]);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await importBackup(file);
    alert(ok ? 'Backup restored successfully.' : 'Failed to read backup file.');
    e.target.value = '';
  }, [importBackup]);

  if (!isAuthenticated) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md mx-auto mt-20 p-10 glass-card text-center"
      >
        <Lock className="w-12 h-12 text-accent-emerald mx-auto mb-6" />
        <h2 className="text-xl font-extrabold text-text-primary uppercase tracking-tight mb-2">Admin Access</h2>
        <p className="text-xs text-text-secondary mb-8 uppercase tracking-widest">Master Credentials Required</p>
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(pass); }} className="space-y-4">
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="ACCESS TOKEN"
              className={cn(
                'w-full bg-surface border rounded-xl px-5 py-4 text-center text-sm font-black tracking-[0.2em] uppercase outline-none transition-all',
                isLoginError
                  ? 'border-red-500 text-red-500 animate-shake'
                  : 'border-surface-border text-text-primary focus:border-accent-emerald'
              )}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-all cursor-pointer"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="submit"
            className="w-full py-4 bg-white text-black rounded-xl font-black text-xs tracking-[0.3em] uppercase hover:bg-accent-emerald transition-all cursor-pointer"
          >
            Authenticate
          </button>
        </form>
        {isLoginError && (
          <p className="text-[10px] text-red-500 mt-4 uppercase font-bold tracking-widest">Invalid Security Token</p>
        )}
        <p className="text-[10px] text-white/20 mt-6 uppercase">Tip: Check master config in local drive data folder</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-0"
    >
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="text-center xl:text-left">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight uppercase mb-1">Registry Control</h2>
          <p className="text-text-secondary text-[10px] sm:text-xs font-medium tracking-tight uppercase">Authorized Student & Guardian Records</p>
        </div>

        <div className="flex flex-wrap items-center justify-center xl:justify-end gap-2 sm:gap-3">
          <button
            onClick={() => setView(view === 'registry' ? 'settings' : 'registry')}
            className={cn(
              'flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-3 border rounded-xl transition-all cursor-pointer',
              view === 'settings' ? 'bg-white text-black border-white' : 'bg-surface hover:bg-white/10 border-surface-border text-text-primary'
            )}
          >
            <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">{view === 'registry' ? 'Settings' : 'Registry'}</span>
          </button>

          <div className="hidden sm:flex bg-surface p-1 rounded-xl border border-surface-border mr-2 items-center space-x-2 px-3 self-stretch">
            <Database className="w-4 h-4 text-accent-emerald opacity-50" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-text-primary uppercase italic leading-tight">Master Database</span>
              <span className="text-[8px] font-bold text-text-secondary uppercase tracking-widest leading-tight">Persistence Tier A</span>
            </div>
          </div>

          <button onClick={exportBackup} className="flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-3 bg-surface hover:bg-white/10 border border-surface-border rounded-xl transition-all cursor-pointer">
            <FileJson className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-emerald" />
            <span className="text-[9px] sm:text-[10px] font-black text-text-primary uppercase tracking-widest">Backup</span>
          </button>

          <label className="flex items-center space-x-2 px-3 sm:px-4 py-2 sm:py-3 bg-surface hover:bg-white/10 border border-surface-border rounded-xl transition-all cursor-pointer">
            <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-emerald" />
            <span className="text-[9px] sm:text-[10px] font-black text-text-primary uppercase tracking-widest">Restore</span>
            <input type="file" accept=".json" onChange={handleImport} className="hidden" />
          </label>

          <div className="flex bg-surface p-1 rounded-xl border border-surface-border items-center">
            <span className="hidden xs:block text-[8px] font-black text-text-secondary uppercase tracking-widest px-2">Auto-Save:</span>
            <div className="flex space-x-1">
              {(['off', 'daily', 'weekly'] as BackupInterval[]).map((int) => (
                <button
                  key={int}
                  onClick={() => setBackupInterval(int)}
                  className={cn(
                    'px-1.5 sm:px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all',
                    backupInterval === int ? 'bg-accent-emerald text-black' : 'text-text-secondary hover:text-white hover:bg-white/5'
                  )}
                >
                  {int}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-8 bg-surface-border mx-2 hidden xl:block" />

          <button onClick={exportTechnicalDoc} className="bg-surface hover:bg-white/10 px-3 sm:px-4 py-2 sm:py-3 rounded-xl border border-surface-border text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-text-secondary flex items-center space-x-2 transition-all cursor-pointer">
            <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">Technical</span>
          </button>

          <button onClick={() => exportRegistryToPDF(registry)} className="bg-accent-emerald text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-lg shadow-accent-emerald/20 text-[10px] sm:text-[11px] font-black uppercase tracking-widest flex items-center space-x-2 transition-all cursor-pointer">
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Export PDF</span>
          </button>
        </div>
      </div>

      {view === 'registry' ? (
        <>
          {/* Search bar */}
          <div className="glass-card p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                placeholder="SEARCH BY STUDENT, SCHOLAR ID, OR GUARDIAN NAME..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface border border-surface-border rounded-xl pl-12 pr-4 py-3 text-[10px] sm:text-xs font-bold text-text-primary placeholder:text-text-secondary/30 outline-none focus:ring-1 focus:ring-accent-emerald/50 focus:border-accent-emerald transition-all"
              />
            </div>
            <div className="flex items-center justify-between w-full sm:w-auto space-x-2 text-[10px] font-black text-text-secondary uppercase tracking-widest px-2">
              <div className="flex items-center space-x-2">
                <Database className="w-3 h-3" />
                <span>Matches: {filteredRegistry.length}</span>
              </div>
            </div>
          </div>

          {/* Registry table */}
          <div className="lg:glass-card overflow-hidden">
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-surface-border bg-background">
                    {['Profiles', 'Student Detail', 'Authorized Guardian', 'Class/Sec', 'Scholar ID', 'Actions'].map((h) => (
                      <th key={h} className={cn('px-6 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary', h === 'Actions' && 'text-right')}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {filteredRegistry.map((person) => (
                    <tr key={person.id} className="hover:bg-accent-emerald-alpha transition-all group">
                      <td className="px-6 py-5">
                        <div className="flex -space-x-2">
                          <div className="w-10 h-10 rounded-lg border-2 border-surface bg-background overflow-hidden ring-2 ring-surface-border">
                            {person.studentPhoto && <img src={person.studentPhoto} alt="Student" className="w-full h-full object-cover" />}
                          </div>
                          {person.guardians?.map((g, gi) => (
                            <div key={gi} className="w-10 h-10 rounded-lg border-2 border-surface bg-background overflow-hidden ring-2 ring-surface-border" title={g.name}>
                              {g.photo && <img src={g.photo} alt={g.role} className="w-full h-full object-cover" />}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className="text-sm font-bold text-text-primary uppercase italic">{person.childName}</span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          {person.guardians?.map((g, gi) => (
                            <div key={gi} className="flex flex-col">
                              <span className="text-[11px] font-bold text-text-primary">{g.name}</span>
                              <span className="text-[8px] font-black uppercase text-accent-emerald tracking-widest">{g.role}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-5"><span className="text-xs font-mono text-text-secondary">{person.classSec}</span></td>
                      <td className="px-6 py-5"><span className="text-xs font-mono text-accent-emerald">{person.scholarNo}</span></td>
                      <td className="px-6 py-5 text-right">
                        {confirmDeleteId === person.id ? (
                          <div className="flex items-center justify-end space-x-2">
                            <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-1.5 text-[8px] font-black uppercase text-text-secondary hover:text-white transition-all cursor-pointer">Cancel</button>
                            <button onClick={() => { removeEntry(person.id); setConfirmDeleteId(null); }} className="px-3 py-1.5 bg-red-500 text-white text-[8px] font-black uppercase rounded-lg cursor-pointer">Confirm</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(person.id)} className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRegistry.length === 0 && (
                <div className="p-12 text-center text-text-secondary uppercase text-[10px] font-black tracking-widest font-mono">
                  {registry.length === 0 ? 'No students enrolled.' : 'No results match your search.'}
                </div>
              )}
            </div>

            {/* Mobile card view */}
            <div className="lg:hidden space-y-4">
              {filteredRegistry.map((person) => (
                <div key={person.id} className="glass-card p-4 space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex -space-x-3">
                      <div className="w-12 h-12 rounded-xl border-2 border-surface bg-white/5 overflow-hidden ring-4 ring-black/50">
                        {person.studentPhoto && <img src={person.studentPhoto} alt="Student" className="w-full h-full object-cover" />}
                      </div>
                      {person.guardians?.map((g, gi) => (
                        <div key={gi} className="w-12 h-12 rounded-xl border-2 border-surface bg-white/5 overflow-hidden ring-4 ring-black/50" title={g.name}>
                          {g.photo && <img src={g.photo} alt={g.role} className="w-full h-full object-cover" />}
                        </div>
                      ))}
                    </div>
                    {confirmDeleteId === person.id ? (
                      <div className="flex items-center space-x-2">
                        <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 text-[10px] font-black uppercase text-text-secondary bg-white/5 rounded-xl cursor-pointer">Cancel</button>
                        <button onClick={() => { removeEntry(person.id); setConfirmDeleteId(null); }} className="px-4 py-2 bg-red-500 text-white text-[10px] font-black uppercase rounded-xl cursor-pointer">Confirm Delete</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(person.id)} className="p-2.5 text-red-500 bg-red-500/10 rounded-xl cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-text-primary uppercase italic">{person.childName}</p>
                    <p className="text-[9px] font-mono text-text-secondary uppercase">{person.scholarNo} · {person.classSec}</p>
                  </div>
                  <div className="space-y-1">
                    {person.guardians?.map((g, gi) => (
                      <div key={gi} className="flex items-center space-x-2">
                        <span className="text-[8px] font-black text-accent-emerald uppercase tracking-widest">{g.role}:</span>
                        <span className="text-[10px] font-bold text-text-primary">{g.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Settings panel */
        <div className="grid md:grid-cols-2 gap-6">
          {/* Password */}
          <div className="glass-card p-6 sm:p-8 space-y-6">
            <h3 className="text-sm font-black text-text-primary uppercase tracking-widest flex items-center space-x-2">
              <Lock className="w-4 h-4 text-accent-emerald" />
              <span>Security Settings</span>
            </h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="info-label px-1">New Admin Password</label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-surface border border-surface-border rounded-xl px-5 py-4 text-sm font-bold text-text-primary outline-none focus:ring-1 focus:ring-accent-emerald/50 focus:border-accent-emerald transition-all"
                    placeholder="NEW PASSWORD..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary hover:text-white transition-all cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleSavePassword}
                disabled={!newPassword}
                className="w-full py-4 bg-accent-emerald text-black rounded-xl font-black text-xs tracking-[0.2em] uppercase disabled:opacity-30 transition-all"
              >
                {saveStatus ? '✓ SAVED' : 'UPDATE PASSWORD'}
              </button>
            </div>
          </div>

          {/* Theme / Accent */}
          <div className="glass-card p-6 sm:p-8 space-y-6">
            <h3 className="text-sm font-black text-text-primary uppercase tracking-widest flex items-center space-x-2">
              <Palette className="w-4 h-4 text-accent-emerald" />
              <span>Appearance</span>
            </h3>
            <div className="space-y-4">
              <div>
                <p className="info-label mb-3">Accent Color</p>
                <div className="flex space-x-3">
                  {(['emerald', 'blue', 'purple', 'amber', 'rose'] as Accent[]).map((a) => (
                    <button
                      key={a}
                      onClick={() => setAccent(a)}
                      className={cn(
                        'w-8 h-8 rounded-full border-2 transition-all',
                        accent === a ? 'scale-125 border-white' : 'border-white/20 opacity-50 hover:opacity-100',
                        a === 'emerald' && 'bg-[#10b981]',
                        a === 'blue' && 'bg-[#3b82f6]',
                        a === 'purple' && 'bg-[#a855f7]',
                        a === 'amber' && 'bg-[#f59e0b]',
                        a === 'rose' && 'bg-[#f43f5e]'
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* PDF exports */}
          <div className="glass-card p-6 sm:p-8 space-y-4 md:col-span-2">
            <h3 className="text-sm font-black text-text-primary uppercase tracking-widest">Documentation Exports</h3>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => exportRegistryToPDF(registry)} className="flex items-center space-x-2 px-4 py-2 bg-surface hover:bg-white/10 border border-surface-border rounded-xl text-[10px] font-black text-text-primary uppercase transition-all cursor-pointer">
                <Download className="w-3.5 h-3.5" /><span>Registry PDF</span>
              </button>
              <button onClick={exportTechnicalDoc} className="flex items-center space-x-2 px-4 py-2 bg-surface hover:bg-white/10 border border-surface-border rounded-xl text-[10px] font-black text-text-primary uppercase transition-all cursor-pointer">
                <ShieldCheck className="w-3.5 h-3.5" /><span>Technical Doc</span>
              </button>
              <button onClick={exportPresentationDoc} className="flex items-center space-x-2 px-4 py-2 bg-surface hover:bg-white/10 border border-surface-border rounded-xl text-[10px] font-black text-text-primary uppercase transition-all cursor-pointer">
                <FileJson className="w-3.5 h-3.5" /><span>Presentation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
