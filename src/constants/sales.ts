import { Customer } from '../../types';

export const WALK_IN_CUSTOMER_ID = '0';

export const WALK_IN_CUSTOMER: Customer = {
  id: '0',
  name: 'Consumidor Final',
  fantasyName: 'Venda de Balcão',
  document: '000.000.000-00',
  type: 'NORMAL',
  address: 'Balcão / Loja',
  addressNumber: '',
  neighborhood: '',
  city: '',
  state: '',
  zipCode: '',
  phone: '',
  email: '',
  origin: '',
  sellerId: '',
  sellerName: '',
  lastSaleDate: '',
  lastSaleValue: 0,
};

export const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX', icon: '⚡' },
  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { value: 'cartao', label: 'Cartão', icon: '💳' },
  { value: 'boleto', label: 'Boleto', icon: '📄' },
];

export const SHIPPING_METHODS = [
  { value: 'retirada', label: 'Retirada na loja', icon: '🏪' },
  { value: 'entrega_propria', label: 'Entrega própria', icon: '🚗' },
  { value: 'transportadora', label: 'Transportadora', icon: '🚚' },
  { value: 'sem_frete', label: 'Sem frete', icon: '—' },
];

export const CATEGORY_COLORS: Record<string, string> = {
  default: 'bg-slate-100 text-slate-600',
  a: 'bg-blue-100 text-blue-700',
  b: 'bg-violet-100 text-violet-700',
  c: 'bg-emerald-100 text-emerald-700',
  d: 'bg-orange-100 text-orange-700',
  e: 'bg-rose-100 text-rose-700',
};

export const getCategoryColor = (category?: string): string => {
  if (!category) return CATEGORY_COLORS.default;
  const key = category.trim().charAt(0).toLowerCase();
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.default;
};
