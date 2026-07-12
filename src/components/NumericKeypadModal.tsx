import React, { useState } from 'react';
import { Trash2, Delete, Check, AlertTriangle, X } from 'lucide-react';

interface NumericKeypadModalProps {
  title: string;
  initialValue: number;
  itemName: string;
  unit: string;
  referenceValue?: number;
  onConfirm: (val: number) => void;
  onClose: () => void;
}

export const NumericKeypadModal: React.FC<NumericKeypadModalProps> = ({
  title, initialValue, itemName, unit, referenceValue, onConfirm, onClose,
}) => {
  const [displayValue, setDisplayValue] = useState(initialValue.toString().replace('.', ','));
  const [hasTyped, setHasTyped] = useState(false);
  const normalizedValue = displayValue.replace(',', '.');
  const previewValue = Number.parseFloat(normalizedValue);
  const hasReferenceDiscount =
    typeof referenceValue === 'number' &&
    Number.isFinite(referenceValue) &&
    referenceValue > 0 &&
    Number.isFinite(previewValue) &&
    previewValue < referenceValue;
  const discountAmount = hasReferenceDiscount ? referenceValue - previewValue : 0;
  const discountPercent = hasReferenceDiscount ? (discountAmount / referenceValue) * 100 : 0;

  const handleNumber = (num: string) => {
    setDisplayValue((prev) => {
      if (!hasTyped) {
        setHasTyped(true);
        if (num === ',') return '0,';
        return num;
      }
      if (prev === '0' && num !== ',') return num;
      if (num === ',' && prev.includes(',')) return prev;
      if (prev.length > 8) return prev;
      return prev + num;
    });
  };

  const handleBackspace = () => {
    setHasTyped(true);
    setDisplayValue((prev) => (prev.length <= 1 ? '0' : prev.slice(0, -1)));
  };

  const handleClear = () => {
    setHasTyped(true);
    setDisplayValue('0');
  };

  const handleConfirm = () => {
    const val = parseFloat(displayValue.replace(',', '.'));
    if (!isNaN(val)) {
      onConfirm(val);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xs bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">{title}</h3>
            <p className="text-xs text-slate-400 truncate max-w-[200px]">{itemName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-white/80 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-orange-500 rounded-lg overflow-hidden h-16 shadow-inner relative">
            <div className="flex-1 text-right text-3xl font-bold text-slate-800 dark:text-white px-4 tracking-wider z-10">
              {displayValue} <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>
            </div>
            {!hasTyped && (
              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1 rounded opacity-70">
                Digite para substituir
              </div>
            )}
            <button
              onClick={handleBackspace}
              className="h-full px-4 bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors border-l border-slate-200 dark:border-slate-600 z-20"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
          {hasReferenceDiscount && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                <span>Preço abaixo da tabela</span>
              </div>
              <div className="mt-1">
                Desconto nominal: R$ {discountAmount.toFixed(2)} | Desconto percentual: {discountPercent.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        <div className="p-2 grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-950">
          {[7, 8, 9, 4, 5, 6, 1, 2, 3].map((num) => (
            <button
              key={num}
              onClick={() => handleNumber(num.toString())}
              className="h-16 rounded-lg bg-white dark:bg-slate-800 shadow-sm border-b-2 border-slate-200 dark:border-slate-700 text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
            >
              {num}
            </button>
          ))}
          <button
            onClick={() => handleNumber(',')}
            className="h-16 rounded-lg bg-slate-200 dark:bg-slate-900 text-2xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-800 active:scale-95 transition-all"
          >
            ,
          </button>
          <button
            onClick={() => handleNumber('0')}
            className="h-16 rounded-lg bg-white dark:bg-slate-800 shadow-sm border-b-2 border-slate-200 dark:border-slate-700 text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
          >
            0
          </button>
          <button
            onClick={handleClear}
            className="h-16 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-sm border-b-2 border-red-200 dark:border-red-800 text-xl font-bold flex items-center justify-center hover:bg-red-200 active:scale-95 transition-all"
            title="Zerar"
          >
            C
          </button>
        </div>

        <div className="grid grid-cols-2 gap-0 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => onConfirm(0)}
            className="py-4 text-sm font-bold text-red-500 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-2 transition-colors border-r border-slate-200 dark:border-slate-800"
          >
            <Trash2 className="w-4 h-4" />
            REMOVER ITEM
          </button>
          <button
            onClick={handleConfirm}
            className="py-4 text-sm font-bold text-white bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2 transition-colors"
          >
            <Check className="w-5 h-5" />
            CONFIRMAR
          </button>
        </div>
      </div>
    </div>
  );
};
