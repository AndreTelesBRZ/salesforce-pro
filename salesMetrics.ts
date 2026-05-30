import { Order } from './types';

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
