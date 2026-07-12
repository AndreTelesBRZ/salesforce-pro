import { Product, Customer } from '../../types';
import { normalizeText } from './format';

export const productMatchesSearch = (product: Product, rawSearch: string): boolean => {
  const terms = normalizeText(rawSearch).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    product.id,
    product.code,
    product.plu,
    product.reference,
    product.barcode,
    product.name,
    product.description,
    product.category,
  ].filter(Boolean).join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

export const customerMatchesSearch = (customer: Customer, rawSearch: string): boolean => {
  const terms = normalizeText(rawSearch).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    customer.id,
    customer.name,
    customer.fantasyName,
    customer.document,
    customer.phone,
  ].filter(Boolean).join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

export const getInitials = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};
