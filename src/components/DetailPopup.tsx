import React from 'react';
import { X, User, Shield, Calendar } from 'lucide-react';
import { RegistryEntry } from '../types';

export const DetailPopup = ({ entry, onClose }: { entry: RegistryEntry; onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-surface-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-surface-border">
          <h2 className="text-xl font-black text-text-primary uppercase tracking-tight">Student Details</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-border rounded-full transition-all">
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="rounded-2xl overflow-hidden aspect-square bg-slate-200">
                {/* Normally we'd render the captured photo here. For now, placeholder. */}
                <div className="flex items-center justify-center h-full w-full bg-surface-border/20">
                  <User className="w-20 h-20 text-text-secondary" />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <InfoTile label="Name" value={entry.childName} />
              <InfoTile label="Scholar No" value={entry.scholarNo} />
              <InfoTile label="Class/Sec" value={entry.classSec} />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-text-secondary uppercase">Authorized Guardians</h3>
            {entry.guardians.map((g, i) => (
              <div key={i} className="flex items-center space-x-4 p-4 rounded-xl bg-background border border-surface-border">
                <div className="w-10 h-10 rounded-full bg-accent-emerald/10 flex items-center justify-center"><Shield className="w-5 h-5 text-accent-emerald" /></div>
                <div>
                  <p className="font-bold text-text-primary">{g.name}</p>
                  <p className="text-xs text-text-secondary uppercase">{g.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{label}</p>
      <p className="font-black text-text-primary">{value}</p>
    </div>
  );
}
