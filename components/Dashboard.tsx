
import React, { useState, useEffect } from 'react';
import { User, ShoppingCart, LayoutGrid, CloudDownload, UploadCloud, Settings, ShieldCheck, Zap, FileText, Database } from 'lucide-react';
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
    { id: 'sync', label: 'Sincronizar', icon: CloudDownload, color: 'text-purple-600' },
    { id: 'send', label: 'Enviar Dados', icon: UploadCloud, color: 'text-orange-600', badge: pendingCount },
    { id: 'settings', label: 'Configurações', icon: Settings, color: 'text-slate-600' },
  ];

  return (
    <div className="p-4 pt-8 pb-20">
      
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
    </div>
  );
};
