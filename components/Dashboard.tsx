
import React, { useState, useEffect } from 'react';
import { User, ShoppingCart, LayoutGrid, Download, UploadCloud, Settings, ShieldCheck, Zap, FileText, Database, BarChart2, Award, Star } from 'lucide-react';
import { apiService } from '../services/api';
import { dbService } from '../services/db';

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
  const [ticket, setTicket] = useState<number>(0);
  const [topCustomers, setTopCustomers] = useState<{name:string,total:number}[]>([]);

  useEffect(() => {
     (async () => {
        const all = await dbService.getOrders();
        const today = new Date().toDateString();
        const todayOrders = all.filter(o => new Date(o.createdAt).toDateString() === today);
        const todaySum = todayOrders.reduce((s,o)=> s + o.total, 0);
        setTodayTotal(todaySum);
        setTicket(todayOrders.length > 0 ? todaySum / todayOrders.length : 0);
        
        // Top clientes simples pelos pedidos salvos
        const map: Record<string, number> = {};
        all.forEach(o => {
           const key = o.customerName || 'Cliente';
           map[key] = (map[key] || 0) + o.total;
        });
        const tops = Object.entries(map).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total).slice(0,5);
        setTopCustomers(tops);
     })();
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

  const menuItems = [
    { id: 'cart', label: 'Novo Pedido', icon: ShoppingCart, color: 'text-blue-700', badge: cartCount },
    { id: 'customers', label: 'Clientes', icon: User, color: 'text-blue-700' },
    { id: 'products', label: 'Produtos', icon: LayoutGrid, color: 'text-blue-700' },
    { id: 'orders', label: 'Histórico', icon: FileText, color: 'text-blue-700' }, 
    { id: 'sync', label: 'Sincronizar', icon: Download, color: 'text-purple-600' },
    { id: 'send', label: 'Enviar Dados', icon: UploadCloud, color: 'text-orange-600', badge: pendingCount },
    { id: 'settings', label: 'Configurações', icon: Settings, color: 'text-slate-600' },
  ];

  return (
    <div className="p-4 pt-8 pb-20">
      {/* KPIs de Vendas */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
         <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Vendido Hoje</span>
                <BarChart2 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-900 dark:text-blue-300">R$ {todayTotal.toFixed(2)}</div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Meta Mensal</span>
                <Award className="w-4 h-4 text-orange-600" />
            </div>
            <div className="mt-2">
               <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded">
                  <div className="h-3 bg-orange-500 rounded" style={{width: `${Math.min(100, (todayTotal/ monthGoal)*100).toFixed(0)}%`}} />
               </div>
               <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>R$ 0</span>
                  <span>R$ {monthGoal.toLocaleString('pt-BR')}</span>
               </div>
            </div>
         </div>
         <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Ticket Médio (Hoje)</span>
                <Star className="w-4 h-4 text-yellow-500" />
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-900 dark:text-blue-300">R$ {ticket.toFixed(2)}</div>
         </div>
      </div>
      
      {/* ALERTA DE BANCO DE DADOS (PERSISTÊNCIA) */}
      {!isStoragePersisted && !permissionRequested && (
          <div className="max-w-4xl mx-auto mb-6 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 shadow-sm animate-in slide-in-from-top-2">
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
      <div className="max-w-4xl mx-auto mb-6 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
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
    </div>
  );
};
