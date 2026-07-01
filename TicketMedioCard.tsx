import React from 'react';
import { AverageTicketResult, DEFAULT_AVERAGE_TICKET_DAYS } from './salesMetrics';
import { Loader2 } from 'lucide-react';

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
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500">
        <div className="h-6 w-6 rounded-md border border-current" />
        <p className="text-lg font-medium leading-none">
          Ticket médio ({periodDays}d)
        </p>
      </div>

      <div className="mt-5">
        <p className="text-[2.25rem] font-semibold leading-none tracking-tight text-slate-900 dark:text-white">
          {showPlaceholder ? (
            <span className="flex items-center gap-2 text-lg font-medium text-slate-500 dark:text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              Carregando...
            </span>
          ) : (
            currencyFormatter.format(average)
          )}
        </p>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-slate-400 dark:text-slate-500">Total no período</p>
            <p className="mt-1 text-2xl font-medium text-slate-900 dark:text-white">
              {showPlaceholder ? '---' : currencyFormatter.format(total)}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-400 dark:text-slate-500">Pedidos faturados</p>
            <p className="mt-1 text-2xl font-medium text-slate-900 dark:text-white">
              {showPlaceholder ? '---' : formatCount(orderCount)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
