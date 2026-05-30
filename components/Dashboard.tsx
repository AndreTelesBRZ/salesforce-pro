
import React, { useState, useEffect } from 'react';
import { User, ShoppingCart, LayoutGrid, Download, UploadCloud, Settings, ShieldCheck, Zap, FileText, Database, Award, DollarSign, AlertTriangle, ChevronRight, X } from 'lucide-react';
import { apiService, ClientSyncViewMode, ClientSyncViewResponse } from '../services/api';
import { dbService } from '../services/db';
import { Customer, DelinquencyItem } from '../types';
import { calculateAverageTicket, AverageTicketResult } from '../salesMetrics';
import { TicketMedioCard } from '../TicketMedioCard';

interface DashboardProps {
  onNavigate: (view: string) => void;
  cartCount: number;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, cartCount }) => {
  const [localCount, setLocalCount] = useState<number | null>(null);
  const [localCustomerCount, setLocalCustomerCount] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  
  // Estado para controle de persistência do BD
  const [isStoragePersisted, setIsStoragePersisted] = useState(true); 
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [isLinkedDevice, setIsLinkedDevice] = useState(false);

  useEffect(() => {
    refreshLocalCounts();
    checkStoragePersistence();
    checkDeviceLink();
  }, []);

  // KPIs simples gerados localmente para demonstração
  const [todayTotal, setTodayTotal] = useState<number>(0);
  const [monthGoal] = useState<number>(50000); // meta fixa de demonstração
  const [topCustomers, setTopCustomers] = useState<{name:string,total:number}[]>([]);
  const [delinquencyTotal, setDelinquencyTotal] = useState<number>(0);
  const [delinquencyCustomers, setDelinquencyCustomers] = useState<number>(0);
  const [delinquencyItems, setDelinquencyItems] = useState<DelinquencyItem[]>([]);
  const [delinquencyLoading, setDelinquencyLoading] = useState<boolean>(false);
  const [showDelinquencyModal, setShowDelinquencyModal] = useState<boolean>(false);
  const [inactiveCustomersList, setInactiveCustomersList] = useState<{ customer: Customer; lastSale: Date | null }[]>([]);
  const [inactiveLoading, setInactiveLoading] = useState<boolean>(false);
  const [showInactiveModal, setShowInactiveModal] = useState<boolean>(false);
  const [clientSyncSelfView, setClientSyncSelfView] = useState<ClientSyncViewResponse | null>(null);
  const [clientSyncAllView, setClientSyncAllView] = useState<ClientSyncViewResponse | null>(null);
  const [clientSyncRecentView, setClientSyncRecentView] = useState<ClientSyncViewResponse | null>(null);
  const [clientSyncLoading, setClientSyncLoading] = useState<boolean>(false);
  const [averageTicketData, setAverageTicketData] = useState<AverageTicketResult | null>(null);
  const [ticketLoading, setTicketLoading] = useState<boolean>(true);

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

          const today = new Date().toDateString();
          const todayOrders = allOrders.filter(o => new Date(o.createdAt).toDateString() === today);
          const todaySum = todayOrders.reduce((s,o)=> s + o.total, 0);
          const map: Record<string, number> = {};
          allOrders.forEach(o => {
             const key = o.customerName || 'Cliente';
             map[key] = (map[key] || 0) + o.total;
          });
          const tops = Object.entries(map).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,5);

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

          setTodayTotal(todaySum);
          setTopCustomers(tops);
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

     return () => {
        isMounted = false;
      };
 }, []);

  useEffect(() => {
    let isMounted = true;

    const loadClientSyncViews = async () => {
      setClientSyncLoading(true);
      try {
        const [self, all, recent] = await Promise.all([
          apiService.fetchClientSyncView('self'),
          apiService.fetchClientSyncView('all'),
          apiService.fetchClientSyncView('recent')
        ]);
        if (!isMounted) return;
        setClientSyncSelfView(self);
        setClientSyncAllView(all);
        setClientSyncRecentView(recent);
      } catch (error) {
        console.error('Falha ao carregar dados de sincronização', error);
      } finally {
        if (isMounted) setClientSyncLoading(false);
      }
    };

    loadClientSyncViews();
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
      if (config.apiToken && config.backendUrl) {
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
          alert("O navegador ou dispositivo não permitiu a persistência total. Os dados ainda serão salvos, mas podem ser limpos pelo sistema se faltar espaço.");
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

  const delinquencyDescription = delinquencyLoading
    ? 'Atualizando inadimplência...'
    : delinquencyCustomers > 0
      ? `${delinquencyCustomers} cliente${delinquencyCustomers > 1 ? 's' : ''} em carteira com parcelas vencidas`
      : 'Nenhum cliente inadimplente na carteira';
  const delinquencyMeta = delinquencyLoading ? 'Atualizando' : `R$ ${formatCurrency(delinquencyTotal)}`;
  const inactiveCount = inactiveCustomersList.length;
  const inactiveDescription = inactiveLoading
    ? 'Atualizando carteira...'
    : inactiveCount > 0
      ? `${inactiveCount} cliente${inactiveCount > 1 ? 's' : ''} sem compra no mês`
      : 'Carteira ativa nos últimos 60 dias';
  const inactiveMeta = inactiveLoading ? 'Atualizando' : inactiveCount > 0 ? `${inactiveCount} cliente${inactiveCount > 1 ? 's' : ''}` : 'Em dia';

  const routineItems = [
    {
      id: 'delinquency',
      title: 'Inadimplência na carteira',
      description: delinquencyDescription,
      meta: delinquencyMeta,
      tone: 'danger' as const,
      icon: AlertTriangle,
      metaClassName: 'text-rose-600 dark:text-rose-400',
    },
    {
      id: 'pending',
      title: 'Pedidos pendentes de envio',
      description:
        pendingCount > 0
          ? `${pendingCount} pedido${pendingCount > 1 ? 's' : ''} aguardando sincronização`
          : 'Nenhum pedido aguardando envio',
      meta: pendingCount > 0 ? `${pendingCount} pendente${pendingCount > 1 ? 's' : ''}` : 'Tudo em dia',
      tone: pendingCount > 0 ? ('warning' as const) : ('success' as const),
      icon: UploadCloud,
      metaClassName: pendingCount > 0 ? 'text-orange-600' : 'text-emerald-600',
    },
    {
      id: 'inactive',
      title: 'Clientes sem compra há 60 dias',
      description: inactiveDescription,
      meta: inactiveMeta,
      tone: inactiveLoading ? ('neutral' as const) : inactiveCount > 0 ? ('neutral' as const) : ('success' as const),
      icon: User,
      metaClassName: inactiveLoading
        ? 'text-slate-400'
        : inactiveCount > 0
          ? 'text-slate-600 dark:text-slate-300'
          : 'text-emerald-600',
    },
  ];

  const syncButtons: { mode: ClientSyncViewMode; label: string }[] = [
    { mode: 'self', label: 'Minha carteira' },
    { mode: 'all', label: 'Todos os clientes' },
    { mode: 'recent', label: 'Clientes ativos 60 dias' }
  ];

  const toneStyles: Record<'danger' | 'warning' | 'success' | 'neutral', string> = {
    danger: 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
    warning: 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300',
    success: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
    neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200',
  };

  const menuItems = [
    { id: 'cart', label: 'Novo Pedido', icon: ShoppingCart, color: 'text-blue-700', badge: cartCount },
    { id: 'customers', label: 'Clientes', icon: User, color: 'text-blue-700' },
    { id: 'products', label: 'Produtos', icon: LayoutGrid, color: 'text-blue-700' },
    { id: 'orders', label: 'Histórico', icon: FileText, color: 'text-blue-700' }, 
    { id: 'sync', label: 'Sincronizar', icon: Download, color: 'text-purple-600' },
    { id: 'send', label: 'Enviar Dados', icon: UploadCloud, color: 'text-orange-600', badge: pendingCount },
    { id: 'settings', label: 'Configurações', icon: Settings, color: 'text-slate-600' },
  ];

  const sortedDelinquency = [...delinquencyItems].sort((a, b) => {
    const aDate = a.dueDate || a.dueDateReal || '';
    const bDate = b.dueDate || b.dueDateReal || '';
    return aDate.localeCompare(bDate);
  });

  return (
    <div className="p-4 pt-6 pb-20">
      <div className="max-w-md mx-auto space-y-4">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500">VENDAS HOJE</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">R$ {formatCurrency(todayTotal)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-rose-200 dark:border-rose-900/60">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-500 dark:bg-rose-500/10 dark:text-rose-300 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-rose-500">INADIMPLÊNCIA</p>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">R$ {delinquencyLoading ? '...' : formatCurrency(delinquencyTotal)}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total na sua carteira</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-900 text-white p-4 rounded-2xl shadow-sm border border-blue-800">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-100 uppercase">Meta Mensal</p>
            <Award className="w-4 h-4 text-orange-400" />
          </div>
          <div className="mt-3">
            <div className="w-full h-2 bg-blue-800/70 rounded-full">
              <div
                className="h-2 bg-orange-500 rounded-full"
                style={{ width: `${Math.min(100, (todayTotal / monthGoal) * 100).toFixed(0)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-blue-200 mt-2">
              <span>R$ 0</span>
              <span>R$ {monthGoal.toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>

        <TicketMedioCard data={averageTicketData} loading={ticketLoading} />
      </div>

      <div className="max-w-md mx-auto mt-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Rotina de eventos</h3>
          <span className="text-[10px] font-semibold text-slate-400 uppercase">Hoje</span>
        </div>
      <div className="mt-4 space-y-3">
        {routineItems.map((item) => {
            const isDelinquency = item.id === 'delinquency';
            const isInactive = item.id === 'inactive';
            const isClickable =
              (isDelinquency && delinquencyItems.length > 0 && !delinquencyLoading) ||
              (isInactive && inactiveCustomersList.length > 0 && !inactiveLoading);
            const handleClick = () => {
              if (!isClickable) return;
              if (isDelinquency) setShowDelinquencyModal(true);
              if (isInactive) setShowInactiveModal(true);
            };
            const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (!isClickable) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (isDelinquency) setShowDelinquencyModal(true);
                if (isInactive) setShowInactiveModal(true);
              }
            };
            return (
              <div
                key={item.id}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                className={`flex items-center justify-between gap-3 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-3 py-3 ${isClickable ? 'cursor-pointer hover:bg-white dark:hover:bg-slate-900' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneStyles[item.tone]}`}>
                    <item.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <p className={`text-sm font-bold ${item.metaClassName}`}>{item.meta}</p>
                  {isClickable && <ChevronRight className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* ALERTA DE BANCO DE DADOS (PERSISTÊNCIA) */}
      {!isStoragePersisted && !permissionRequested && (
          <div className="max-w-md mx-auto mt-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex gap-3">
                      <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-full h-fit">
                          <Database className="w-6 h-6 text-orange-600 dark:text-orange-200" />
                      </div>
                      <div>
                          <h3 className="font-bold text-slate-800 dark:text-white">Instalar Banco de Dados Local</h3>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                              Para garantir que seus clientes, produtos e pedidos não sejam apagados pelo Android para liberar espaço, precisamos autorizar o armazenamento persistente.
                          </p>
                      </div>
                  </div>
                  <button 
                      onClick={handleRequestPersistence}
                      className="whitespace-nowrap px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-sm transition-colors text-sm flex items-center gap-2"
                  >
                      <ShieldCheck className="w-4 h-4" />
                      Autorizar Banco Seguro
                  </button>
              </div>
          </div>
      )}

      {/* Database Status Banner */}
      <div className="max-w-md mx-auto mt-6 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
         <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2">
                     <LayoutGrid className="w-4 h-4 text-slate-400" />
                     <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {localCount !== null ? `${localCount} Produtos` : '...'}
                     </span>
                 </div>
                 <div className="h-4 w-px bg-slate-200 dark:bg-slate-700"></div>
                 <div className="flex items-center gap-2">
                     <User className="w-4 h-4 text-slate-400" />
                     <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {localCustomerCount !== null ? `${localCustomerCount} Clientes` : '...'}
                     </span>
                 </div>
             </div>
             
             <div className="flex items-center gap-3">
                 <div className="flex items-center gap-2">
                     <div className={`w-2.5 h-2.5 rounded-full ${(localCount || 0) > 0 ? 'bg-green-500' : 'bg-orange-400'}`}></div>
                     <span className="text-xs text-slate-500 dark:text-slate-400">{isStoragePersisted ? 'Offline Seguro' : 'Offline Temp'}</span>
                 </div>

                 {isLinkedDevice && (
                     <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold uppercase border border-green-200">
                        <Zap className="w-3 h-3 fill-green-700" />
                        Dispositivo Vinculado
                     </span>
                 )}
             </div>
         </div>
      </div>

      {/* Grid de Menu */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mt-6">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 flex flex-col items-center justify-center gap-4 aspect-square border border-slate-100 dark:border-slate-700 hover:shadow-md hover:bg-slate-50 dark:hover:bg-slate-700 transition-all relative group"
          >
            {item.badge ? (
              <div className="relative">
                <item.icon className={`w-12 h-12 ${item.color} group-hover:scale-110 transition-transform`} />
                {item.badge > 0 && (
                  <span className="absolute -top-2 -right-2 bg-orange-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800 shadow-sm animate-pulse">
                    {item.badge}
                  </span>
                )}
              </div>
            ) : (
              <item.icon className={`w-12 h-12 ${item.color} group-hover:scale-110 transition-transform`} />
            )}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Top Clientes */}
      {topCustomers.length > 0 && (
        <div className="max-w-4xl mx-auto mt-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
               <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2"><User className="w-4 h-4"/> Top Clientes</h3>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
               {topCustomers.map((c,idx)=> (
                  <li key={idx} className="py-2 flex justify-between text-sm">
                     <span>{idx+1}. {c.name}</span>
                     <span className="font-bold">R$ {c.total.toFixed(2)}</span>
                  </li>
               ))}
            </ul>
        </div>
      )}

      {showDelinquencyModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">Inadimplencia na carteira</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {delinquencyItems.length} titulo{delinquencyItems.length !== 1 ? 's' : ''} • R$ {formatCurrency(delinquencyTotal)}
                </p>
              </div>
              <button
                onClick={() => setShowDelinquencyModal(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-auto space-y-3">
              {delinquencyLoading ? (
                <p className="text-sm text-slate-500">Carregando inadimplencia...</p>
              ) : sortedDelinquency.length > 0 ? (
                sortedDelinquency.map((item) => {
                  const dueDate = formatDate(item.dueDate || item.dueDateReal);
                  return (
                    <div key={item.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/40">
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
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">Clientes sem compra há 60 dias</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {inactiveCustomersList.length} cliente{inactiveCustomersList.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setShowInactiveModal(false)}
                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="p-4 overflow-auto space-y-3">
              {inactiveLoading ? (
                <p className="text-sm text-slate-500">Carregando clientes...</p>
              ) : inactiveCustomersList.length > 0 ? (
                inactiveCustomersList.map(({ customer, lastSale }) => (
                  <div
                    key={customer.id}
                    className="border border-slate-100 dark:border-slate-700 rounded-xl p-3 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{customer.name}</p>
                      {customer.fantasyName && customer.fantasyName !== customer.name && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 truncate">{customer.fantasyName}</p>
                      )}
                      <p className="text-xs text-slate-500 dark:text-slate-400">{customer.document || 'Documento não informado'}</p>
                      {(customer.city || customer.state) && (
                        <p className="text-xs text-slate-400">
                          {customer.city || ''}{customer.state ? ` / ${customer.state}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] uppercase text-slate-400 font-semibold">Última compra</p>
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
