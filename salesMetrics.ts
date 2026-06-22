import { Order, SalesHistoryItem } from './types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_AVERAGE_TICKET_DAYS = 30;

const parseOrderDate = (order: Order): Date | null => {
  if (!order.createdAt) return null;
  const parsed = new Date(order.createdAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export interface AverageTicketResult {
  average: number;
  orderCount: number;
  total: number;
  periodDays: number;
}

export interface SalesHistorySummary {
  total: number;
  documentCount: number;
}

const parseHistoryDate = (item: SalesHistoryItem): Date | null => {
  const candidates = [
    item.notaData,
    item.dataMovimento,
    item.pedidoData,
    item.prevendaData,
    item.createdAt,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const resolveHistoryDocumentKey = (item: SalesHistoryItem, index: number): string => {
  const primaryKey = [
    item.lojaCodigo || '',
    item.notaNumero || '',
    item.notaSerie || '',
    item.saidaCodigo || '',
    item.pedidoCodigo || '',
    item.prevendaCodigo || '',
    item.vendaIdOrigem || '',
  ].join('::');

  if (primaryKey.replace(/[:]/g, '').trim()) return primaryKey;
  if (item.itemIdOrigem) return 'item::' + item.itemIdOrigem;
  return 'fallback::' + index;
};

const resolveHistoryDocumentAmount = (item: SalesHistoryItem): number => {
  const candidates = [
    item.notaValorTotal,
    item.pedidoValorTotal,
    item.prevendaValorTotal,
    item.itemValorLiquido,
    item.itemValorTotal,
  ];

  const value = candidates.find((candidate) => Number(candidate) > 0);
  return Number(value) || 0;
};

export const calculateAverageTicket = (
  orders: Order[],
  days = DEFAULT_AVERAGE_TICKET_DAYS
): AverageTicketResult => {
  const effectiveDays = Number.isFinite(days) && days > 0 ? Math.round(days) : DEFAULT_AVERAGE_TICKET_DAYS;
  const now = new Date();
  const cutoff = new Date(now.getTime() - effectiveDays * MS_PER_DAY);

  const relevantOrders = orders.filter((order) => {
    const created = parseOrderDate(order);
    return !!created && created >= cutoff && created <= now;
  });

  const totalValue = relevantOrders.reduce((sum, order) => sum + Math.max(order.total || 0, 0), 0);
  const average = relevantOrders.length > 0 ? totalValue / relevantOrders.length : 0;

  return {
    average,
    orderCount: relevantOrders.length,
    total: totalValue,
    periodDays: effectiveDays,
  };
};

export const summarizeSalesHistory = (items: SalesHistoryItem[]): SalesHistorySummary => {
  const documents = new Map<string, { amount: number; date: Date | null }>();

  items.forEach((item, index) => {
    const key = resolveHistoryDocumentKey(item, index);
    const amount = Math.max(resolveHistoryDocumentAmount(item), 0);
    const date = parseHistoryDate(item);
    const current = documents.get(key);

    if (!current) {
      documents.set(key, { amount, date });
      return;
    }

    documents.set(key, {
      amount: Math.max(current.amount, amount),
      date: current.date || date,
    });
  });

  const total = Array.from(documents.values()).reduce((sum, item) => sum + item.amount, 0);

  return {
    total,
    documentCount: documents.size,
  };
};
