import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import { getStoreCodeForCurrentHost } from '../services/storeHost';
import { Customer, SalesHistoryCustomerGrouped, SalesHistoryFilters, SalesHistoryItem, SalesHistoryNote, SalesHistoryNoteItem, SalesHistoryResponse } from '../types';
import { AlertCircle, BarChart3, Briefcase, Calendar, ChevronDown, ChevronUp, ClipboardList, FileText, Filter, Loader2, Package, RefreshCcw, Search, Store, Users } from 'lucide-react';
import { SalesHistoryReportView } from './SalesHistoryReportView';

interface SalesHistoryPageProps {
  initialCustomer?: Customer | null;
}

const formatInputDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

const getDefaultFilters = (): SalesHistoryFilters => {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    cliente_codigo: '',
    vendedor_codigo: apiService.getSellerId() || '',
    nota_numero: '',
    produto_codigo: '',
    data_inicio: formatInputDate(startOfMonth),
    data_fim: formatInputDate(today),
    loja_codigo: getStoreCodeForCurrentHost(),
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

export const SalesHistoryPage: React.FC<SalesHistoryPageProps> = ({ initialCustomer }) => {
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
  const [loadingCustomerHistory, setLoadingCustomerHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [customerHistoryError, setCustomerHistoryError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshTick, setRefreshTick] = useState(0);

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
    setCustomerQuery(customerLabel(initialCustomer));
    setDraftFilters((current) => ({ ...current, cliente_codigo: initialCustomer.id }));
    setAppliedFilters((current) => ({ ...current, cliente_codigo: initialCustomer.id }));
    setPage(1);
  }, [initialCustomer]);

  const selectedCustomer = useMemo(() => {
    const customerCode = draftFilters.cliente_codigo || appliedFilters.cliente_codigo;
    if (!customerCode) return null;
    return customers.find((customer) => customer.id === customerCode) || null;
  }, [customers, draftFilters.cliente_codigo, appliedFilters.cliente_codigo]);

  const customerSuggestions = useMemo(() => {
    const query = normalizeText(customerQuery);
    if (!query) return customers.slice(0, 8);
    return customers
      .filter((customer) => {
        const haystack = normalizeText(customer.id + ' ' + customer.name + ' ' + (customer.fantasyName || '') + ' ' + customer.document);
        return haystack.includes(query);
      })
      .slice(0, 8);
  }, [customers, customerQuery]);

  const customerTotals = useMemo(() => {
    const notes = customerGrouped?.notas || [];
    return {
      notes: notes.length,
      items: notes.reduce((sum, note) => sum + (note.itens?.length || 0), 0),
      total: notes.reduce((sum, note) => sum + (Number(note.notaValorTotal) || 0), 0),
    };
  }, [customerGrouped]);

  const paginatedGroups = useMemo(() => groupHistoryByNote(flatHistory.results), [flatHistory.results]);
  const emissionGroups = useMemo(() => flatHistory.reportView?.groups || groupHistoryByEmissionDate(flatHistory.results), [flatHistory.reportView, flatHistory.results]);
  const totalPages = Math.max(1, Math.ceil(flatHistory.count / pageSize));

  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters });
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
    setPage(1);
  };

  const pickCustomer = (customer: Customer) => {
    setDraftFilters((current) => ({ ...current, cliente_codigo: customer.id }));
    setCustomerQuery(customerLabel(customer));
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
    const customerCode = String(appliedFilters.cliente_codigo || '').trim();
    if (!customerCode) {
      setCustomerGrouped(null);
      setCustomerNotes([]);
      setCustomerHistoryError('');
      setExpandedNotes({});
      setNoteItems({});
      return;
    }

    let active = true;
    setLoadingCustomerHistory(true);
    setCustomerHistoryError('');
    setExpandedNotes({});
    setNoteItems({});

    Promise.all([
      apiService.getCustomerSalesHistory(customerCode, appliedFilters),
      apiService.getCustomerSalesNotes(customerCode, appliedFilters),
    ])
      .then(([grouped, notes]) => {
        if (!active) return;
        setCustomerGrouped(grouped);
        setCustomerNotes(notes);
      })
      .catch((error: any) => {
        if (!active) return;
        setCustomerGrouped(null);
        setCustomerNotes([]);
        setCustomerHistoryError(error?.message || 'Não foi possível carregar o histórico agrupado do cliente.');
      })
      .finally(() => {
        if (active) setLoadingCustomerHistory(false);
      });

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
    refreshTick,
  ]);

  const toggleNote = async (note: SalesHistoryNote) => {
    const noteNumber = String(note.notaNumero || '').trim();
    if (!noteNumber || !appliedFilters.cliente_codigo) return;

    setExpandedNotes((current) => ({ ...current, [noteNumber]: !current[noteNumber] }));
    if (expandedNotes[noteNumber] || noteItems[noteNumber]) return;

    setNoteItems((current) => ({
      ...current,
      [noteNumber]: { loading: true, items: [] },
    }));

    try {
      const items = await apiService.getCustomerSalesNoteItems(appliedFilters.cliente_codigo, noteNumber, appliedFilters);
      setNoteItems((current) => ({
        ...current,
        [noteNumber]: { loading: false, items },
      }));
    } catch (error: any) {
      setNoteItems((current) => ({
        ...current,
        [noteNumber]: { loading: false, error: error?.message || 'Erro ao carregar itens da nota.', items: [] },
      }));
    }
  };

  return (
    <div className="p-4 pb-20 space-y-4">
      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <BarChart3 className="w-4 h-4" />
              Consulta de Vendas
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Histórico de vendas do cliente</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Resumo comercial agrupado por data de emissão, com subtotal diário e detalhe fiscal por nota.</p>
          </div>

          <button
            type="button"
            onClick={() => setRefreshTick((current) => current + 1)}
            disabled={loadingHistory || loadingCustomerHistory}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {(loadingHistory || loadingCustomerHistory) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buscar cliente</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder={customersLoading ? 'Carregando clientes...' : 'Código, razão social, fantasia ou CNPJ'}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedCustomer ? (
                <button type="button" onClick={clearSelectedCustomer} className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                  <Users className="w-3.5 h-3.5" /> {selectedCustomer.name} ({selectedCustomer.id}) • limpar
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
                  <div className="text-xs text-slate-500 dark:text-slate-400">{customer.id} • {customer.fantasyName || customer.document}</div>
                </button>
              )) : (
                <div className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                  {customersLoading ? 'Carregando carteira...' : 'Nenhum cliente encontrado para a busca atual.'}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Busca geral</span>
              <input type="text" value={draftFilters.q || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Cliente, nota, produto..." className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendedor</span>
              <input type="text" value={draftFilters.vendedor_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, vendedor_codigo: event.target.value }))} placeholder="Código do vendedor" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nota</span>
              <input type="text" value={draftFilters.nota_numero || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, nota_numero: event.target.value }))} placeholder="Número da nota" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Produto</span>
              <input type="text" value={draftFilters.produto_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, produto_codigo: event.target.value }))} placeholder="Código do produto" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data inicial</span>
              <input type="date" value={draftFilters.data_inicio || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, data_inicio: event.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data final</span>
              <input type="date" value={draftFilters.data_fim || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, data_fim: event.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Loja</span>
              <input type="text" value={draftFilters.loja_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, loja_codigo: event.target.value }))} placeholder="Código da loja" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pedido</span>
              <input type="text" value={draftFilters.pedido_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, pedido_codigo: event.target.value }))} placeholder="Código do pedido" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saída</span>
              <input type="text" value={draftFilters.saida_codigo || ''} onChange={(event) => setDraftFilters((current) => ({ ...current, saida_codigo: event.target.value }))} placeholder="Código da saída" className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={applyFilters} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600">
            <Filter className="w-4 h-4" /> Aplicar filtros
          </button>
          <button type="button" onClick={resetFilters} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
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
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resultados paginados</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{flatHistory.count}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datas na página</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{emissionGroups.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notas do cliente</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{customerTotals.notes}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor do cliente</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{formatCurrency(customerTotals.total)}</p>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Resumo por data de emissão</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Relatório operacional agrupado por data, usando report_view como fonte principal.</p>
          </div>
          <div className="text-right text-xs text-slate-500 dark:text-slate-400">
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
          />
        )}

        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loadingHistory} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Página anterior</button>
          <span className="text-xs text-slate-500 dark:text-slate-400">Mostrando {flatHistory.results.length} registro(s) nesta página</span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loadingHistory} className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Próxima página</button>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Detalhe agrupado por nota</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Detalhe fiscal do cliente selecionado com expansão dos itens da nota.</p>
          </div>
          {customerGrouped ? (
            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
              <div>{customerGrouped.clienteRazaoSocial || selectedCustomer?.name || customerGrouped.clienteCodigo}</div>
              <div>{customerGrouped.vendedorNome || customerGrouped.vendedorCodigo || 'Vendedor conforme backend'}</div>
            </div>
          ) : null}
        </div>

        {!appliedFilters.cliente_codigo ? (
          <div className="p-10 text-center">
            <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium text-slate-700 dark:text-slate-200">Selecione um cliente para ver o detalhe por nota</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">O resumo por data acima continua disponível mesmo sem cliente definido.</p>
          </div>
        ) : loadingCustomerHistory ? (
          <div className="p-10 text-center">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-700 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Carregando notas do cliente...</p>
          </div>
        ) : customerHistoryError ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 inline-flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5" /> {customerHistoryError}
          </div>
        ) : customerNotes.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium text-slate-700 dark:text-slate-200">Nenhuma nota encontrada</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">O backend não retornou notas para os filtros aplicados.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {customerNotes.map((note) => {
              const noteNumber = String(note.notaNumero || 'sem-nota');
              const itemState = noteItems[noteNumber];
              const expanded = !!expandedNotes[noteNumber];
              return (
                <article key={noteNumber + '-' + (note.notaSerie || 'serie')} className="px-4 py-4 space-y-3">
                  <button type="button" onClick={() => toggleNote(note)} className="w-full flex items-start justify-between gap-4 text-left">
                    <div className="space-y-2 min-w-0">
                      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> Loja {note.lojaCodigo || '-'}</span>
                        <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" /> Pedido {note.pedidoCodigo || '-'}</span>
                        <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Saída {note.saidaCodigo || '-'}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">Nota {note.notaNumero || '-'} • Série {note.notaSerie || '-'}</h4>
                        <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                          <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDateTime(note.notaData)}</span>
                          <span>Status doc: {note.documentoStatus || '-'}</span>
                          <span>NFe: {note.nfeStatus || '-'}</span>
                          <span>Pré-venda: {note.prevendaCodigo || '-'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-slate-500 dark:text-slate-400">Valor total</div>
                      <div className="font-bold text-slate-900 dark:text-white">{formatCurrency(note.notaValorTotal)}</div>
                      <div className="mt-2 text-blue-700 dark:text-blue-300 inline-flex items-center gap-1 text-sm font-semibold">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {expanded ? 'Ocultar itens' : 'Ver itens'}
                      </div>
                    </div>
                  </button>

                  {expanded ? (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                      {itemState?.loading ? (
                        <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400"><Loader2 className="w-5 h-5 mx-auto animate-spin mb-2" />Carregando itens da nota...</div>
                      ) : itemState?.error ? (
                        <div className="p-4 text-sm text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/30">{itemState.error}</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-950/60">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Código</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Descrição</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Qtd.</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Unit.</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Total</th>
                                <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Líquido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(itemState?.items || []).map((item, index) => (
                                <tr key={noteNumber + '-item-' + index} className="border-t border-slate-100 dark:border-slate-800">
                                  <td className="px-3 py-2 font-mono text-xs">{item.produtoCodigo || '-'}</td>
                                  <td className="px-3 py-2">{item.produtoDescricao || '-'}</td>
                                  <td className="px-3 py-2 text-right">{item.itemQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(item.itemValorUnitario)}</td>
                                  <td className="px-3 py-2 text-right">{formatCurrency(item.itemValorTotal)}</td>
                                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.itemValorLiquido)}</td>
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

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">Detalhes da página por nota</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Complemento da página consultada, agrupando as linhas recebidas por nota.</p>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 text-right">
            <div>{paginatedGroups.length} nota(s) nesta página</div>
          </div>
        </div>

        {loadingHistory ? (
          <div className="p-10 text-center"><Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-700 mb-3" /><p className="text-slate-500 dark:text-slate-400">Carregando detalhes...</p></div>
        ) : historyError ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200 inline-flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5" /> {historyError}</div>
        ) : paginatedGroups.length === 0 ? (
          <div className="p-10 text-center"><Package className="w-12 h-12 mx-auto text-slate-300 mb-3" /><p className="font-medium text-slate-700 dark:text-slate-200">Nenhuma nota encontrada</p><p className="text-sm text-slate-500 dark:text-slate-400">Ajuste os filtros e tente novamente.</p></div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {paginatedGroups.map((group) => (
              <article key={group.key} className="px-4 py-4 space-y-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {group.items[0]?.clienteRazaoSocial || group.items[0]?.clienteFantasia || group.items[0]?.clienteCodigo || 'Cliente'}</span>
                      <span className="inline-flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> Vend. {group.items[0]?.vendedorNome || group.items[0]?.vendedorCodigo || '-'}</span>
                      <span className="inline-flex items-center gap-1"><Store className="w-3.5 h-3.5" /> Loja {group.note.lojaCodigo || '-'}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white">Nota {group.note.notaNumero || '-'} • Série {group.note.notaSerie || '-'}</h4>
                      <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {formatDateTime(group.note.notaData)}</span>
                        <span>Pré-venda: {group.note.prevendaCodigo || '-'}</span>
                        <span>Pedido: {group.note.pedidoCodigo || '-'}</span>
                        <span>Saída: {group.note.saidaCodigo || '-'}</span>
                        <span>Status: {group.note.documentoStatus || group.note.nfeStatus || '-'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Total da nota</div>
                    <div className="font-bold text-slate-900 dark:text-white">{formatCurrency(group.note.notaValorTotal)}</div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950/60">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Produto</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Descrição</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Qtd.</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Unit.</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Total</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, index) => (
                        <tr key={group.key + '-' + index} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="px-3 py-2 font-mono text-xs">{item.produtoCodigo || '-'}</td>
                          <td className="px-3 py-2">{item.produtoDescricao || '-'}</td>
                          <td className="px-3 py-2 text-right">{item.itemQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.itemValorUnitario)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.itemValorTotal)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.itemValorLiquido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
