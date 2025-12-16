
import React, { useState } from 'react';
import { apiService } from '../services/api';
import { DownloadCloud, RefreshCw, Package, Users, CheckCircle, AlertCircle, ArrowLeft, Database } from 'lucide-react';

interface SyncDataProps {
  onBack: () => void;
}

export const SyncData: React.FC<SyncDataProps> = ({ onBack }) => {
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncStep, setSyncStep] = useState<'products' | 'customers' | 'none'>('none');
  const [syncTarget, setSyncTarget] = useState<'all' | 'products' | 'customers'>('all');
  
  const [syncedCount, setSyncedCount] = useState(0);
  const [syncedCustomerCount, setSyncedCustomerCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSync = async (target: 'all' | 'products' | 'customers') => {
    if (syncState === 'syncing') return;
    
    setSyncTarget(target);
    setSyncState('syncing');
    setErrorMessage('');
    setSyncedCount(0);
    setSyncedCustomerCount(0);

    let hasError = false;
    let errorMsg = '';

    // 1. Sync Produtos
    if (target === 'all' || target === 'products') {
        setSyncStep('products');
        const prodResult = await apiService.syncFullCatalog((current) => {
            setSyncedCount(current);
        });

        if (!prodResult.success) {
            hasError = true;
            errorMsg = prodResult.message || 'Erro ao baixar produtos';
        }
    }

    // 2. Sync Clientes
    if (!hasError && (target === 'all' || target === 'customers')) {
        setSyncStep('customers');
        const custResult = await apiService.syncCustomers((current) => {
            setSyncedCustomerCount(current);
        });

        if (!custResult.success) {
            hasError = true;
            errorMsg = custResult.message || 'Erro ao baixar clientes';
        }
    }

    if (hasError) {
        setSyncState('error');
        setErrorMessage(errorMsg);
        setSyncStep('none');
    } else {
        setSyncState('success');
        setSyncStep('none');
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto pb-20">
       <div className="flex items-center gap-3 mb-6">
           <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
               <ArrowLeft className="w-6 h-6 text-slate-600 dark:text-slate-300" />
           </button>
           <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
             <DownloadCloud className="w-6 h-6 text-purple-600" /> Sincronização de Dados
           </h2>
       </div>

       <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 mb-6">
           <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
               Atualize seu banco de dados local com as informações mais recentes do servidor. Isso permite que você trabalhe offline com dados atualizados.
           </p>

           <div className="grid gap-4">
               {/* Opção Produtos */}
               <button 
                  onClick={() => handleSync('products')}
                  disabled={syncState === 'syncing'}
                  className="flex items-center p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all active:scale-[0.99] disabled:opacity-50"
               >
                   <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full mr-4">
                       <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                   </div>
                   <div className="text-left flex-1">
                       <h3 className="font-bold text-slate-800 dark:text-white">Atualizar Produtos</h3>
                       <p className="text-xs text-slate-500">Baixa catálogo completo, preços e estoque.</p>
                   </div>
                   {syncState === 'syncing' && (syncTarget === 'products' || (syncTarget === 'all' && syncStep === 'products')) && (
                       <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                   )}
               </button>

               {/* Opção Clientes */}
               <button 
                  onClick={() => handleSync('customers')}
                  disabled={syncState === 'syncing'}
                  className="flex items-center p-4 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all active:scale-[0.99] disabled:opacity-50"
               >
                   <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full mr-4">
                       <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                   </div>
                   <div className="text-left flex-1">
                       <h3 className="font-bold text-slate-800 dark:text-white">Atualizar Clientes</h3>
                       <p className="text-xs text-slate-500">Baixa carteira de clientes e histórico financeiro.</p>
                   </div>
                   {syncState === 'syncing' && (syncTarget === 'customers' || (syncTarget === 'all' && syncStep === 'customers')) && (
                       <RefreshCw className="w-5 h-5 animate-spin text-green-600" />
                   )}
               </button>

               {/* Opção Tudo */}
               <button 
                  onClick={() => handleSync('all')}
                  disabled={syncState === 'syncing'}
                  className="flex items-center p-4 bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-all active:scale-[0.99] disabled:opacity-50"
               >
                   <div className="bg-purple-100 dark:bg-purple-900/30 p-3 rounded-full mr-4">
                       <Database className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                   </div>
                   <div className="text-left flex-1">
                       <h3 className="font-bold text-purple-900 dark:text-purple-100">Sincronizar Tudo</h3>
                       <p className="text-xs text-purple-700 dark:text-purple-300">Atualiza base completa (Produtos + Clientes).</p>
                   </div>
                   {syncState === 'syncing' && syncTarget === 'all' && (
                       <RefreshCw className="w-5 h-5 animate-spin text-purple-600" />
                   )}
               </button>
           </div>
       </div>

       {/* Feedback Overlay / Status Area */}
       {syncState !== 'idle' && (
           <div className={`p-4 rounded-lg border animate-in slide-in-from-bottom-2 ${
               syncState === 'error' ? 'bg-red-50 border-red-200 text-red-800' :
               syncState === 'success' ? 'bg-green-50 border-green-200 text-green-800' :
               'bg-blue-50 border-blue-200 text-blue-800'
           }`}>
               <div className="flex items-center gap-3 mb-2">
                   {syncState === 'syncing' ? <RefreshCw className="w-5 h-5 animate-spin" /> :
                    syncState === 'success' ? <CheckCircle className="w-5 h-5" /> :
                    <AlertCircle className="w-5 h-5" />}
                   
                   <span className="font-bold">
                       {syncState === 'syncing' ? 'Sincronizando...' : 
                        syncState === 'success' ? 'Sincronização Concluída!' : 
                        'Erro na Sincronização'}
                   </span>
               </div>
               
               <div className="text-sm space-y-1 ml-8">
                   {(syncTarget === 'products' || syncTarget === 'all') && (
                       <div className="flex justify-between w-full max-w-xs">
                           <span>Produtos:</span>
                           <span className="font-mono">{syncedCount} itens</span>
                       </div>
                   )}
                   {(syncTarget === 'customers' || syncTarget === 'all') && (
                       <div className="flex justify-between w-full max-w-xs">
                           <span>Clientes:</span>
                           <span className="font-mono">{syncedCustomerCount} itens</span>
                       </div>
                   )}
                   
                   {errorMessage && (
                       <div className="mt-2 text-red-600 text-xs bg-white/50 p-2 rounded">
                           {errorMessage}
                       </div>
                   )}
                   
                   {syncState === 'success' && (
                       <button onClick={() => setSyncState('idle')} className="text-xs underline mt-2 text-green-700 hover:text-green-900">
                           Fechar status
                       </button>
                   )}
               </div>
           </div>
       )}
    </div>
  );
};
