import React, { useState, useEffect } from 'react';
import { User, ShoppingCart, LayoutGrid, Download, UploadCloud, Settings, ShieldCheck, Zap, FileText, Database, Award, DollarSign, AlertTriangle, X, BarChart3 } from 'lucide-react';
import { apiService } from '../services/api';
import { dbService } from '../services/db';
import { getStoreCodeForApi } from '../services/storeHost';
import { Customer, DelinquencyItem, SalesHistoryFilters, SalesHistoryItem, UserPermissions } from '../types';
import { calculateAverageTicket, AverageTicketResult, summarizeSalesHistory } from '../salesMetrics';
import { TicketMedioCard } from '../TicketMedioCard';

interface DashboardProps {
  onNavigate: (view: string) => void;
  cartCount: number;
  permissions: UserPermissions | null;
}

const formatInputDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
};

const getForcedSalesHistoryStoreCode = (): string => {
  return getStoreCodeForApi();
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, cartCount, permissions }) => {
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [localCustomerCount, setLocalCustomerCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isStoragePersisted, setIsStoragePersisted] = useState(true);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [isLinkedDevice, setIsLinkedDevice] = useState(false);
  const [todayTotal, setTodayTotal] = useState<number>(0);
  const [monthGoal, setMonthGoal] = useState<number>(0);
  const [delinquencyTotal, setDelinquencyTotal] = useState<number>(0);
  const [delinquencyCustomers, setDelinquencyCustomers] = useState<number>(0);
  const [delinquencyItems, setDelinquencyItems] = useState<DelinquencyItem[]>([]);
  const [delinquencyLoading, setDelinquencyLoading] = useState<boolean>(false);
  const [showDelinquencyModal, setShowDelinquencyModal] = useState<boolean>(false);
  const [inactiveCustomersList, setInactiveCustomersList] = useState<{ customer: Customer; lastSale: Date | null }[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState<boolean>(false);
  const [showInactiveModal, setShowInactiveModal] = useState<boolean>(false);
  const [averageTicketData, setAverageTicketData] = useState<AverageTicketResult | null>(null);
  const [ticketLoading, setTicketLoading] = useState<boolean>(true);

  useEffect(() => {
    refreshLocalCounts();
    checkStoragePersistence();
    checkDeviceLink();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const parseDateValue = (value?: string) => {
      if (!value) return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const direct = new Date(trimmed);
      if (!Number.isNaN(direct.getTime())) return direct;
      const parts = trimmed.split(/[\/-]/);
      if (parts.length === 3) {
        const isYearFirst = parts[0].length === 4;
        const year = Number(isYearFirst ? parts[0] : parts[2]);
        const month = Number(parts[1]);
        const day = Number(isYearFirst ? parts[2] : parts[0]);
        if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
          const normalizedYear = year < 100 ? 2000 + year : year;
          const parsed = new Date(normalizedYear, month - 1, day);
          if (!Number.isNaN(parsed.getTime())) return parsed;
        }
      }
      return null;
    };

    const setLatestDate = (map: Map<string, Date>, key: string | undefined, value: Date | null) => {
      if (!key || !value) return;
      const current = map.get(key);
      if (!current || value > current) map.set(key, value);
    };

    const fetchAllSalesHistory = async (filters: SalesHistoryFilters): Promise<SalesHistoryItem[]> => {
      const pageSize = 200;
      const collected: SalesHistoryItem[] = [];

      for (let currentPage = 1; currentPage <= 30; currentPage++) {
        const response = await apiService.getSalesHistory(filters, currentPage, pageSize);
        if (!Array.isArray(response.results) || response.results.length === 0) break;
        collected.push(...response.results);
        if (!response.next || response.results.length < pageSize) break;
      }

      return collected;
    };

    const loadSalesHistoryFigures = async () => {
      try {
        const today = new Date();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const forcedStoreCode = getForcedSalesHistoryStoreCode();
        const baseFilters: SalesHistoryFilters = {
          vendedor_codigo: apiService.getSellerId() || '',
          loja_codigo: forcedStoreCode,
        };

        const [todayHistory, monthHistory] = await Promise.all([
          fetchAllSalesHistory({
            ...baseFilters,
            data_inicio: formatInputDate(today),
            data_fim: formatInputDate(today),
          }),
          fetchAllSalesHistory({
            ...baseFilters,
            data_inicio: formatInputDate(monthStart),
            data_fim: formatInputDate(today),
          }),
        ]);

        if (!isMounted) return;

        const todaySummary = summarizeSalesHistory(todayHistory);
        const monthSummary = summarizeSalesHistory(monthHistory);
        setTodayTotal(todaySummary.total);
        setMonthGoal(monthSummary.total);
      } catch (error) {
        console.warn('Falha ao carregar métricas pelo histórico de vendas', error);
      }
    };

    const loadLocalFigures = async () => {
      setInactiveLoading(true);
      setTicketLoading(true);
      try {
        const allOrders = await dbService.getOrders();
        let customers: Customer[] = [];
        try {
          customers = await apiService.getCustomers();
        } catch {
          customers = [];
        }

        if (!isMounted) return;

        const lastSaleById = new Map<string, Date>();
        const lastSaleByDoc = new Map<string, Date>();
        allOrders.forEach((o) => {
          const orderDate = parseDateValue(o.createdAt);
          if (!orderDate) return;
          setLatestDate(lastSaleById, o.customerId, orderDate);
          setLatestDate(lastSaleByDoc, o.customerDoc, orderDate);
        });

        const inactiveCutoff = new Date();
        inactiveCutoff.setDate(inactiveCutoff.getDate() - 60);

        const filteredCustomers = customers.filter((c) => c.id !== '0' && c.type !== 'TEMPORARIO');
        const inactiveList = filteredCustomers
          .map((customer) => {
            const lastSale =
              parseDateValue(customer.lastSaleDate) ||
              lastSaleById.get(customer.id) ||
              lastSaleByDoc.get(customer.document) ||
              null;
            return { customer, lastSale };
          })
          .filter(({ lastSale }) => !lastSale || lastSale < inactiveCutoff)
          .sort((a, b) => {
            if (!a.lastSale && !b.lastSale) return a.customer.name.localeCompare(b.customer.name);
            if (!a.lastSale) return -1;
            if (!b.lastSale) return 1;
            return a.lastSale.getTime() - b.lastSale.getTime();
          });

        const averageTicket = calculateAverageTicket(allOrders);

        if (!isMounted) return;

        setInactiveCustomersList(inactiveList);
        setAverageTicketData(averageTicket);
      } catch (error) {
        console.error('Falha ao carregar métricas locais', error);
      } finally {
        if (isMounted) {
          setInactiveLoading(false);
          setTicketLoading(false);
        }
      }
    };

    loadLocalFigures();
    loadSalesHistoryFigures();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadDelinquency = async () => {
      setDelinquencyLoading(true);
      const items = await apiService.getDelinquency();
      if (!isMounted) return;
      setDelinquencyItems(items);
      const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
      const customers = new Set(
        items.map((item) => item.customerCode || item.document || item.customerName || item.id)
      );
      setDelinquencyTotal(total);
      setDelinquencyCustomers(customers.size);
      setDelinquencyLoading(false);
    };
    loadDelinquency();
    return () => {
      isMounted = false;
    };
  }, []);

  const checkDeviceLink = () => {
    const config = apiService.getConfig();
    if (config.apiToken && (config.backendUrl || getStoreCodeForApi())) {
      setIsLinkedDevice(true);
    }
  };

  const checkStoragePersistence = async () => {
    const isPersisted = await dbService.isStoragePersisted();
    setIsStoragePersisted(isPersisted);
  };

  const handleRequestPersistence = async () => {
    const granted = await dbService.requestPersistentStorage();
    if (granted) {
      setIsStoragePersisted(true);
    } else {
      setPermissionRequested(true);
      alert('O navegador ou dispositivo não permitiu a persistência total. Os dados ainda serão salvos, mas podem ser limpos pelo sistema se faltar espaço.');
    }
  };

  const refreshLocalCounts = () => {
    dbService.countProducts().then(setLocalCount).catch(() => setLocalCount(0));
    dbService.countCustomers().then(setLocalCustomerCount).catch(() => setLocalCustomerCount(0));
    dbService.getPendingOrders().then(orders => setPendingCount(orders.length)).catch(() => setPendingCount(0));
  };

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (value?: string) => {
    if (!value) return '';
    const raw = value.split('T')[0];
    const parts = raw.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return value;
  };

  const formatDateLabel = (value: Date | null) => {
    if (!value) return 'Sem compra';
    return value.toLocaleDateString('pt-BR');
  };

  const monthProgress = monthGoal > 0 ? Math.min(100, (todayTotal / monthGoal) * 100) : 0;
  const monthProgressRounded = Math.round(monthProgress);
  const inactiveCount = inactiveCustomersList.length;

  const perms = permissions || {
    can_view_products: false,
    can_view_clients: false,
    can_view_sales: false,
    can_create_sales: false,
    can_edit_sales: false,
    can_delete_sales: false,
    can_view_purchases: false,
    can_view_financial: false,
    can_view_all_companies: false,
  };

  const quickSections = [
    {
      title: 'Vender',
      items: [
        perms.can_view_clients ? { id: 'customers', label: 'Clientes', icon: User, badge: undefined } : null,
        perms.can_view_products ? { id: 'products', label: 'Produtos', icon: LayoutGrid, badge: undefined } : null,
      ].filter(Boolean),
    },
    {
      title: 'Análise',
      items: [
        perms.can_view_sales ? { id: 'reports', label: 'Relatórios', icon: BarChart3, badge: undefined } : null,
        perms.can_view_sales ? { id: 'orders', label: 'Histórico', icon: FileText, badge: undefined } : null,
      ].filter(Boolean),
    },
    {
      title: 'Sistema',
      items: [
        perms.can_view_products || perms.can_view_clients ? { id: 'sync', label: 'Sincronizar', icon: Download, badge: undefined } : null,
        perms.can_view_sales && perms.can_create_sales ? { id: 'send', label: 'Enviar dados', icon: UploadCloud, badge: pendingCount || undefined } : null,
        { id: 'settings', label: 'Config.', icon: Settings, badge: undefined },
      ].filter(Boolean),
    },
  ].filter((section) => section.items.length > 0) as Array<{
    title: string;
    items: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }>;
  }>;

  const sortedDelinquency = [...delinquencyItems].sort((a, b) => {
    const aDate = a.dueDate || a.dueDateReal || '';
    const bDate = b.dueDate || b.dueDateReal || '';
    return aDate.localeCompare(bDate);
  });

  return (
    <div className="min-h-full bg-[#0a0a0f] px-3 pb-8 pt-4 text-white">
      <div className="mx-auto max-w-2xl space-y-3">

        {/* ── Métricas principais em linha ── */}
        <div className="grid grid-cols-2 gap-2">
          {/* Vendas hoje */}
          <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-white/50 mb-2">
              <DollarSign className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-widest">Vendas hoje</span>
            </div>
            <p className="text-xl font-bold leading-none tracking-tight text-white">
              {currencyFormatter.format(todayTotal)}
            </p>
          </div>

          {/* Inadimplência */}
          <button
            type="button"
            onClick={() => delinquencyItems.length > 0 && !delinquencyLoading && setShowDelinquencyModal(true)}
            className="rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3.5 text-left transition hover:bg-rose-500/15 disabled:cursor-default active:scale-[0.98]"
            disabled={delinquencyLoading || delinquencyItems.length === 0}
          >
            <div className="flex items-center gap-1.5 text-rose-400/80 mb-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-widest">Inadimplência</span>
            </div>
            <p className="text-xl font-bold leading-none tracking-tight text-rose-400">
              {delinquencyLoading ? '···' : currencyFormatter.format(delinquencyTotal)}
            </p>
            {delinquencyCustomers > 0 && (
              <p className="mt-1.5 text-[10px] text-rose-400/70">
                {delinquencyCustomers} cliente{delinquencyCustomers !== 1 ? 's' : ''} →
              </p>
            )}
          </button>
        </div>

        {/* ── Meta mensal ── */}
        <div className="rounded-2xl bg-white/[0.06] border border-white/[0.08] p-3.5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5 text-white/50">
              <Award className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Meta mensal</span>
            </div>
            <span className="text-xs font-bold text-amber-400">{monthProgressRounded}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-2.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-lime-400 transition-all duration-700"
              style={{ width: `${Math.max(monthProgress, monthGoal > 0 ? 2 : 0)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/40">
            <span>{currencyFormatter.format(todayTotal)}</span>
            <span>meta {currencyFormatter.format(monthGoal)}</span>
          </div>
        </div>

        {/* ── Ticket médio (compacto) ── */}
        <TicketMedioCard data={averageTicketData} loading={ticketLoading} />

        {/* ── Clientes inativos ── */}
        {inactiveCount > 0 && !inactiveLoading && (
          <button
            type="button"
            onClick={() => setShowInactiveModal(true)}
            className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/8 px-3.5 py-3 text-left transition hover:bg-amber-500/12 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/15 text-amber-400">
                  <User className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white leading-none">Sem compra há 60 dias</p>
                  <p className="text-[10px] text-white/45 mt-0.5">Carteira para reativação</p>
                </div>
              </div>
              <span className="text-sm font-bold text-amber-400 bg-amber-400/15 px-2.5 py-1 rounded-full">{inactiveCount}</span>
            </div>
          </button>
        )}

        {/* ── Novo pedido (CTA principal) ── */}
        {perms.can_view_sales && perms.can_create_sales && (
          <button
            onClick={() => onNavigate('cart')}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-blue-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:bg-blue-500 active:scale-[0.98]"
          >
            <ShoppingCart className="h-5 w-5" />
            <span>Novo pedido</span>
            {cartCount > 0 && (
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{cartCount}</span>
            )}
          </button>
        )}

        {/* ── Ações rápidas (grid compacto) ── */}
        {quickSections.map((section) => (
          <div key={section.title}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35 px-0.5">{section.title}</p>
            <div className="grid grid-cols-3 gap-2">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="relative flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/[0.06] border border-white/[0.08] px-3 py-4 text-white transition hover:bg-white/[0.10] active:scale-[0.97]"
                >
                  {item.badge && item.badge > 0 && (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-black leading-none">
                      {item.badge}
                    </span>
                  )}
                  <item.icon className="h-5 w-5 text-white/70" />
                  <span className="text-[11px] font-medium text-white/80 text-center leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* ── Alerta banco de dados local ── */}
        {!isStoragePersisted && !permissionRequested && (
          <div className="rounded-2xl border border-orange-400/20 bg-orange-400/8 p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-400/15 text-orange-400">
                <Database className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-none">Banco de dados local</p>
                <p className="text-[10px] text-white/50 mt-0.5">Autorize para salvar dados offline.</p>
              </div>
              <button
                onClick={handleRequestPersistence}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-orange-400"
              >
                <ShieldCheck className="h-3 w-3" />
                Autorizar
              </button>
            </div>
          </div>
        )}

        {/* ── Status do dispositivo ── */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/35">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <LayoutGrid className="h-3 w-3" />
                {localCount !== null ? `${localCount} produtos` : '—'}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3" />
                {localCustomerCount !== null ? `${localCustomerCount} clientes` : '—'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <span className="flex items-center gap-1 text-amber-400/70 font-medium">
                  <UploadCloud className="h-3 w-3" />
                  {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
                </span>
              )}
              {isLinkedDevice && (
                <span className="flex items-center gap-1 text-emerald-400/80 font-medium">
                  <Zap className="h-3 w-3" />
                  Vinculado
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {showDelinquencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">Inadimplencia na carteira</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {delinquencyItems.length} titulo{delinquencyItems.length !== 1 ? 's' : ''} • R$ {formatCurrency(delinquencyTotal)}
                </p>
              </div>
              <button
                onClick={() => setShowDelinquencyModal(false)}
                className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <div className="space-y-3 overflow-auto p-4">
              {delinquencyLoading ? (
                <p className="text-sm text-slate-500">Carregando inadimplencia...</p>
              ) : sortedDelinquency.length > 0 ? (
                sortedDelinquency.map((item) => {
                  const dueDate = formatDate(item.dueDate || item.dueDateReal);
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {item.customerName || item.fantasyName || 'Cliente'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {item.document || item.customerCode || 'Documento nao informado'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-rose-600 dark:text-rose-400">
                            R$ {formatCurrency(item.amount)}
                          </p>
                          {dueDate && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">Venc.: {dueDate}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.titleNumber && <span>Titulo: {item.titleNumber}</span>}
                        {item.city && <span>{item.city}</span>}
                        {item.documentType && <span>{item.documentType}</span>}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">Nenhum titulo encontrado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showInactiveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">Clientes sem compra há 60 dias</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {inactiveCustomersList.length} cliente{inactiveCustomersList.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowInactiveModal(false)}
                className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="Fechar"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <div className="space-y-3 overflow-auto p-4">
              {inactiveLoading ? (
                <p className="text-sm text-slate-500">Carregando clientes...</p>
              ) : inactiveCustomersList.length > 0 ? (
                inactiveCustomersList.map(({ customer, lastSale }) => (
                  <div
                    key={customer.id}
                    className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 p-3 dark:border-slate-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{customer.name}</p>
                      {customer.fantasyName && customer.fantasyName !== customer.name && (
                        <p className="truncate text-xs text-blue-600 dark:text-blue-400">{customer.fantasyName}</p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">{customer.document || 'Documento não informado'}</p>
                      {(customer.city || customer.state) && (
                        <p className="text-xs text-slate-400">
                          {customer.city || ''}{customer.state ? ` / ${customer.state}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-semibold uppercase text-slate-400">Última compra</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{formatDateLabel(lastSale)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">Nenhum cliente sem compra há 60 dias.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
