import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiService } from '../services/api';
import { getStoreCodeForApi } from '../services/storeHost';
import { Customer, SalesHistoryCustomerGrouped, SalesHistoryFilters, SalesHistoryItem, SalesHistoryNote, SalesHistoryNoteItem, SalesHistoryReportRow, SalesHistoryResponse } from '../types';
import { OrderDraft } from '../src/types/orderDraft';
import { AlertCircle, BarChart3, Briefcase, Calendar, ChevronDown, ChevronUp, ClipboardList, Copy, FileText, Filter, Loader2, RefreshCcw, Search, Store, Users } from 'lucide-react';
import { SalesHistoryReportView } from './SalesHistoryReportView';

interface SalesHistoryPageProps {
  initialCustomer?: Customer | null;
  onNavigate?: (view: 'cart') => void;
}

interface SelectedHistoryNoteContext {
  customerCode: string;
  customerName?: string;
  sellerLabel?: string;
  note: SalesHistoryNote;
}

const createDraftId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `order-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const formatInputDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

const getForcedSalesHistoryStoreCode = (): string => {
  return getStoreCodeForApi();
};

const getDefaultFilters = (): SalesHistoryFilters => {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const forcedStoreCode = getForcedSalesHistoryStoreCode();

  return {
    cliente_codigo: '',
    vendedor_codigo: apiService.getSellerId() || '',
    nota_numero: '',
    produto_codigo: '',
    data_inicio: formatInputDate(startOfMonth),
    data_fim: formatInputDate(endOfMonth),
    loja_codigo: forcedStoreCode,
    pedido_codigo: '',
    saida_codigo: '',
    q: '',
  };
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const normalizeText = (value?: string): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const formatCurrency = (value?: number): string => {
  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
  return 'R$ ' + amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatDate = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
};

const formatDateTime = (value?: string): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
};

const toInputDate = (value?: string): string => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return brMatch[3] + '-' + brMatch[2] + '-' + brMatch[1];
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return formatInputDate(parsed);
};

const normalizeCode = (value?: string | number): string => {
  const trimmed = String(value || '').trim();
  const withoutZeros = trimmed.replace(/^0+/, '');
  return withoutZeros || '0';
};

const findInitialCustomerSale = (items: SalesHistoryItem[], customer: Customer): SalesHistoryItem | null => {
  const customerCode = normalizeCode(customer.id);
  return items.find((item) => normalizeCode(item.clienteCodigo) === customerCode) || null;
};

const customerLabel = (customer: Customer): string => {
  const name = customer.fantasyName && customer.fantasyName !== customer.name
    ? customer.name + ' • ' + customer.fantasyName
    : customer.name;
  return customer.id + ' • ' + name;
};

const isOnlyGlobalQuery = (filters: SalesHistoryFilters): boolean => {
  const q = String(filters.q || '').trim();
  if (!q) return false;
  return ![
    filters.cliente_codigo,
    filters.vendedor_codigo,
    filters.nota_numero,
    filters.produto_codigo,
    filters.data_inicio,
    filters.data_fim,
    filters.loja_codigo,
    filters.pedido_codigo,
    filters.saida_codigo,
  ].some((value) => String(value || '').trim());
};

const resolveHistoryRowAmount = (item: SalesHistoryItem): number => {
  const candidates = [
    item.itemValorLiquido,
    item.itemValorTotal,
    item.notaValorTotal,
    item.pedidoValorTotal,
    item.prevendaValorTotal,
  ];

  const value = candidates.find((candidate) => Number(candidate) > 0);
  return Number(value) || 0;
};

const groupHistoryByEmissionDate = (items: SalesHistoryItem[]): Array<{ key: string; label: string; subtotal: number; items: SalesHistoryItem[] }> => {
  const grouped = new Map<string, { key: string; label: string; subtotal: number; items: SalesHistoryItem[] }>();

  items.forEach((item, index) => {
    const sourceDate = item.notaData || item.dataMovimento || item.pedidoData || item.prevendaData || '';
    const parsed = sourceDate ? new Date(sourceDate) : null;
    const key = parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toISOString().slice(0, 10)
      : 'sem-data-' + index;
    const label = parsed && !Number.isNaN(parsed.getTime())
      ? parsed.toLocaleDateString('pt-BR')
      : 'Sem data';

    if (!grouped.has(key)) {
      grouped.set(key, { key, label, subtotal: 0, items: [] });
    }

    const group = grouped.get(key);
    if (!group) return;
    group.items.push(item);
    group.subtotal += resolveHistoryRowAmount(item);
  });

  return Array.from(grouped.values()).sort((left, right) => left.key.localeCompare(right.key));
};

const mapHistoryItemToNoteItem = (item: SalesHistoryItem): SalesHistoryNoteItem => ({
  produtoCodigo: item.produtoCodigo || '',
  produtoDescricao: item.produtoDescricao || '',
  itemQuantidade: Number(item.itemQuantidade) || 0,
  itemValorUnitario: Number(item.itemValorUnitario) || 0,
  itemValorTotal: Number(item.itemValorTotal) || 0,
  itemValorLiquido: Number(item.itemValorLiquido) || Number(item.itemValorTotal) || 0,
});

const buildFallbackNoteItems = (items: SalesHistoryItem[], customerCode: string, noteNumber: string, noteSerie?: string): SalesHistoryNoteItem[] => {
  const normalizedCustomer = String(customerCode || '').trim();
  const normalizedNote = String(noteNumber || '').trim();
  const normalizedSerie = String(noteSerie || '').trim();
  if (!normalizedCustomer || !normalizedNote) return [];

  return items
    .filter((item) => (
      String(item.clienteCodigo || '').trim() === normalizedCustomer
      && String(item.notaNumero || '').trim() === normalizedNote
      && (!normalizedSerie || String(item.notaSerie || '').trim() === normalizedSerie)
      && (String(item.produtoCodigo || '').trim() || String(item.produtoDescricao || '').trim())
    ))
    .map(mapHistoryItemToNoteItem);
};

const groupHistoryByNote = (items: SalesHistoryItem[]): Array<{ key: string; note: SalesHistoryNote; items: SalesHistoryItem[] }> => {
  const grouped = new Map<string, { key: string; note: SalesHistoryNote; items: SalesHistoryItem[] }>();

  items.forEach((item, index) => {
    const key = [
      item.clienteCodigo || 'cliente',
      item.lojaCodigo || 'loja',
      item.notaNumero || item.saidaCodigo || item.pedidoCodigo || 'sem-nota-' + index,
      item.notaSerie || 'serie',
    ].join('::');

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        note: {
          lojaCodigo: item.lojaCodigo,
          prevendaCodigo: item.prevendaCodigo,
          pedidoCodigo: item.pedidoCodigo,
          saidaCodigo: item.saidaCodigo,
          notaData: item.notaData,
          notaSerie: item.notaSerie,
          notaNumero: item.notaNumero,
          notaValorTotal: item.notaValorTotal,
          documentoStatus: item.documentoStatus,
          nfeStatus: item.nfeStatus,
          documentoTipo: item.documentoTipo,
        },
        items: [],
      });
    }

    grouped.get(key)?.items.push(item);
  });

  return Array.from(grouped.values());
};

const buildCustomerHistoryFallback = (items: SalesHistoryItem[], customerCode: string): { grouped: SalesHistoryCustomerGrouped | null; notes: SalesHistoryNote[] } => {
  const normalizedCustomer = String(customerCode || '').trim();
  if (!normalizedCustomer) return { grouped: null, notes: [] };

  const filteredItems = items.filter((item) => String(item.clienteCodigo || '').trim() === normalizedCustomer);
  const notes = groupHistoryByNote(filteredItems).map(({ note, items: noteItems }) => ({
    ...note,
    notaValorTotal: Number(note.notaValorTotal) || noteItems.reduce((sum, item) => sum + resolveHistoryRowAmount(item), 0),
    itens: noteItems.map(mapHistoryItemToNoteItem),
  }));

  const referenceItem = filteredItems[0];
  return {
    grouped: {
      clienteCodigo: normalizedCustomer,
      clienteRazaoSocial: referenceItem?.clienteRazaoSocial || '',
      clienteFantasia: referenceItem?.clienteFantasia || '',
      vendedorCodigo: referenceItem?.vendedorCodigo || '',
      vendedorNome: referenceItem?.vendedorNome || '',
      notas: notes,
    },
    notes,
  };
};

export const SalesHistoryPage: React.FC<SalesHistoryPageProps> = ({ initialCustomer, onNavigate }) => {
  const initialCustomerKeyRef = useRef('');
  const autoSelectedSaleKeyRef = useRef('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [draftFilters, setDraftFilters] = useState<SalesHistoryFilters>(() => getDefaultFilters());
  const [appliedFilters, setAppliedFilters] = useState<SalesHistoryFilters>(() => getDefaultFilters());
  const [customerQuery, setCustomerQuery] = useState('');
  const [flatHistory, setFlatHistory] = useState<SalesHistoryResponse>({ count: 0, next: null, previous: null, results: [], reportView: null, reportTruncated: false });
  const [customerGrouped, setCustomerGrouped] = useState<SalesHistoryCustomerGrouped | null>(null);
  const [customerNotes, setCustomerNotes] = useState<SalesHistoryNote[]>([]);
  const [noteItems, setNoteItems] = useState<Record<string, { loading: boolean; error?: string; items: SalesHistoryNoteItem[] }>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedHistoryNote, setSelectedHistoryNote] = useState<SelectedHistoryNoteContext | null>(null);

  useEffect(() => {
    let active = true;

    const loadLoggedSeller = async () => {
      const sellerId = await apiService.getLoggedSellerId();
      if (!active || !sellerId) return;

      const applySeller = (current: SalesHistoryFilters): SalesHistoryFilters => {
        if (current.vendedor_codigo === sellerId && current.loja_codigo === getForcedSalesHistoryStoreCode()) {
          return current;
        }
        return {
          ...current,
          vendedor_codigo: sellerId,
          loja_codigo: getForcedSalesHistoryStoreCode(),
        };
      };

      setDraftFilters(applySeller);
      setAppliedFilters(applySeller);
    };

    loadLoggedSeller();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadCustomers = async () => {
      setCustomersLoading(true);
      try {
        const data = await apiService.getCustomers();
        if (!active) return;
        setCustomers(data.filter((customer) => customer.id !== '0'));
      } catch {
        if (!active) return;
        setCustomers([]);
      } finally {
        if (active) setCustomersLoading(false);
      }
    };

    loadCustomers();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!initialCustomer || !initialCustomer.id || initialCustomer.id === '0') return;
    const initialKey = [
      initialCustomer.id,
      getForcedSalesHistoryStoreCode(),
      apiService.getSellerId() || initialCustomer.sellerId || '',
    ].join('|');
    if (initialCustomerKeyRef.current === initialKey) return;
    initialCustomerKeyRef.current = initialKey;
    autoSelectedSaleKeyRef.current = '';

    const filters: SalesHistoryFilters = {
      ...getDefaultFilters(),
      cliente_codigo: initialCustomer.id,
      vendedor_codigo: apiService.getSellerId() || initialCustomer.sellerId || '',
      loja_codigo: getForcedSalesHistoryStoreCode(),
      q: '',
      nota_numero: '',
      produto_codigo: '',
      pedido_codigo: '',
      saida_codigo: '',
    };

    setCustomerQuery(customerLabel(initialCustomer));
    setDraftFilters(filters);
    setAppliedFilters(filters);
    setSelectedHistoryNote(null);
    setExpandedNotes({});
    setNoteItems({});
    setPage(1);
    setPageSize(10);
  }, [initialCustomer]);

  const selectedDraftCustomer = useMemo(() => {
    const customerCode = String(draftFilters.cliente_codigo || '').trim();
    if (!customerCode) return null;
    return customers.find((customer) => customer.id === customerCode) || null;
  }, [customers, draftFilters.cliente_codigo]);

  const selectedAppliedCustomer = useMemo(() => {
    const customerCode = String(appliedFilters.cliente_codigo || '').trim();
    if (!customerCode) return null;
    return customers.find((customer) => customer.id === customerCode) || null;
  }, [customers, appliedFilters.cliente_codigo]);

  const customerSuggestions = useMemo(() => {
    const query = normalizeText(customerQuery);
    if (!query) return [];
    return customers
      .filter((customer) => {
        const haystack = normalizeText(customer.id + ' ' + customer.name + ' ' + (customer.fantasyName || '') + ' ' + customer.document);
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [customers, customerQuery]);

  const derivedCustomerHistory = useMemo(() => {
    const customerCode = String(appliedFilters.cliente_codigo || '').trim();
    if (!customerCode) return { grouped: null, notes: [] as SalesHistoryNote[] };
    return buildCustomerHistoryFallback(flatHistory.results, customerCode);
  }, [appliedFilters.cliente_codigo, flatHistory.results]);

  const noteList = useMemo(() => {
    if (selectedHistoryNote) return [selectedHistoryNote.note];
    return customerNotes;
  }, [customerNotes, selectedHistoryNote]);

  const detailHeader = useMemo(() => {
    if (selectedHistoryNote) {
      return {
        customerName: selectedHistoryNote.customerName || selectedHistoryNote.customerCode,
        sellerLabel: selectedHistoryNote.sellerLabel || 'Vendedor conforme backend',
      };
    }
    if (customerGrouped) {
      return {
        customerName: customerGrouped.clienteRazaoSocial || selectedAppliedCustomer?.name || customerGrouped.clienteCodigo,
        sellerLabel: customerGrouped.vendedorNome || customerGrouped.vendedorCodigo || 'Vendedor conforme backend',
      };
    }
    return null;
  }, [customerGrouped, selectedAppliedCustomer, selectedHistoryNote]);

  const customerTotals = useMemo(() => {
    const notes = selectedHistoryNote ? [selectedHistoryNote.note] : (customerGrouped?.notas || []);
    return {
      notes: notes.length,
      items: notes.reduce((sum, note) => sum + (note.itens?.length || 0), 0),
      total: notes.reduce((sum, note) => sum + (Number(note.notaValorTotal) || 0), 0),
    };
  }, [customerGrouped, selectedHistoryNote]);

  const emissionGroups = useMemo(() => flatHistory.reportView?.groups || groupHistoryByEmissionDate(flatHistory.results), [flatHistory.reportView, flatHistory.results]);
  const totalPages = Math.max(1, Math.ceil(flatHistory.count / pageSize));

  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters });
    setSelectedHistoryNote(null);
    setExpandedNotes({});
    setNoteItems({});
    setPage(1);
  };

  const resetFilters = () => {
    const defaults = getDefaultFilters();
    setDraftFilters(defaults);
    setAppliedFilters(defaults);
    setCustomerQuery('');
    setCustomerGrouped(null);
    setCustomerNotes([]);
    setExpandedNotes({});
    setNoteItems({});
    setSelectedHistoryNote(null);
    setPage(1);
  };

  const pickCustomer = (customer: Customer) => {
    setDraftFilters((current) => ({ ...current, cliente_codigo: customer.id }));
    setCustomerQuery(customerLabel(customer));
  };

  const handleCustomerQueryChange = (value: string) => {
    setCustomerQuery(value);
    setDraftFilters((current) => {
      if (!current.cliente_codigo) return current;
      const matchedCustomer = customers.find((customer) => customer.id === current.cliente_codigo);
      if (matchedCustomer && value === customerLabel(matchedCustomer)) {
        return current;
      }
      return { ...current, cliente_codigo: '' };
    });
  };

  const clearSelectedCustomer = () => {
    setDraftFilters((current) => ({ ...current, cliente_codigo: '' }));
    setAppliedFilters((current) => ({ ...current, cliente_codigo: '' }));
    setCustomerQuery('');
    setCustomerGrouped(null);
    setCustomerNotes([]);
    setExpandedNotes({});
    setNoteItems({});
    setPage(1);
  };

  useEffect(() => {
    let active = true;

    const loadFlatHistory = async () => {
      setLoadingHistory(true);
      setHistoryError('');
      try {
        const payload = isOnlyGlobalQuery(appliedFilters)
          ? await apiService.searchSalesHistory(String(appliedFilters.q || ''), page, pageSize)
          : await apiService.getSalesHistory(appliedFilters, page, pageSize);
        if (!active) return;
        setFlatHistory(payload);
      } catch (error: any) {
        if (!active) return;
        setFlatHistory({ count: 0, next: null, previous: null, results: [], reportView: null, reportTruncated: false });
        setHistoryError(error?.message || 'Não foi possível carregar o histórico de vendas.');
      } finally {
        if (active) setLoadingHistory(false);
      }
    };

    loadFlatHistory();
    return () => {
      active = false;
    };
  }, [
    appliedFilters.cliente_codigo,
    appliedFilters.vendedor_codigo,
    appliedFilters.nota_numero,
    appliedFilters.produto_codigo,
    appliedFilters.data_inicio,
    appliedFilters.data_fim,
    appliedFilters.loja_codigo,
    appliedFilters.pedido_codigo,
    appliedFilters.saida_codigo,
    appliedFilters.q,
    page,
    pageSize,
    refreshTick,
  ]);

  useEffect(() => {
    if (!appliedFilters.cliente_codigo) {
      setCustomerGrouped(null);
      setCustomerNotes([]);
      setExpandedNotes({});
      setNoteItems({});
      return;
    }

    setCustomerGrouped(derivedCustomerHistory.grouped);
    setCustomerNotes(derivedCustomerHistory.notes);
    setExpandedNotes({});
    setNoteItems({});
  }, [appliedFilters.cliente_codigo, derivedCustomerHistory]);

  const loadNoteItems = async (_customerCode: string, noteNumber: string, _noteSerie?: string, fallbackItems: SalesHistoryNoteItem[] = []) => {
    setNoteItems((current) => ({
      ...current,
      [noteNumber]: { loading: false, items: fallbackItems },
    }));
  };

  const toggleNote = async (note: SalesHistoryNote, customerCodeOverride?: string) => {
    const noteNumber = String(note.notaNumero || '').trim();
    const noteSerie = String(note.notaSerie || '').trim();
    const customerCode = String(customerCodeOverride || appliedFilters.cliente_codigo || '').trim();
    if (!noteNumber || !customerCode) return;

    setExpandedNotes((current) => ({ ...current, [noteNumber]: !current[noteNumber] }));
    if (expandedNotes[noteNumber] || noteItems[noteNumber]) return;

    const fallbackItems = note.itens?.length
      ? note.itens
      : buildFallbackNoteItems(flatHistory.results, customerCode, noteNumber, noteSerie);
    await loadNoteItems(customerCode, noteNumber, noteSerie, fallbackItems);
  };

  const handleCloneNoteToCart = (note: SalesHistoryNote, customerCodeOverride?: string) => {
    const customerCode = String(customerCodeOverride || appliedFilters.cliente_codigo || '').trim();
    if (!customerCode) {
      alert('Selecione um cliente para clonar o pedido.');
      return;
    }

    const customer = customers.find((entry) => entry.id === customerCode)
      || (selectedAppliedCustomer && selectedAppliedCustomer.id === customerCode ? selectedAppliedCustomer : null);
    const noteNumber = String(note.notaNumero || '').trim();
    const items = noteItems[noteNumber]?.items?.length
      ? noteItems[noteNumber].items
      : (note.itens || []);

    if (!items.length) {
      alert('Esta nota não possui itens para clonar.');
      return;
    }

    const draft: OrderDraft = {
      id: createDraftId(),
      cliente_id: customerCode,
      cliente_nome: customer?.name || selectedHistoryNote?.customerName || detailHeader?.customerName || customerCode,
      cliente_documento: customer?.document,
      cliente_tipo: customer?.type || 'NORMAL',
      itens: items.map((item) => ({
        codigo_produto: item.produtoCodigo || '',
        quantidade: Number(item.itemQuantidade) || 0,
        valor_unitario: Number(item.itemValorUnitario) || 0,
        nome_produto: item.produtoDescricao || item.produtoCodigo || '',
        descricao: item.produtoDescricao || '',
      })),
      total: Number(note.notaValorTotal) || items.reduce((sum, item) => sum + (Number(item.itemValorLiquido) || Number(item.itemValorTotal) || 0), 0),
      data_criacao: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'DRAFT',
      display_id: undefined,
      notes: noteNumber ? `Clonado da NF-e ${noteNumber}` : 'Clonado da consulta de vendas',
    };

    try {
      localStorage.setItem('orderDraftEdit', JSON.stringify(draft));
      localStorage.removeItem('cartDraft');
      onNavigate?.('cart');
    } catch {
      alert('Não foi possível preparar o pedido para clonagem.');
    }
  };

  const handleReportRowDetail = async ({ row, item }: { row: SalesHistoryReportRow; item?: SalesHistoryItem }) => {
    if (item) {
      await handleHistoryRowSelect(item);
      return;
    }

    const customerCode = String(row.clienteCodigo || appliedFilters.cliente_codigo || '').trim();
    const noteNumber = String(row.notaNumero || '').trim();
    const noteSerie = String(row.notaSerie || '').trim();
    if (!noteNumber) return;

    const matchingItems = flatHistory.results.filter((entry) => (
      String(entry.notaNumero || '').trim() === noteNumber
      && String(entry.notaSerie || '').trim() === noteSerie
      && (!customerCode || String(entry.clienteCodigo || '').trim() === customerCode)
    ));
    const fallbackItems = matchingItems.map(mapHistoryItemToNoteItem);
    const referenceItem = matchingItems[0];

    const note: SalesHistoryNote = {
      lojaCodigo: referenceItem?.lojaCodigo || undefined,
      prevendaCodigo: referenceItem?.prevendaCodigo || undefined,
      pedidoCodigo: referenceItem?.pedidoCodigo || String(row.pedido || '').trim() || undefined,
      saidaCodigo: referenceItem?.saidaCodigo || String(row.saidaCodigo || '').trim() || undefined,
      notaData: referenceItem?.notaData || String(row.emissao || '').trim() || undefined,
      notaSerie: noteSerie || undefined,
      notaNumero: noteNumber,
      notaValorTotal: Number(referenceItem?.notaValorTotal) || Number(row.valorTotal) || 0,
      documentoStatus: referenceItem?.documentoStatus || String(row.status || '').trim() || undefined,
      nfeStatus: undefined,
      documentoTipo: referenceItem?.documentoTipo || String(row.documentoTipo || '').trim() || undefined,
      itens: fallbackItems,
    };

    setSelectedHistoryNote({
      customerCode,
      customerName: referenceItem?.clienteRazaoSocial || referenceItem?.clienteFantasia || row.clienteNome || row.cliente || customerCode || noteNumber,
      sellerLabel: row.vendedor || referenceItem?.vendedorNome || referenceItem?.vendedorCodigo || '',
      note,
    });

    setExpandedNotes((current) => ({ ...current, [noteNumber]: true }));
    if (!noteItems[noteNumber]) {
      await loadNoteItems(customerCode, noteNumber, noteSerie, fallbackItems);
    }
  };

  const handleHistoryRowSelect = async (item: SalesHistoryItem) => {
    const customerCode = String(item.clienteCodigo || '').trim();
    const noteNumber = String(item.notaNumero || '').trim();
    if (!customerCode || !noteNumber) return;

    const fallbackItems = buildFallbackNoteItems(flatHistory.results, customerCode, noteNumber, String(item.notaSerie || '').trim());
    const note: SalesHistoryNote = {
      lojaCodigo: item.lojaCodigo,
      saidaCodigo: item.saidaCodigo,
      notaData: item.notaData,
      notaSerie: item.notaSerie,
      notaNumero: item.notaNumero,
      notaValorTotal: Number(item.notaValorTotal) || Number(item.itemValorLiquido) || Number(item.itemValorTotal) || 0,
      documentoStatus: item.documentoStatus,
      nfeStatus: item.nfeStatus,
      documentoTipo: item.documentoTipo,
      itens: fallbackItems,
    };

    setSelectedHistoryNote({
      customerCode,
      customerName: item.clienteRazaoSocial || item.clienteFantasia || customerCode,
      sellerLabel: item.vendedorNome || item.vendedorCodigo || '',
      note,
    });
    setExpandedNotes((current) => ({ ...current, [noteNumber]: true }));
    if (!noteItems[noteNumber]) {
      await loadNoteItems(customerCode, noteNumber, String(item.notaSerie || '').trim(), fallbackItems);
    }
  };

  useEffect(() => {
    if (!initialCustomer || loadingHistory || historyError || !flatHistory.results.length) return;
    const sale = findInitialCustomerSale(flatHistory.results, initialCustomer);
    if (!sale) return;

    const saleKey = [
      normalizeCode(sale.clienteCodigo),
      String(sale.notaNumero || '').trim(),
      String(sale.notaSerie || '').trim(),
      toInputDate(sale.notaData || sale.dataMovimento || sale.pedidoData || sale.prevendaData),
    ].join('|');

    if (!saleKey.trim() || autoSelectedSaleKeyRef.current === saleKey) return;
    autoSelectedSaleKeyRef.current = saleKey;
    handleHistoryRowSelect(sale);
  }, [flatHistory.results, historyError, initialCustomer, loadingHistory]);

  return (
    <div className="p-4 pb-20 space-y-4 text-slate-900 dark:text-slate-100">
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <BarChart3 className="w-4 h-4" />
              Consulta de Vendas
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Histórico de vendas do cliente</h2>
            <p className="text-sm text-slate-700 dark:text-slate-200">Resumo comercial agrupado por data de emissão, com subtotal diário e detalhe fiscal por nota.</p>
          </div>

          <button
            type="button"
            onClick={() => setRefreshTick((current) => current + 1)}
            disabled={loadingHistory}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {loadingHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Buscar cliente</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={customerQuery}
                onChange={(event) => handleCustomerQueryChange(event.target.value)}
                placeholder={customersLoading ? 'Carregando clientes...' : 'Código, razão social, fantasia ou CNPJ'}
                className="app-input w-full py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedDraftCustomer ? (
                <button type="button" onClick={clearSelectedCustomer} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                  <Users className="w-3.5 h-3.5" /> {selectedDraftCustomer.name} ({selectedDraftCustomer.id}) • limpar
                </button>
              ) : null}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 max-h-56 overflow-auto">
              {customerSuggestions.length > 0 ? customerSuggestions.map((customer) => (
                <button
                  type="button"
                  key={customer.id}
                  onClick={() => pickCustomer(customer)}
                  className="w-full text-left px-3 py-2 border-b last:border-b-0 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 transition-colors"
                >
                  <div className="font-semibold text-sm text-slate-900 dark:text-white">{customer.name}</div>
                  <div className="text-xs text-slate-700 dark:text-slate-200">{customer.id} • {customer.fantasyName || customer.document}</div>
                </button>
              )) : (
                <div className="px-3 py-4 text-sm text-slate-700 dark:text-slate-200">
                  {customersLoading ? 'Carregando carteira...' : customerQuery.trim() ? 'Nenhum cliente encontrado para a busca atual.' : 'Digite para buscar um cliente.'}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Busca geral</span>
              <input type="text" value={draftFilters.q || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Cliente, nota, produto..." className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Vendedor</span>
              <input type="text" value={draftFilters.vendedor_codigo || ''} readOnly disabled placeholder="Código do vendedor" className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Nota</span>
              <input type="text" value={draftFilters.nota_numero || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, nota_numero: event.target.value }))} placeholder="Número da nota" className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Produto</span>
              <input type="text" value={draftFilters.produto_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, produto_codigo: event.target.value }))} placeholder="Código do produto" className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Data inicial</span>
              <input type="date" value={draftFilters.data_inicio || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, data_inicio: event.target.value }))} className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Data final</span>
              <input type="date" value={draftFilters.data_fim || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, data_fim: event.target.value }))} className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Loja</span>
              <input type="text" value={draftFilters.loja_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, loja_codigo: event.target.value }))} placeholder="Código da loja" className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Pedido</span>
              <input type="text" value={draftFilters.pedido_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, pedido_codigo: event.target.value }))} placeholder="Código do pedido" className="app-input w-full px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Saída</span>
              <input type="text" value={draftFilters.saida_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, saida_codigo: event.target.value }))} placeholder="Código da saída" className="app-input w-full px-3 py-2 text-sm" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={applyFilters} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            <Filter className="w-4 h-4" /> Aplicar filtros
          </button>
          <button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800">
            Limpar filtros
          </button>
          <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
            Página
            <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="bg-transparent outline-none">
              {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Resultados paginados</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{flatHistory.count}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Datas na página</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{emissionGroups.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Notas do cliente</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{customerTotals.notes}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Valor do cliente</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(customerTotals.total)}</p>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Resumo por data de emissão</h3>
            <p className="text-xs text-slate-700 dark:text-slate-200">Relatório operacional agrupado por data, usando report_view como fonte principal.</p>
          </div>
          <div className="text-right text-xs text-slate-700 dark:text-slate-200">
            <div>{flatHistory.count} registro(s)</div>
            <div>Página {page} de {totalPages}</div>
          </div>
        </div>

        {historyError ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 inline-flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5" /> {historyError}</div>
        ) : (
          <SalesHistoryReportView
            reportView={flatHistory.reportView}
            reportTruncated={flatHistory.reportTruncated}
            fallbackItems={flatHistory.results}
            loading={loadingHistory}
            onSelectRow={handleHistoryRowSelect}
            onDetailRow={handleReportRowDetail}
          />
        )}

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loadingHistory} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Página anterior</button>
          <span className="text-xs text-slate-700 dark:text-slate-200">Mostrando {flatHistory.results.length} registro(s) nesta página</span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loadingHistory} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Próxima página</button>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Detalhe agrupado por nota</h3>
            <p className="text-xs text-slate-700 dark:text-slate-200">Detalhe fiscal do cliente selecionado com expansão dos itens da nota.</p>
          </div>
          {detailHeader ? (
            <div className="text-right text-xs text-slate-700 dark:text-slate-200">
              <div>{detailHeader.customerName}</div>
              <div>{detailHeader.sellerLabel}</div>
            </div>
          ) : null}
        </div>

        {!appliedFilters.cliente_codigo && !selectedHistoryNote ? (
          <div className="p-10 text-center">
            <Users className="w-12 h-12 mx-auto text-slate-400 mb-3" />
            <p className="font-medium text-slate-800 dark:text-slate-100">Selecione um cliente para ver o detalhe por nota</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">O resumo por data acima continua disponível mesmo sem cliente definido.</p>
          </div>
        ) : loadingHistory ? (
          <div className="p-10 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-700 mb-3" />
            <p className="text-slate-700 dark:text-slate-200">Carregando notas do cliente...</p>
          </div>
        ) : noteList.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-12 h-12 mx-auto text-slate-400 mb-3" />
            <p className="font-medium text-slate-800 dark:text-slate-100">Nenhuma nota encontrada</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">Nenhuma nota encontrada na lista atual para os filtros aplicados.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {noteList.map((note) => {
              const noteNumber = String(note.notaNumero || 'sem-nota');
              const itemState = noteItems[noteNumber];
              const expanded = !!expandedNotes[noteNumber];
              return (
                <article key={noteNumber + '-' + (note.notaSerie || 'serie')} className="px-4 py-4 space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleNote(note, selectedHistoryNote?.customerCode)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleNote(note, selectedHistoryNote?.customerCode);
                      }
                    }}
                    className="w-full flex items-start justify-between gap-4 text-left cursor-pointer"
                  >
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> Loja {note.lojaCodigo || '-'}</span>
                        <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Saída {note.saidaCodigo || '-'}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">Nota {note.notaNumero || '-'} • Série {note.notaSerie || '-'}</h4>
                        <div className="text-sm text-slate-600 dark:text-slate-300 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                          <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDateTime(note.notaData)}</span>
                          <span>Status doc: {note.documentoStatus || '-'}</span>
                          <span>NFe: {note.nfeStatus || '-'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-slate-700 dark:text-slate-200">Valor total</div>
                      <div className="font-bold text-slate-900 dark:text-white">{formatCurrency(note.notaValorTotal)}</div>
                      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCloneNoteToCart(note, selectedHistoryNote?.customerCode);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                        >
                          <Copy className="w-3 h-3" /> Clonar pedido
                        </button>
                        <div className="text-blue-700 dark:text-blue-300 inline-flex items-center gap-1 text-sm font-semibold">
                          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {expanded ? 'Ocultar itens' : 'Ver itens'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      {itemState?.loading ? (
                        <div className="p-6 text-center text-sm text-slate-700 dark:text-slate-200"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />Carregando itens da nota...</div>
                      ) : itemState?.error ? (
                        <div className="p-4 text-sm text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/30">{itemState.error}</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-950/60">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-200">Código</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-200">Descrição</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-200">Qtd.</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-200">Unit.</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-200">Total</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-200">Líquido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(itemState?.items || []).map((item, index) => (
                                <tr key={noteNumber + '-item-' + index} className="border-t border-slate-100 dark:border-slate-800">
                                  <td className="px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100">{item.produtoCodigo || '-'}</td>
                                  <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{item.produtoDescricao || '-'}</td>
                                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{item.itemQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
                                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{formatCurrency(item.itemValorUnitario)}</td>
                                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{formatCurrency(item.itemValorTotal)}</td>
                                  <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(item.itemValorLiquido)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
};
