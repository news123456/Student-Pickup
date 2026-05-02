import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6">
        <div className="relative w-16 h-16 mx-auto">
          <Loader2 className="w-full h-full text-accent-emerald animate-spin" />
          <div className="absolute inset-0 border-2 border-white/5 rounded-full" />
        </div>
        <div className="space-y-3">
          <h1 className="text-xl font-extrabold tracking-tight uppercase text-text-primary">
            Initializing Sentinel
          </h1>
          <p className="text-text-secondary text-[10px] font-medium tracking-widest max-w-xs mx-auto uppercase opacity-60">
            Loading Biometric Weights...
          </p>
        </div>
      </div>
    </div>
  );
}
