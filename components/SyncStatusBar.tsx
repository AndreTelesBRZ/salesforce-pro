import React, { useEffect, useState } from 'react';
import { backgroundSync } from '../services/backgroundSync';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

const formatTime = (date: Date | null): string => {
  if (!date) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const SyncStatusBar: React.FC = () => {
  const [state, setState] = useState(backgroundSync.state);

  useEffect(() => {
    const unsub = backgroundSync.subscribe(() => {
      setState({ ...backgroundSync.state });
    });
    return unsub;
  }, []);

  if (state.status === 'idle') return null;

  const content = (() => {
    switch (state.status) {
      case 'syncing':
        return { icon: <RefreshCw className="w-3 h-3 animate-spin" />, text: 'Sincronizando dados...', color: 'text-blue-600 dark:text-blue-400' };
      case 'success':
        return { icon: <CheckCircle className="w-3 h-3" />, text: `Online — dados atualizados às ${formatTime(state.lastSyncAt)}`, color: 'text-emerald-600 dark:text-emerald-400' };
      case 'error':
        return { icon: <AlertTriangle className="w-3 h-3" />, text: 'Falha na sincronização — nova tentativa em 5 minutos', color: 'text-amber-600 dark:text-amber-400' };
      case 'offline':
        return { icon: <CloudOff className="w-3 h-3" />, text: 'Offline — usando dados salvos', color: 'text-slate-500 dark:text-slate-400' };
      default:
        return null;
    }
  })();

  if (!content) return null;

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-1.5 py-1 px-3 text-[10px] font-medium ${content.color} bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-t border-slate-200 dark:border-slate-800`}>
      {content.icon}
      <span>{content.text}</span>
    </div>
  );
};
