export const formatMoney = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export const normalizeText = (value: string | number | undefined | null): string =>
  String(value ?? '').toLowerCase().trim();
