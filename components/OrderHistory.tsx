
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/db';
import { apiService } from '../services/api';
import { Order } from '../types';
import { FileText, Printer, ChevronDown, ChevronUp, Calendar, User, Check, Clock, Package, RefreshCw, Filter, AlertCircle, CheckCircle2, UploadCloud, Trash2, Square, CheckSquare, X, Loader2, Download, Store, Copy, Share2 } from 'lucide-react';

interface OrderHistoryProps {
    onNavigate?: (view: string) => void;
    initialTab?: 'all' | 'pending' | 'synced';
}

export const OrderHistory: React.FC<OrderHistoryProps> = ({ onNavigate, initialTab = 'all' }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'synced' | 'flow'>(initialTab);
  
  // Estado para o Modal de Recibo
  const [viewingReceipt, setViewingReceipt] = useState<Order | null>(null);
  const [headerStore, setHeaderStore] = useState<any | null>(null);

  // Estados para seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const [duplicating, setDuplicating] = useState<string | null>(null);

  useEffect(() => {
    loadOrders();
    // Se não estiver na aba pendente, tenta sincronizar histórico remoto
    if (activeTab !== 'pending') {
        syncRemoteHistory();
    }
    // Carrega dados da loja para o cabeçalho do recibo
    // Usa o servidor local (Node) com Master Key para evitar 401/404 quando estiver em produção com backendUrl
    apiService.fetchLocal('/api/store').then(async (res) => {
        if (res.ok) {
            const data = await res.json();
            setHeaderStore(data);
        }
    }).catch(()=>{});
  }, []);

  // Limpa seleção ao trocar de aba
  useEffect(() => {
      setSelectedIds(new Set());
      setExpandedOrder(null);
  }, [activeTab]);

  const loadOrders = async () => {
    try {
      const data = await dbService.getOrders();
      setOrders(data);
    } catch (error) {
      console.error("Erro ao carregar histórico local", error);
    } finally {
      setLoading(false);
    }
  };

  const syncRemoteHistory = async () => {
      // Não bloqueia UI com loading, faz em background
      try {
          const remoteOrders = await apiService.getOrderHistory();
          if (remoteOrders.length > 0) {
              await dbService.bulkPutOrders(remoteOrders);
              const updatedLocal = await dbService.getOrders();
              setOrders(updatedLocal);
          }
      } catch (e) {
          console.error("Falha ao sincronizar histórico remoto", e);
      }
  };

  // Duplicar pedido -> enviar itens para o carrinho para edição
  const duplicateOrder = async (order: Order) => {
      try {
          setDuplicating(order.id);
          // Salva um rascunho no localStorage que o App lerá ao abrir o carrinho
          localStorage.setItem('cartDraft', JSON.stringify(order.items || []));
          if (onNavigate) onNavigate('cart');
      } catch (e) {
          alert('Não foi possível enviar os itens para o carrinho.');
      } finally {
          setDuplicating(null);
      }
  };

  // --- Lógica de Seleção ---
  const toggleSelection = (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) {
          newSelected.delete(id);
      } else {
          newSelected.add(id);
      }
      setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
      const filtered = orders.filter(o => o.status === 'pending'); // Só seleciona pendentes para ação em massa
      if (selectedIds.size === filtered.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filtered.map(o => o.id)));
      }
  };

  // --- Ações em Massa ---
  const handleBulkDelete = async () => {
      if (selectedIds.size === 0) return;
      if (!window.confirm(`Deseja excluir ${selectedIds.size} pedidos do histórico local?`)) return;

      setLoading(true);
      try {
          for (const id of selectedIds) {
              await dbService.deleteOrder(id);
          }
          await loadOrders();
          setSelectedIds(new Set());
      } catch (e) {
          alert('Erro ao excluir pedidos.');
      } finally {
          setLoading(false);
      }
  };

  const handleBulkSend = async () => {
      if (selectedIds.size === 0) return;
      
      setSyncing(true);
      const ordersToSend = orders.filter(o => selectedIds.has(o.id));
      setSyncProgress({ current: 0, total: ordersToSend.length });

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < ordersToSend.length; i++) {
          const order = ordersToSend[i];
          setSyncProgress(prev => ({ ...prev, current: i + 1 }));
          
          try {
              const result = await apiService.submitOrder(order);
              if (result.success) {
                  order.status = 'synced';
                  await dbService.saveOrder(order);
                  successCount++;
              } else {
                  errorCount++;
              }
          } catch (e) {
              errorCount++;
          }
      }

      setSyncing(false);
      
      if (errorCount > 0) {
          alert(`${successCount} enviados com sucesso. ${errorCount} falharam.`);
      } else {
         // Se tudo deu certo, limpa seleção
         setSelectedIds(new Set());
      }
      
      loadOrders(); // Recarrega para atualizar status visual
  };

  const handleOpenReceipt = (order: Order) => {
      setViewingReceipt(order);
  };

  const handlePrint = () => {
      window.print();
  };

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'all') return true;
    return order.status === activeTab;
  });

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const syncedCount = orders.filter(o => o.status === 'synced').length;
  const preVendaCount = orders.filter(o => o.businessStatus === 'pre_venda').length;

  // --- RENDER ---
  
  if (loading) return <div className="p-8 text-center text-slate-500"><RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600"/>Carregando...</div>;

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto relative min-h-full">
      {/* Estilos de Impressão (Só aplica quando CTRL+P é acionado) */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #receipt-modal, #receipt-modal * {
            visibility: visible;
          }
          #receipt-modal {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            background: white;
            color: black;
            z-index: 9999;
            padding: 0;
            margin: 0;
            overflow: visible;
          }
          .no-print {
            display: none !important;
          }
          /* Garante fundo branco e texto preto */
          .print-content {
             background-color: white !important;
             color: black !important;
             border: none !important;
             box-shadow: none !important;
          }
        }
      `}</style>

      {/* --- MODAL DE RECIBO (VISUALIZAÇÃO) --- */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div id="receipt-modal" className="bg-white w-full max-w-md rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header de Ações (Não Imprime) */}
                <div className="bg-slate-900 p-4 flex justify-between items-center no-print shrink-0">
                    <h3 className="text-white font-bold flex items-center gap-2">
                        <Printer className="w-5 h-5" /> Visualizar Recibo
                    </h3>
                    <button onClick={() => setViewingReceipt(null)} className="text-white/70 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Conteúdo do Recibo (Imprimível) */}
                <div className="p-8 bg-white text-slate-900 print-content overflow-y-auto flex-1">
                    <div className="border-b-2 border-slate-800 pb-4 mb-4">
                        <h1 className="text-2xl font-bold uppercase tracking-wide">{headerStore?.trade_name || 'SalesForce Pro'}</h1>
                        <p className="text-sm text-slate-600">{headerStore?.legal_name}</p>
                        {headerStore?.document && (
                          <p className="text-xs text-slate-500">CNPJ/CPF: {headerStore.document}</p>
                        )}
                        {(headerStore?.street || headerStore?.city) && (
                          <p className="text-xs text-slate-500">
                            {headerStore?.street || ''} {headerStore?.number || ''} {headerStore?.neighborhood ? `- ${headerStore.neighborhood}` : ''} {headerStore?.city ? `• ${headerStore.city}/${headerStore.state || ''}` : ''} {headerStore?.zip ? `• ${headerStore.zip}` : ''}
                          </p>
                        )}
                        {headerStore?.phone && (
                          <p className="text-xs text-slate-500">Fone: {headerStore.phone}</p>
                        )}
                        <p className="text-sm text-slate-500 mt-2">Comprovante de Pedido</p>
                    </div>

                    <div className="flex justify-between items-end mb-6">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold">Pedido</p>
                            <p className="text-xl font-mono font-bold">#{viewingReceipt.displayId}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500 uppercase font-bold">Data</p>
                            <p className="font-medium">{new Date(viewingReceipt.createdAt).toLocaleDateString()}</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-3 rounded mb-6">
                        <p className="text-xs text-slate-500 uppercase font-bold mb-1">Cliente</p>
                        <p className="font-bold text-lg leading-tight">{viewingReceipt.customerName}</p>
                        <p className="text-sm text-slate-600 font-mono mt-1">Doc: {viewingReceipt.customerDoc || 'N/A'}</p>
                        {(viewingReceipt.sellerName || viewingReceipt.sellerId) && (
                          <p className="text-xs text-slate-500 mt-2">
                            Vendedor: {viewingReceipt.sellerName || '—'} {viewingReceipt.sellerId ? `(${viewingReceipt.sellerId})` : ''}
                          </p>
                        )}
                        {viewingReceipt.notes && (
                          <p className="text-xs text-slate-500 mt-2">Obs: {viewingReceipt.notes}</p>
                        )}
                    </div>

                    <table className="w-full text-sm mb-6">
                        <thead>
                            <tr className="border-b border-slate-300">
                                <th className="text-left py-2 font-bold text-slate-600">Qtd x Unit.</th>
                                <th className="text-left py-2 font-bold text-slate-600">Item</th>
                                <th className="text-right py-2 font-bold text-slate-600">Total</th>
                            </tr>
                        </thead>
                        <tbody className="font-mono text-slate-700">
                            {viewingReceipt.items.map((item, idx) => (
                                <tr key={idx} className="border-b border-slate-100">
                                    <td className="py-2 align-top w-40">
                                        {item.quantity} {item.unit} x R$ {item.price.toFixed(2)}
                                    </td>
                                    <td className="py-2 align-top">
                                        <div className="font-bold text-slate-900">{item.name}</div>
                                        <div className="text-[10px] text-slate-500">{item.id}</div>
                                    </td>
                                    <td className="py-2 align-top text-right font-bold">
                                        R$ {(item.quantity * item.price).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="flex justify-between items-center border-t-2 border-slate-800 pt-4 mb-8">
                        <span className="text-lg font-bold uppercase">Total Geral</span>
                        <span className="text-2xl font-bold">R$ {viewingReceipt.total.toFixed(2)}</span>
                    </div>

                    <div className="text-center text-xs text-slate-400 mt-auto pt-8 border-t border-dashed border-slate-300">
                        <p>Emitido via SalesForce App</p>
                        <p>{new Date().toLocaleString()}</p>
                    </div>
                </div>

                {/* Footer de Ações (Não Imprime) */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 no-print shrink-0 flex gap-3">
                    <button 
                        onClick={() => setViewingReceipt(null)}
                        className="flex-1 py-3 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        Fechar
                    </button>
                    <button 
                        onClick={handlePrint}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md flex items-center justify-center gap-2 transition-colors"
                    >
                        <Printer className="w-5 h-5" />
                        Imprimir / PDF
                    </button>
                    <button
                        onClick={async () => {
                          try {
                            // monta payload igual ao que o backend espera
                            const payload = {
                              id: viewingReceipt.id,
                              displayId: viewingReceipt.displayId,
                              customer: viewingReceipt.customerName,
                              sellerName: viewingReceipt.sellerName,
                              sellerId: viewingReceipt.sellerId,
                              notes: viewingReceipt.notes,
                              items: viewingReceipt.items,
                              total: viewingReceipt.total,
                              store: headerStore
                            };
                            // força no host local para evitar CORS/traefik e usar Master Key
                            const res = await apiService.fetchLocal('/api/recibo/pdf', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify(payload)
                            });
                            if (!res.ok) throw new Error('Falha ao gerar PDF');
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `pedido-${viewingReceipt.displayId}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            setTimeout(() => {
                              URL.revokeObjectURL(url);
                              a.remove();
                            }, 1000);
                          } catch {
                            alert('Não foi possível gerar o PDF agora.');
                          }
                        }}
                        className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 shadow-md flex items-center justify-center gap-2 transition-colors"
                    >
                        <Download className="w-5 h-5" />
                        Baixar PDF
                    </button>
                    
                </div>
            </div>
        </div>
      )}


      <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" /> Histórico de Pedidos
          </h2>
          {activeTab === 'pending' && filteredOrders.length > 0 && (
             <button 
                onClick={toggleSelectAll}
                className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline"
             >
                {selectedIds.size === filteredOrders.length ? "Desmarcar Todos" : "Selecionar Todos"}
             </button>
          )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          <button onClick={() => setActiveTab('all')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'all' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-sm' : 'text-slate-500'}`}>
             Todos ({orders.length})
          </button>
          <button onClick={() => setActiveTab('pending')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-1 ${activeTab === 'pending' ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-slate-500'}`}>
             Pendentes 
             {pendingCount > 0 && <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 rounded-full">{pendingCount}</span>}
          </button>
          <button onClick={() => setActiveTab('synced')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'synced' ? 'bg-white dark:bg-slate-700 text-green-600 dark:text-green-400 shadow-sm' : 'text-slate-500'}`}>
             Enviados ({syncedCount})
          </button>
          <button onClick={() => setActiveTab('flow')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'flow' ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500'}`}>
             Fluxo ({preVendaCount})
          </button>
      </div>

      {activeTab === 'flow' ? (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
           <h3 className="font-bold mb-3 text-slate-800 dark:text-white">Ações de Fluxo</h3>
           <p className="text-sm mb-3 text-slate-600 dark:text-slate-300">Selecione um pedido enviado e altere a etapa do processo.</p>
           {orders.filter(o => o.businessStatus && o.businessStatus !== 'entregue' && o.businessStatus !== 'cancelado').slice(0,10).map(order => (
             <div key={order.id} className="flex items-center justify-between border-t py-2 first:border-t-0">
               <div>
                 <div className="font-semibold">#{order.displayId} • {order.customerName}</div>
                 <div className="text-xs text-slate-500">Etapa: {order.businessStatus || 'orcamento'}</div>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => apiService.updateOrderBusinessStatus(order,'pre_venda').then(loadOrders)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">Pré‑venda</button>
                 <button onClick={() => apiService.updateOrderBusinessStatus(order,'separacao').then(loadOrders)} className="px-2 py-1 text-xs bg-amber-600 text-white rounded">Separação</button>
                 <button onClick={() => apiService.updateOrderBusinessStatus(order,'faturado').then(loadOrders)} className="px-2 py-1 text-xs bg-green-700 text-white rounded">Faturado</button>
                 <button onClick={() => apiService.updateOrderBusinessStatus(order,'entregue').then(loadOrders)} className="px-2 py-1 text-xs bg-emerald-600 text-white rounded">Entregue</button>
                 <button onClick={() => apiService.updateOrderBusinessStatus(order,'cancelado').then(loadOrders)} className="px-2 py-1 text-xs bg-red-600 text-white rounded">Cancelar</button>
               </div>
             </div>
           ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-12 rounded-lg text-center shadow-sm border border-slate-100 dark:border-slate-700">
            <Filter className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500">Nenhum pedido encontrado nesta categoria.</p>
        </div>
      ) : (
        <div className="space-y-3">
            {filteredOrders.map(order => {
                const isSelected = selectedIds.has(order.id);
                // Só mostra checkbox se estiver na aba pendente E o pedido for pendente (redundância de segurança)
                const showCheckbox = activeTab === 'pending' && order.status === 'pending';

                return (
                <div 
                    key={order.id} 
                    onClick={() => {
                        if (showCheckbox) toggleSelection(order.id);
                        else setExpandedOrder(expandedOrder === order.id ? null : order.id);
                    }}
                    className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border overflow-hidden transition-all cursor-pointer ${isSelected ? 'border-blue-400 bg-blue-50/30 dark:border-blue-700 dark:bg-blue-900/10' : 'border-slate-200 dark:border-slate-700'}`}
                >
                    {/* Header do Card */}
                    <div className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <div className="flex items-center gap-3">
                            {/* Checkbox Area */}
                            {showCheckbox && (
                                <div className="mr-1">
                                    {isSelected ? (
                                        <CheckSquare className="w-6 h-6 text-blue-600 fill-blue-50 dark:fill-blue-900" />
                                    ) : (
                                        <Square className="w-6 h-6 text-slate-300 hover:text-slate-400" />
                                    )}
                                </div>
                            )}

                            {/* Status Icon */}
                            {!showCheckbox && (
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${order.status === 'synced' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'}`}>
                                    {order.status === 'synced' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                                </div>
                            )}

                            <div>
                                <h3 className="font-bold text-slate-800 dark:text-white text-sm">
                                    #{order.displayId} - {order.customerName}
                                </h3>
                                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(order.createdAt).toLocaleDateString()}</span>
                                    <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {order.items.length} itens</span>
                                </div>
                                {(order.sellerName || order.sellerId) && (
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                        Vendedor: {order.sellerName || '—'} {order.sellerId ? `(${order.sellerId})` : ''}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="font-bold text-blue-600 dark:text-blue-400">R$ {order.total.toFixed(2)}</div>
                             {!showCheckbox && (
                                expandedOrder === order.id ? <ChevronUp className="w-4 h-4 ml-auto text-slate-400 mt-1" /> : <ChevronDown className="w-4 h-4 ml-auto text-slate-400 mt-1" />
                             )}
                        </div>
                    </div>

                    {/* Detalhes Expandidos (ou visíveis se selecionado não estiver ativo/modo seleção) */}
                    {(expandedOrder === order.id || (showCheckbox && isSelected)) && (
                        <div className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 p-4 animate-in slide-in-from-top-1 cursor-auto" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-between items-start mb-4">
                                <div className="text-xs text-slate-500">
                                    <p>ID: <span className="font-mono">{order.id.substring(0,8)}...</span></p>
                                    <p className="flex items-center gap-1 mt-1">
                                        Status: 
                                        {order.status === 'synced' ? (
                                            <span className="text-green-600 font-bold">Sincronizado</span>
                                        ) : (
                                            <span className="text-orange-600 font-bold">Pendente</span>
                                        )}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleOpenReceipt(order)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded text-xs font-bold transition-colors shadow-sm"
                                    >
                                        <Printer className="w-3 h-3" /> Visualizar / PDF
                                    </button>
                                    <button
                                        onClick={() => duplicateOrder(order)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded text-xs font-bold transition-colors shadow-sm"
                                        title="Duplicar pedido"
                                    >
                                        <Copy className="w-3 h-3" /> Duplicar
                                    </button>
                                    <button
                                        onClick={() => {
                                            const text = `Pedido #${order.displayId}\nCliente: ${order.customerName}\nTotal: R$ ${order.total.toFixed(2)}\n\nItens:\n` + order.items.map(i => `- ${i.quantity} ${i.unit} ${i.name} (R$ ${(i.quantity*i.price).toFixed(2)})`).join('\n');
                                            const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                                            window.open(url, '_blank');
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 rounded text-xs font-bold transition-colors shadow-sm"
                                        title="Compartilhar no WhatsApp"
                                    >
                                        <Share2 className="w-3 h-3" /> WhatsApp
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1 bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                                {order.items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-sm py-2 border-b border-slate-50 dark:border-slate-700 last:border-0">
                                        <div className="flex-1 pr-2 min-w-0">
                                            <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded mr-2 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600">{item.id}</span>
                                            <span className="text-slate-700 dark:text-slate-300 font-medium">{item.name}</span>
                                        </div>
                                        <div className="flex gap-2 text-right items-center shrink-0">
                                            <span className="text-slate-500 text-xs w-16 text-right">{item.quantity} {item.unit}</span>
                                            <span className="text-slate-900 dark:text-white font-bold w-20 text-right">R$ {(item.price * item.quantity).toFixed(2)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )})}
        </div>
      )}
      
      {/* BARRA DE AÇÃO FLUTUANTE (Bulk Actions) */}
      {selectedIds.size > 0 && activeTab === 'pending' && (
          <div className="fixed bottom-4 left-4 right-4 max-w-3xl mx-auto bg-slate-900 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between z-40 animate-in slide-in-from-bottom-4">
              <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      {selectedIds.size}
                  </div>
                  <span className="font-medium text-sm hidden sm:inline">Selecionados</span>
              </div>

              <div className="flex items-center gap-3">
                  {syncing ? (
                      <div className="flex items-center gap-2 text-orange-400 font-bold text-sm bg-slate-800 px-4 py-2 rounded-lg">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Enviando {syncProgress.current}/{syncProgress.total}...
                      </div>
                  ) : (
                      <>
                        <button 
                            onClick={handleBulkDelete}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                            <Trash2 className="w-5 h-5" />
                            <span className="hidden sm:inline">Excluir</span>
                        </button>
                        <button 
                            onClick={handleBulkSend}
                            className="py-2 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all"
                        >
                            <UploadCloud className="w-5 h-5" />
                            Enviar Agora
                        </button>
                      </>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};
