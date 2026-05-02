import { motion } from 'motion/react';
import { Download, History, UserCircle } from 'lucide-react';
import { useHistoryStore } from '../../store/historyStore';
import { exportLogsToPDF } from '../../lib/pdfExport';

export default function HistoryView() {
  const logs = useHistoryStore((s) => s.logs);

  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-5xl mx-auto px-4 sm:px-0"
    >
      <div className="glass-card overflow-hidden">
        <div className="p-6 sm:p-10 border-b border-surface-border flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-center sm:text-left">
            <div className="status-badge mb-3 mx-auto sm:mx-0 w-fit">Audit Logs</div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight mb-2 leading-none">
              Log Archives
            </h2>
            <p className="text-text-secondary text-[10px] sm:text-xs font-medium tracking-tight">
              Full historical log of campus student releases.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => exportLogsToPDF(logs)}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white flex items-center space-x-2 transition-all"
            >
              <Download className="w-3 h-3" />
              <span>Download PDF</span>
            </button>
            <History className="w-10 h-10 sm:w-12 sm:h-12 text-white/5" />
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="info-label px-4 py-4">Student Detail</th>
                  <th className="info-label px-4 py-4">Authorized Guardian</th>
                  <th className="info-label px-4 py-4">Tracking Node</th>
                  <th className="info-label px-4 py-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/2">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/2 transition-colors group">
                    <td className="px-4 py-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-accent-emerald/10 rounded-full flex items-center justify-center text-accent-emerald border border-accent-emerald/20">
                          <UserCircle className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-bold text-white uppercase italic tracking-tight">{log.studentName}</p>
                          <p className="text-[10px] font-mono text-text-secondary uppercase">UID: {log.scholarNo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-6">
                      <div className="flex flex-col">
                        <p className="text-sm font-medium text-text-primary">{log.guardianName}</p>
                        <div className="flex items-center space-x-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-accent-emerald px-1.5 py-0.5 bg-accent-emerald/10 rounded">
                            {log.guardianRole}
                          </span>
                          <p className="text-[9px] uppercase font-bold text-text-secondary/40 tracking-widest">Verified</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-6">
                      <div className="flex flex-col">
                        <span className="px-2 py-1 bg-background border border-surface-border rounded text-[10px] font-bold text-text-primary uppercase tracking-widest w-fit">
                          {log.cameraLabel ?? 'Standard'}
                        </span>
                        <span className="text-[8px] mt-1 text-text-secondary uppercase font-black tracking-widest">{log.classSec}</span>
                      </div>
                    </td>
                    <td className="px-4 py-6 text-right">
                      <p className="text-xs font-bold text-text-primary font-mono">{new Date(log.timestamp).toLocaleTimeString()}</p>
                      <p className="text-[10px] font-bold text-text-secondary uppercase tracking-tighter">{new Date(log.timestamp).toLocaleDateString()}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="glass-card p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-accent-emerald/10 rounded-xl flex items-center justify-center text-accent-emerald border border-accent-emerald/20">
                      <UserCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white uppercase italic">{log.studentName}</p>
                      <p className="text-[8px] font-black text-text-secondary uppercase tracking-widest">Scholar ID: {log.scholarNo}</p>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-surface border border-white/10 rounded text-[8px] font-black text-white uppercase italic">{log.classSec}</span>
                </div>
                <div className="flex items-center justify-between bg-white/2 p-3 rounded-xl border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-text-secondary uppercase tracking-widest mb-1">Authenticated Guardian</span>
                    <p className="text-xs font-bold text-text-primary px-1">{log.guardianName}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[8px] font-black uppercase tracking-widest text-accent-emerald bg-accent-emerald/10 px-2 py-1 rounded">{log.guardianRole}</span>
                    <span className="text-[7px] text-white/40 mt-1 uppercase font-bold">{log.cameraLabel ?? 'Main Node'}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] font-mono text-white/40 pt-1">
                  <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                  <span className="text-accent-emerald font-bold">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>

          {logs.length === 0 && (
            <div className="p-12 text-center text-text-secondary uppercase text-[10px] font-black tracking-widest font-mono">
              Null data return. system operational.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
