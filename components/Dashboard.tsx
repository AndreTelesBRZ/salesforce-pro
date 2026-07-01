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
    <div className="min-h-full bg-black px-4 pb-12 pt-6 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <section>
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-white/60">Resumo</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[28px] bg-white p-6 text-slate-900 shadow-sm">
              <div className="flex items-center gap-3 text-slate-400">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-current">
                  <DollarSign className="h-4 w-4" />
                </div>
                <p className="text-lg font-medium">Vendas hoje</p>
              </div>
              <p className="mt-5 text-[2.5rem] font-semibold leading-none tracking-tight">
                {currencyFormatter.format(todayTotal)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => delinquencyItems.length > 0 && !delinquencyLoading && setShowDelinquencyModal(true)}
              className="rounded-[28px] bg-rose-200 p-6 text-left text-rose-900 shadow-sm transition hover:bg-rose-100 disabled:cursor-default"
              disabled={delinquencyLoading || delinquencyItems.length === 0}
            >
              <div className="flex items-center gap-3 text-rose-700">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-current">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <p className="text-lg font-medium">Inadimplência</p>
              </div>
              <p className="mt-5 text-[2.5rem] font-semibold leading-none tracking-tight">
                {delinquencyLoading ? '...' : currencyFormatter.format(delinquencyTotal)}
              </p>
              <p className="mt-3 text-sm text-rose-700/90">
                {delinquencyCustomers > 0 ? `Ver clientes (${delinquencyCustomers})` : 'Nenhum cliente em aberto'}
              </p>
            </button>
          </div>

          <div className="mt-4 rounded-[28px] bg-[#111111] p-6 text-white shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.14em] text-white/65">Meta mensal</p>
                <p className="mt-4 text-3xl font-semibold leading-none">R$ 0</p>
              </div>
              <div className="text-right">
                <p className="text-4xl leading-none text-amber-400">
                  <Award className="inline h-5 w-5" />
                </p>
                <p className="mt-3 text-2xl font-medium">{monthProgressRounded}% atingido</p>
              </div>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full rounded-full bg-lime-500 transition-all"
                style={{ width: `${Math.max(monthProgress, monthGoal > 0 ? 2 : 0)}%` }}
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-[2rem] leading-none text-white/85">
              <span className="text-xl">R$ 0</span>
              <span className="text-xl">de {currencyFormatter.format(monthGoal)}</span>
            </div>
          </div>

          <div className="mt-4">
            <TicketMedioCard data={averageTicketData} loading={ticketLoading} />
          </div>
        </section>

        {inactiveCount > 0 && !inactiveLoading && (
          <section>
            <button
              type="button"
              onClick={() => setShowInactiveModal(true)}
              className="w-full rounded-[24px] border border-white/10 bg-white/5 px-5 py-4 text-left transition hover:bg-white/10"
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-white/50">Acompanhamento</p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xl font-medium text-white">Clientes sem compra há 60 dias</p>
                  <p className="mt-1 text-sm text-white/60">{inactiveCount} cliente{inactiveCount === 1 ? '' : 's'} na carteira para reativação</p>
                </div>
                <div className="rounded-full bg-white/10 px-4 py-2 text-lg text-white">{inactiveCount}</div>
              </div>
            </button>
          </section>
        )}

        <section>
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-white/60">Ações rápidas</p>
          {perms.can_view_sales && perms.can_create_sales && (
            <button
              onClick={() => onNavigate('cart')}
              className="flex w-full items-center justify-center gap-4 rounded-[26px] bg-blue-600 px-6 py-6 text-2xl font-medium text-white shadow-sm transition hover:bg-blue-500"
            >
              <ShoppingCart className="h-7 w-7" />
              <span>Novo pedido</span>
              {cartCount > 0 && (
                <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
                  {cartCount}
                </span>
              )}
            </button>
          )}
        </section>

        {quickSections.map((section) => (
          <section key={section.title}>
            <p className="mb-3 text-sm font-medium text-white/75">{section.title}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="relative flex min-h-[150px] flex-col items-center justify-center rounded-[24px] bg-white px-6 py-7 text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  {item.badge && item.badge > 0 && (
                    <span className="absolute right-4 top-4 rounded-full bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-900">
                      {item.badge}
                    </span>
                  )}
                  <item.icon className="h-10 w-10 text-slate-700" />
                  <span className="mt-6 text-2xl font-medium tracking-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        {!isStoragePersisted && !permissionRequested && (
          <section className="rounded-[24px] border border-orange-300/40 bg-orange-50 p-5 text-slate-900 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                  <Database className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Instalar banco de dados local</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    Autorize o armazenamento persistente para evitar que Android ou navegador limpem clientes, produtos e pedidos offline.
                  </p>
                </div>
              </div>
              <button
                onClick={handleRequestPersistence}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-700"
              >
                <ShieldCheck className="h-4 w-4" />
                Autorizar agora
              </button>
            </div>
          </section>
        )}

        <section className="rounded-[24px] bg-white px-5 py-4 text-slate-700 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-base">
              <span className="inline-flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-slate-500" />
                {localCount !== null ? `${localCount} produtos` : '... produtos'}
              </span>
              <span className="inline-flex items-center gap-2">
                <User className="h-4 w-4 text-slate-500" />
                {localCustomerCount !== null ? `${localCustomerCount} clientes` : '... clientes'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-base">
              <span className={`inline-flex items-center gap-2 font-medium ${(localCount || 0) > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                <UploadCloud className="h-4 w-4" />
                {pendingCount > 0 ? `Offline · ${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : 'Offline · não sincronizado'}
              </span>
              {isLinkedDevice && (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                  <Zap className="h-4 w-4" />
                  Dispositivo vinculado
                </span>
              )}
            </div>
          </div>
        </section>
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
