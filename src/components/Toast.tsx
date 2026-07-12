import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';

interface ToastProps {
  type: 'success' | 'error' | 'info';
  text: string;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ type, text, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const config = {
    success: { icon: <CheckCircle2 className="h-5 w-5" />, bg: 'bg-emerald-600', text: 'text-white' },
    error: { icon: <XCircle className="h-5 w-5" />, bg: 'bg-rose-600', text: 'text-white' },
    info: { icon: <CheckCircle2 className="h-5 w-5" />, bg: 'bg-blue-600', text: 'text-white' },
  }[type];

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 shadow-2xl ${config.bg} ${config.text}`}
      style={{ animation: 'slideUp 0.3s ease-out', maxWidth: 380 }}
    >
      {config.icon}
      <span className="text-sm font-medium">{text}</span>
      <button onClick={onClose} className="ml-2 rounded-lg p-1 opacity-70 hover:opacity-100">
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
};
