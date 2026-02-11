
import React, { useEffect, useState } from 'react';
import { dbService } from '../services/db';
import { apiService, API_ONLY_NOTICE, LogEntry } from '../services/api';
import { Order } from '../types';
import { UploadCloud, CheckCircle, AlertTriangle, Loader2, ArrowRight, Package, CheckSquare, Square, Trash2, Terminal, RefreshCw, XCircle, Download } from 'lucide-react';

export const SyncOrders: React.FC = () => {
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [status, setStatus] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [apiOnlyNotice, setApiOnlyNotice] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [receiveMessage, setReceiveMessage] = useState<string | null>(null);
  
  const [showDebugLogs, setShowDebugLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    try {
      const orders = await dbService.getPendingOrders();
      setPendingOrders(orders);
      // Seleciona todos por padrão para facilitar
      setSelectedIds(new Set(orders.map(o => o.id)));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refreshLogs = () => {
      setLogs([...apiService.getLogs()]);
  };

  const toggleSelection = (id: string) => {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) {
          newSelected.delete(id);
      } else {
          newSelected.add(id);
      }
      setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === pendingOrders.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(pendingOrders.map(o => o.id)));
      }
  };

  const handleDeleteSelected = async () => {
      if (selectedIds.size === 0) return;
      if (!window.confirm(`Tem certeza que deseja EXCLUIR ${selectedIds.size} pedidos do aparelho? Essa ação não pode ser desfeita.`)) return;

      setLoading(true);
      try {
          for (const id of selectedIds) {
              await dbService.deleteOrder(id);
          }
          await loadPending();
          setSelectedIds(new Set());
      } catch (e) {
          alert('Erro ao excluir pedidos.');
      } finally {
          setLoading(false);
      }
  };

  const handleReceiveRemoteOrders = async () => {
    if (receiving) return;
    setReceiving(true);
    setReceiveMessage(null);
    try {
      const remoteOrders = await apiService.getOrderHistory();
      if (remoteOrders.length === 0) {
        setReceiveMessage('Nenhum pedido remoto disponível no momento.');
      } else {
        await dbService.bulkPutOrders(remoteOrders);
        setReceiveMessage(`Sincronizados ${remoteOrders.length} pedido${remoteOrders.length > 1 ? 's' : ''} do servidor.`);
      }
    } catch (error: any) {
      setReceiveMessage(error?.message || 'Erro ao baixar pedidos.');
    } finally {
      setReceiving(false);
      loadPending();
    }
  };

  const handleSendSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setApiOnlyNotice(null);
    
    // Limpa logs anteriores
    apiService.clearLogs();
    refreshLogs();

    setSyncing(true);
    setStatus(null);
    const ordersToSend = pendingOrders.filter(o => selectedIds.has(o.id));
    setProgress({ current: 0, total: ordersToSend.length });

    let successCount = 0;
    let failCount = 0;
    const errorMessages: string[] = [];
    let apiOnlyMessage: string | null = null;

    for (let i = 0; i < ordersToSend.length; i++) {
      const order = ordersToSend[i];
      setProgress(prev => ({ ...prev, current: i + 1 }));

      try {
        const result = await apiService.submitOrder(order);
        if (result.success) {
          successCount++;
          order.status = 'synced';
          await dbService.saveOrder(order);
        } else {
          failCount++;
          const msg = `Pedido #${order.displayId}: ${result.message || 'Erro desconhecido'}`;
          if (!errorMessages.includes(msg)) errorMessages.push(msg);
          if (result.requiresApiOnly && !apiOnlyMessage) {
              apiOnlyMessage = result.message || API_ONLY_NOTICE;
          }
        }
      } catch (e: any) {
        failCount++;
        errorMessages.push(`Pedido #${order.displayId}: ${e.message}`);
      }
      // Atualiza logs a cada passo
      refreshLogs();
    }

    setSyncing(false);
    setApiOnlyNotice(apiOnlyMessage);
    setStatus({ success: successCount, failed: failCount, errors: errorMessages });
    
    // Se houve falha, mostra os logs automaticamente
    if (failCount > 0) {
        setShowDebugLogs(true);
    }
    
    loadPending(); 
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;

  return (
    <div className="p-4 max-w-2xl mx-auto pb-20">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800 dark:text-white">
        <UploadCloud className="w-6 h-6 text-blue-800 dark:text-blue-400" /> Enviar Dados Pendentes
      </h2>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 text-blue-900 px-4 py-3 text-sm">
          <p className="font-semibold">Envio via FastAPI obrigatório</p>
          <p className="text-xs text-blue-700/80">
             Pedidos pendentes só podem ser sincronizados com o backend FastAPI. Use o menu <strong>Enviar Dados</strong> ou faça POST em <strong>/api/pedidos</strong>.
          </p>
      </div>

      {status && (
        <div className={`mb-6 p-4 rounded-lg border ${status.failed === 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-orange-50 border-orange-200 text-orange-700'} animate-in slide-in-from-top-2`}>
            <p className="font-bold flex items-center gap-2">
               {status.failed === 0 ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
               Resultado do Envio:
            </p>
            <ul className="list-disc pl-8 mt-2 text-sm mb-2">
               <li>Enviados com sucesso: {status.success}</li>
               {status.failed > 0 && <li>Falha ao enviar: {status.failed}</li>}
            </ul>
            
            {/* Lista detalhada de erros */}
            {status.errors.length > 0 && (
                <div className="mt-3 pt-3 border-t border-orange-200/50">
                    <p className="text-xs font-bold uppercase mb-1">Detalhes dos Erros:</p>
                    <ul className="text-xs space-y-1 font-mono bg-white/50 p-2 rounded">
                        {status.errors.map((err, idx) => (
                            <li key={idx} className="text-red-600 break-words">• {err}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
      )}

      {receiveMessage && (
        <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-700 dark:text-slate-200">
          {receiveMessage}
        </div>
      )}

      {apiOnlyNotice && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
              {apiOnlyNotice}
          </div>
      )}

      {/* Painel de Logs Opcional */}
      <div className="mb-4">
          <button 
             onClick={() => {
                 setShowDebugLogs(!showDebugLogs);
                 refreshLogs();
             }}
             className="text-xs font-mono text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-2"
          >
             <Terminal className="w-3 h-3" />
             {showDebugLogs ? 'Ocultar Logs de Depuração' : 'Mostrar Logs de Depuração'}
          </button>
          
          {showDebugLogs && (
              <div className="bg-slate-950 text-slate-300 p-3 rounded-lg border border-slate-800 font-mono text-[10px] overflow-hidden">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-2">
                      <span>Log do Sistema</span>
                      <button onClick={refreshLogs}><RefreshCw className="w-3 h-3" /></button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                      {logs.length === 0 && <span className="italic opacity-50">Nenhum log registrado.</span>}
                      {logs.map((log, idx) => (
                          <div key={idx} className={`break-all ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : ''}`}>
                              <span className="opacity-50 mr-2">[{log.timestamp}]</span>
                              {log.message}
                          </div>
                      ))}
                  </div>
              </div>
          )}
      </div>

      {pendingOrders.length === 0 ? (
         <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
             <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4 opacity-50" />
             <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Tudo Sincronizado!</h3>
             <p className="text-slate-500 dark:text-slate-400">Não há pedidos pendentes de envio no momento.</p>
         </div>
      ) : (
         <>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-6">
               <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <button 
                     onClick={toggleSelectAll}
                     className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                     {selectedIds.size === pendingOrders.length ? (
                         <CheckSquare className="w-5 h-5 text-blue-600" />
                     ) : (
                         <Square className="w-5 h-5 text-slate-400" />
                     )}
                     {selectedIds.size === pendingOrders.length ? "Desmarcar Todos" : "Selecionar Todos"}
                  </button>
                  <span className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 text-xs font-bold px-2 py-1 rounded-full">{pendingOrders.length} Pendentes</span>
               </div>
               
               <div className="divide-y divide-slate-100 dark:divide-slate-700 max-h-96 overflow-y-auto">
                  {pendingOrders.map(order => {
                     const isSelected = selectedIds.has(order.id);
                     return (
                         <div 
                             key={order.id} 
                             onClick={() => toggleSelection(order.id)}
                             className={`p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                         >
                            <div className="shrink-0">
                                {isSelected ? (
                                    <CheckSquare className="w-6 h-6 text-blue-600 fill-blue-50 dark:fill-blue-900" />
                                ) : (
                                    <Square className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                                )}
                            </div>
                            <div className="flex-1">
                               <p className="font-bold text-slate-800 dark:text-white">#{order.displayId} - {order.customerName}</p>
                               <p className="text-xs text-slate-500 flex items-center gap-2">
                                  <Package className="w-3 h-3" /> {order.items.length} itens
                                  <span>•</span>
                                  {new Date(order.createdAt).toLocaleDateString()}
                               </p>
                            </div>
                            <div className="text-right font-mono font-medium text-slate-600 dark:text-slate-400">
                               R$ {order.total.toFixed(2)}
                            </div>
                         </div>
                     );
                  })}
               </div>
               
               <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <div className="text-sm text-slate-500">
                     {selectedIds.size} selecionados
                  </div>
                  <div>
                      <span className="text-sm text-slate-500 mr-2">Total Sel.:</span>
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                   R$ {pendingOrders.filter(o => selectedIds.has(o.id)).reduce((acc, o) => acc + o.total, 0).toFixed(2)}
                </span>
             </div>
          </div>
       </div>

       <div className="flex flex-col gap-3">
            <button
               onClick={handleReceiveRemoteOrders}
               disabled={receiving || syncing}
               className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
            >
               {receiving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
               <span>{receiving ? 'Recebendo pedidos...' : 'Receber pedidos remotos'}</span>
            </button>

           <button
              onClick={handleSendSelected}
              disabled={syncing || selectedIds.size === 0}
                   className="w-full relative overflow-hidden py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                   {syncing && (
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-orange-700/50 transition-all duration-300 ease-linear"
                        style={{ width: progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%' }}
                      ></div>
                   )}
                   
                   <span className="relative z-10 flex items-center gap-2">
                       {syncing ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
                       {syncing 
                            ? `Enviando ${progress.current} de ${progress.total}...` 
                            : `Enviar ${selectedIds.size} Selecionados`
                       }
                       {!syncing && <ArrowRight className="w-5 h-5 opacity-50" />}
                   </span>
                </button>

                {selectedIds.size > 0 && !syncing && (
                    <button
                        onClick={handleDeleteSelected}
                        className="w-full py-3 bg-white dark:bg-slate-800 text-red-500 border border-red-200 dark:border-red-900/50 font-bold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center gap-2"
                    >
                        <Trash2 className="w-5 h-5" />
                        Excluir {selectedIds.size} Pedidos (Cancelar)
                    </button>
                )}
            </div>
         </>
      )}
    </div>
  );
};
