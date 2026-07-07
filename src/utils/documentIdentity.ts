const DEVICE_ID_STORAGE_KEY = "salesforceDeviceId";
const BUDGET_SEQ_PREFIX = "salesforceBudgetSeq";

export interface StoreIdentitySource {
  id?: string | number | null;
  codigo?: string | number | null;
  store_code?: string | number | null;
  trade_name?: string | null;
  legal_name?: string | null;
  nome_fantasia?: string | null;
  razao_social?: string | null;
}

const toStringValue = (value?: string | number | null): string => String(value ?? "").trim();
const normalizeDigits = (value?: string | number | null): string => toStringValue(value).replace(/\D/g, "");

const getStorage = (): Storage | null => {
  if (typeof localStorage === "undefined") return null;
  return localStorage;
};

const createUuid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "device-" + Date.now() + "-" + Math.random().toString(16).slice(2, 10);
};

const hashToTwoDigits = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return String(hash % 100).padStart(2, "0");
};

const formatCompactSegment = (value: string, fallback = "LOJA"): string => {
  const compact = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!compact) return fallback;
  return compact.slice(0, 3) || fallback;
};

const resolveStoreSegment = (store?: StoreIdentitySource | null): string => {
  if (!store) return "LOJA";
  const explicit = toStringValue(store.codigo || store.store_code || store.id);
  if (/^\d+$/.test(explicit)) {
    return explicit.padStart(6, "0");
  }
  if (explicit) {
    return formatCompactSegment(explicit);
  }
  const candidate = toStringValue(store.trade_name || store.nome_fantasia || store.legal_name || store.razao_social);
  return formatCompactSegment(candidate);
};

const resolveSellerSegment = (value?: string | number | null): string => {
  const digits = normalizeDigits(value);
  if (digits) return digits.padStart(6, "0").slice(-6);
  return "000000";
};

export const getPersistentDeviceId = (): string => {
  const storage = getStorage();
  if (!storage) return createUuid();
  const stored = storage.getItem(DEVICE_ID_STORAGE_KEY);
  if (stored) return stored;
  const next = createUuid();
  storage.setItem(DEVICE_ID_STORAGE_KEY, next);
  return next;
};

export const getPersistentDeviceCode = (): string => {
  return "DV" + hashToTwoDigits(getPersistentDeviceId());
};

export const getTodayKey = (date: string | Date | null | undefined = new Date()): string => {
  const value = date ? new Date(date) : new Date();
  if (Number.isNaN(value.getTime())) return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return value.toISOString().slice(0, 10).replace(/-/g, "");
};

const getSequenceStorageKey = (deviceCode: string, dateKey: string): string => BUDGET_SEQ_PREFIX + ":" + deviceCode + ":" + dateKey;

export const allocateBudgetSequence = (deviceCode: string, dateKey: string): number => {
  const storage = getStorage();
  const key = getSequenceStorageKey(deviceCode, dateKey);
  const current = storage ? Number(storage.getItem(key) || 0) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  if (storage) {
    storage.setItem(key, String(next));
  }
  return next;
};

export const buildBudgetNumber = (params: {
  store?: StoreIdentitySource | null;
  sellerCode?: string | number | null;
  issuedAt?: string | Date | null;
  existingNumber?: string | null;
}): string => {
  const existing = toStringValue(params.existingNumber);
  if (existing) return existing;
  const storeSegment = resolveStoreSegment(params.store);
  const sellerSegment = resolveSellerSegment(params.sellerCode);
  const deviceCode = getPersistentDeviceCode();
  const dateKey = getTodayKey(params.issuedAt || new Date());
  const sequence = String(allocateBudgetSequence(deviceCode, dateKey)).padStart(4, "0");
  return "ORC-" + storeSegment + "-" + sellerSegment + "-" + deviceCode + "-" + dateKey + "-" + sequence;
};

export const getDocumentKind = (params: {
  status?: string | null;
  businessStatus?: string | null;
  documentType?: string | null;
}): "orcamento" | "pedido" => {
  const rawStatus = toStringValue(params.status).toLowerCase();
  const rawBusinessStatus = toStringValue(params.businessStatus).toLowerCase();
  const rawDocumentType = toStringValue(params.documentType).toLowerCase();
  if (
    rawDocumentType === "orcamento" ||
    rawDocumentType === "orçamento" ||
    rawDocumentType === "budget" ||
    rawStatus === "draft" ||
    rawStatus === "rascunho" ||
    rawBusinessStatus === "orcamento" ||
    rawBusinessStatus === "rascunho"
  ) {
    return "orcamento";
  }
  return "pedido";
};

export const getDocumentNumber = (payload: {
  numero_orcamento?: string | null;
  numero_pedido?: string | null;
  displayId?: string | number | null;
}): string => {
  const budget = toStringValue(payload.numero_orcamento);
  if (budget) return budget;
  const order = toStringValue(payload.numero_pedido);
  if (order) return order;
  const display = toStringValue(payload.displayId);
  return display || "—";
};

export const getDocumentLabels = (kind: "orcamento" | "pedido") => {
  const isBudget = kind === "orcamento";
  return {
    headline: isBudget ? "ORÇAMENTO" : "PEDIDO",
    cover: isBudget ? "ORÇAMENTO COMERCIAL" : "COMPROVANTE DE PEDIDO",
    subtitle: "",
    items: isBudget ? "ITENS DO ORÇAMENTO" : "ITENS DO PEDIDO",
    numberLabel: isBudget ? "ORÇAMENTO Nº" : "PEDIDO Nº",
    filenamePrefix: isBudget ? "orcamento" : "pedido",
  };
};
