import React, { useEffect, useState } from 'react';
import { backgroundSync } from '../services/backgroundSync';
import { RefreshCw } from 'lucide-react';

const formatTime = (date: Date | null): string => {
  if (!date) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const STATUS_CONFIG: Record<string, { dot: string; title: string; spin: boolean }> = {
  idle:      { dot: 'bg-slate-500',                    title: 'Online',                                spin: false },
  syncing:   { dot: 'bg-blue-400',                     title: 'Sincronizando dados...',                spin: true },
  success:   { dot: 'bg-emerald-400',                  title: 'Online — dados atualizados',            spin: false },
  error:     { dot: 'bg-amber-400',                    title: 'Falha na sincronização',                spin: false },
  offline:   { dot: 'bg-slate-500',                    title: 'Offline — usando dados salvos',          spin: false },
};

export const SyncIndicator: React.FC = () => {
  const [state, setState] = useState(backgroundSync.state);

  useEffect(() => {
    const unsub = backgroundSync.subscribe(() => {
      setState({ ...backgroundSync.state });
    });
    return unsub;
  }, []);

  const cfg = STATUS_CONFIG[state.status] || STATUS_CONFIG.idle;
  const lastSync = state.lastSyncAt ? ` (${formatTime(state.lastSyncAt)})` : '';

  return (
    <span
      className="relative flex items-center justify-center"
      title={cfg.title + lastSync}
    >
      {cfg.spin ? (
        <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />
      ) : (
        <span className={`w-2 h-2 rounded-full ${cfg.dot} shadow-sm`} />
      )}
    </span>
  );
};
