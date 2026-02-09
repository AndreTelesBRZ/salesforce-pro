import React from 'react';
import { AverageTicketResult, DEFAULT_AVERAGE_TICKET_DAYS } from './salesMetrics';
import { TrendingUp, ShoppingBag, CalendarDays, Loader2 } from 'lucide-react';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCount = (value: number) => {
  if (value <= 0) return 'Nenhum pedido';
  return `${value} pedido${value === 1 ? '' : 's'}`;
};

interface TicketMedioCardProps {
  data: AverageTicketResult | null;
  loading?: boolean;
}

export const TicketMedioCard: React.FC<TicketMedioCardProps> = ({ data, loading }) => {
  const average = data?.average ?? 0;
  const total = data?.total ?? 0;
  const orderCount = data?.orderCount ?? 0;
  const periodDays = data?.periodDays ?? DEFAULT_AVERAGE_TICKET_DAYS;
  const showPlaceholder = loading || data === null;

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Ticket médio
            </p>
            <div className="flex items-center gap-2">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                {showPlaceholder ? (
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                    Carregando...
                  </span>
                ) : (
                  currencyFormatter.format(average)
                )}
              </h3>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-none">
              Últimos {periodDays} dia{periodDays !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3 h-3" />
            {periodDays}d
          </span>
          <span className="flex items-center gap-1">
            <ShoppingBag className="w-3 h-3" />
            {showPlaceholder ? '---' : formatCount(orderCount)}
          </span>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-3 grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
        <div>
          <p className="text-[10px] uppercase tracking-wide">Total no período</p>
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {showPlaceholder ? '---' : currencyFormatter.format(total)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide">Pedidos faturados</p>
          <p className="text-base font-semibold text-slate-900 dark:text-white">
            {showPlaceholder ? '---' : formatCount(orderCount)}
          </p>
        </div>
      </div>
    </div>
  );
};
