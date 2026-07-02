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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.06] p-3.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-white/50 mb-2.5">
        <div className="h-3.5 w-3.5 rounded border border-current" />
        <p className="text-[10px] font-semibold uppercase tracking-widest">
          Ticket médio ({periodDays}d)
        </p>
      </div>

      <p className="text-xl font-bold leading-none tracking-tight text-white mb-3">
        {showPlaceholder ? (
          <span className="flex items-center gap-2 text-sm font-medium text-white/40">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
            Carregando...
          </span>
        ) : (
          currencyFormatter.format(average)
        )}
      </p>

      <div className="flex items-center gap-4 border-t border-white/[0.08] pt-2.5">
        <div>
          <p className="text-[10px] text-white/35">Total no período</p>
          <p className="text-sm font-semibold text-white/80 mt-0.5">
            {showPlaceholder ? '—' : currencyFormatter.format(total)}
          </p>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <div>
          <p className="text-[10px] text-white/35">Pedidos faturados</p>
          <p className="text-sm font-semibold text-white/80 mt-0.5">
            {showPlaceholder ? '—' : formatCount(orderCount)}
          </p>
        </div>
      </div>
    </div>
  );
};
