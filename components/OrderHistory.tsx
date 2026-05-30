import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { Order } from '../types';
import { FileText, Printer, ChevronDown, ChevronUp, Calendar, Package, RefreshCw, AlertCircle, CheckCircle2, Loader2, Download, Copy, Share2, X } from 'lucide-react';

interface OrderHistoryProps {
  onNavigate?: (view: string) => void;
  initialTab?: 'all' | 'pending' | 'synced' | 'flow';
  storeInfo?: Record<string, any> | null;
}

const businessStatusLegend = [
  { key: 'orcamento', label: 'Orçamento', classes: 'bg-slate-100 text-slate-600 border border-slate-200' },
  { key: 'pre_venda', label: 'Pré-venda', classes: 'bg-blue-100 text-blue-700 border border-blue-200' },
  { key: 'separacao', label: 'Separação', classes: 'bg-amber-100 text-amber-700 border border-amber-200' },
  { key: 'faturado', label: 'Faturado', classes: 'bg-green-100 text-green-700 border border-green-200' },
  { key: 'entregue', label: 'Entregue', classes: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  { key: 'cancelado', label: 'Cancelado', classes: 'bg-red-100 text-red-700 border border-red-200' }
];

const getBusinessStatusMeta = (status?: string) => {
  const key = status || 'orcamento';
  return businessStatusLegend.find(item => item.key === key) || businessStatusLegend[0];
};

const renderBusinessStatusBadge = (status?: string) => {
  const meta = getBusinessStatusMeta(status);
  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded-full whitespace-nowrap ${meta.classes}`}>
      {meta.label}
    </span>
  );
};

const formatMoney = (value: number) => {
  return `R$ ${value.toFixed(2)}`;
};

export const OrderHistory: React.FC<OrderHistoryProps> = ({ onNavigate, initialTab = 'all', storeInfo }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'synced' | 'flow'>(initialTab);
  const [orderDetails, setOrderDetails] = useState<Record<string, Order>>({});
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchingDetailId, setFetchingDetailId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<Order | null>(null);
  const [headerStore, setHeaderStore] = useState<any | null>(storeInfo ?? null);
  const [fallbackStoreLoaded, setFallbackStoreLoaded] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (storeInfo !== undefined) {
      setHeaderStore(storeInfo ?? null);
      return;
    }
    if (fallbackStoreLoaded) return;
    const loadHeaderStore = async () => {
      try {
        const res = await apiService.fetchWithAuth('/api/store/public');
        if (res.ok) {
          const data = await res.json();
          setHeaderStore(data);
        }
      } catch (error) {
        console.warn('Falha ao carregar dados da loja', error);
      } finally {
        setFallbackStoreLoaded(true);
      }
    };
    loadHeaderStore();
  }, [storeInfo, fallbackStoreLoaded]);

  useEffect(() => {
    setExpandedOrder(null);
  }, [activeTab]);

  const loadOrders = async () => {
    setLoading(true);
    setFetchError(null);
    console.log('[ORDER_HISTORY] GET /api/pedidos');
    try {
      const remoteOrders = await apiService.getOrderHistory();
      setOrders(remoteOrders);
    } catch (error: any) {
      console.error('Erro ao carregar histórico de pedidos', error);
      setFetchError(error?.message || 'Não foi possível carregar os pedidos agora.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetail = async (orderId: string) => {
    setFetchError(null);
    setFetchingDetailId(orderId);
    console.log(`[ORDER_HISTORY] GET /api/pedidos/${orderId}`);
    try {
      const detail = await apiService.getOrderById(orderId);
      if (!detail) {
        setFetchError('Pedido não existe no ERP.');
        setExpandedOrder(null);
        return;
      }
    setOrderDetails((prev) => ({ ...prev, [orderId]: detail }));
    setOrders((prev) => prev.map((order) => (order.id === orderId ? detail : order)));
    } catch (error: any) {
      console.error('Erro ao carregar pedido', error);
      if (error?.message?.includes('404')) {
        setFetchError('Pedido não encontrado.');
      } else {
        setFetchError(error?.message || 'Erro ao carregar o pedido.');
      }
      setExpandedOrder(null);
    } finally {
      setFetchingDetailId(null);
    }
  };

  const handleToggleOrder = (orderId: string) => {
    const shouldOpen = expandedOrder !== orderId;
    setExpandedOrder(shouldOpen ? orderId : null);
    if (shouldOpen) {
      fetchOrderDetail(orderId);
    }
  };

  const duplicateOrder = async (order: Order) => {
    try {
      setDuplicating(order.id);
      const payload = orderDetails[order.id] ?? order;
      localStorage.setItem('cartDraft', JSON.stringify(payload.items || []));
      if (onNavigate) onNavigate('cart');
    } catch (e) {
      alert('Não foi possível enviar os itens para o carrinho.');
    } finally {
      setDuplicating(null);
    }
  };

  const resolveSellerName = (name?: string) => {
    const trimmed = (name || '').trim();
    if (trimmed && trimmed.toLowerCase() !== 'loja') return trimmed;
    const loggedName = apiService.getUsername();
    if (loggedName && loggedName !== 'Vendedor' && loggedName !== 'Terminal Vinculado') return loggedName;
    return trimmed || loggedName || '—';
  };

  const renderSyncBadge = (order: Order) => {
    if (order.sincronizacaoErro) {
      return (
        <div className="flex flex-col gap-0.5 bg-red-50 border border-red-200 rounded px-3 py-1 text-[11px] text-red-700">
          <span className="font-semibold">✖ Falha na sincronização</span>
          <span className="text-[10px] text-red-500 break-words">{order.sincronizacaoErro}</span>
        </div>
      );
    }
    if (order.sincronizado) {
      return (
        <div className="flex flex-col gap-0.5 bg-emerald-50 border border-emerald-200 rounded px-3 py-1 text-[11px] text-emerald-700">
          <span className="font-semibold">✔ Sincronizado com ERP</span>
          {order.sincronizadoEm && (
            <span className="text-[10px] text-emerald-500">
              {new Date(order.sincronizadoEm).toLocaleString()}
            </span>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-0.5 bg-amber-50 border border-amber-200 rounded px-3 py-1 text-[11px] text-amber-600">
        <span className="font-semibold">⚠ Aguardando sincronização</span>
        <span className="text-[10px] text-amber-500">Este pedido ainda não foi confirmado no ERP.</span>
      </div>
    );
  };

  const handleOpenReceipt = (order: Order) => {
    setViewingReceipt(order);
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredOrders = orders.filter((order) => {
    if (activeTab === 'all') return true;
    return order.status === activeTab;
  });

  const pendingCount = orders.filter((order) => order.status === 'pending').length;
  const syncedCount = orders.filter((order) => order.status === 'synced').length;
  const flowOrders = orders.filter(
    (order) => order.businessStatus && order.businessStatus !== 'entregue' && order.businessStatus !== 'cancelado'
  );
  const flowCount = flowOrders.length;

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500">
        <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
        Carregando...
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 max-w-3xl mx-auto relative min-h-full">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 8mm;
          }
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
            min-height: auto;
            height: auto;
            background: white;
            color: black;
            z-index: 9999;
            padding: 0;
            margin: 0;
            overflow: visible;
            box-sizing: border-box;
          }
          .print-page {
            width: 100%;
            min-height: auto;
          }
          .no-print {
            display: none !important;
          }
          .print-content {
             background-color: white !important;
             color: black !important;
             border: none !important;
             box-shadow: none !important;
             padding: 8mm !important;
             overflow: visible !important;
          }
          .print-page table {
             border-collapse: collapse;
          }
          .print-page tr {
             page-break-inside: avoid;
          }
          .print-compact .text-2xl {
             font-size: 18px !important;
             line-height: 1.2 !important;
          }
          .print-compact .text-xl {
             font-size: 16px !important;
             line-height: 1.2 !important;
          }
          .print-compact .text-sm {
             font-size: 11px !important;
             line-height: 1.3 !important;
          }
          .print-compact .text-xs {
             font-size: 10px !important;
             line-height: 1.3 !important;
          }
          .print-compact .text-\\[10px\\] {
             font-size: 9px !important;
             line-height: 1.3 !important;
          }
          .print-compact .text-\\[11px\\] {
             font-size: 10px !important;
             line-height: 1.3 !important;
          }
          .print-compact .mt-6 {
             margin-top: 12px !important;
          }
          .print-compact .mt-4 {
             margin-top: 8px !important;
          }
          .print-compact .mt-2 {
             margin-top: 4px !important;
          }
          .print-compact .pt-6 {
             padding-top: 12px !important;
          }
          .print-compact .pt-4 {
             padding-top: 8px !important;
          }
          .print-compact .pb-4 {
             padding-bottom: 8px !important;
          }
        }
      `}</style>

      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div id="receipt-modal" className="bg-white w-full max-w-[820px] rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-4 flex justify-between items-center no-print shrink-0">
              <h3 className="text-white font-bold flex items-center gap-2">
                <Printer className="w-5 h-5" /> Visualizar Recibo
              </h3>
              <button onClick={() => setViewingReceipt(null)} className="text-white/70 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 bg-white text-slate-900 print-content overflow-y-auto flex-1">
              <div className="print-page print-compact">
                <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4">
                  <div className="flex gap-4 items-start">
                    {headerStore?.logo_url && (
                      <img
                        src={headerStore.logo_url}
                        alt={headerStore.trade_name || 'Logotipo'}
                        className="h-16 w-16 object-contain rounded border border-slate-200"
                      />
                    )}
                    <div className="space-y-1">
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
                      <p className="text-xs text-slate-500 mt-2">Comprovante de Pedido</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Pedido</p>
                    <p className="text-xl font-mono font-bold">#{viewingReceipt.displayId}</p>
                    <p className="text-[10px] text-slate-500 uppercase font-bold mt-2">Data</p>
                    <p className="font-medium">{new Date(viewingReceipt.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                  <div className="border border-slate-200 p-3 rounded">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Cliente</p>
                    <p className="font-bold text-sm leading-tight">{viewingReceipt.customerName}</p>
                    <p className="text-[11px] text-slate-600 font-mono mt-1">Doc: {viewingReceipt.customerDoc || 'N/A'}</p>
                  </div>
                  <div className="border border-slate-200 p-3 rounded">
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Vendedor</p>
                    <p className="font-bold text-sm">
                      {resolveSellerName(viewingReceipt.sellerName)} {viewingReceipt.sellerId ? `(${viewingReceipt.sellerId})` : ''}
                    </p>
                  </div>
                </div>

                <table className="w-full text-xs mt-6 border-t border-slate-300">
                  <thead>
                    <tr className="border-b border-slate-300">
                      <th className="text-left py-2 font-bold text-slate-600 w-12">Qtd</th>
                      <th className="text-left py-2 font-bold text-slate-600 w-12">Un</th>
                      <th className="text-left py-2 font-bold text-slate-600">Descrição</th>
                      <th className="text-right py-2 font-bold text-slate-600 w-20">Unit</th>
                      <th className="text-right py-2 font-bold text-slate-600 w-20">Total</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-700">
                    {viewingReceipt.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100">
                        <td className="py-2 align-top">{item.quantity}</td>
                        <td className="py-2 align-top">{item.unit}</td>
                        <td className="py-2 align-top">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {item.description || item.id}
                          </div>
                        </td>
                        <td className="py-2 align-top text-right">R$ {item.price.toFixed(2)}</td>
                        <td className="py-2 align-top text-right font-bold">R$ {(item.quantity * item.price).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Observações</p>
                  <div className="border border-slate-200 rounded p-2 text-xs text-slate-700 min-h-[48px]">
                    {viewingReceipt.notes || '—'}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                  <div className="border border-slate-200 rounded p-3">
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Forma de Pagamento</p>
                    <p className="font-semibold">{viewingReceipt.paymentMethod || '—'}</p>
                    {viewingReceipt.paymentPlanDescription && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Plano: {viewingReceipt.paymentPlanDescription} {viewingReceipt.paymentInstallments ? `(${viewingReceipt.paymentInstallments}x)` : ''}
                      </p>
                    )}
                  </div>
                  <div className="border border-slate-200 rounded p-3">
                    <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Tipo de Frete</p>
                    <p className="font-semibold">{viewingReceipt.shippingMethod || '—'}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center border-t-2 border-slate-800 pt-4 mt-6">
                  <span className="text-sm font-bold uppercase">Total Geral</span>
                  <span className="text-xl font-bold">R$ {viewingReceipt.total.toFixed(2)}</span>
                </div>

                <div className="text-center text-xs text-slate-400 mt-6 pt-6 border-t border-dashed border-slate-300">
                  <p>Emitido via SalesForce App</p>
                  <p>{new Date().toLocaleString()}</p>
                </div>
              </div>
            </div>
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
                    const payload = {
                      id: viewingReceipt.id,
                      displayId: viewingReceipt.displayId,
                      createdAt: viewingReceipt.createdAt,
                      customer: viewingReceipt.customerName,
                      customerDoc: viewingReceipt.customerDoc,
                      sellerName: viewingReceipt.sellerName,
                      sellerId: viewingReceipt.sellerId,
                      notes: viewingReceipt.notes,
                      paymentMethod: viewingReceipt.paymentMethod,
                      shippingMethod: viewingReceipt.shippingMethod,
                      paymentPlanDescription: viewingReceipt.paymentPlanDescription,
                      paymentInstallments: viewingReceipt.paymentInstallments,
                      items: viewingReceipt.items,
                      total: viewingReceipt.total,
                      store: headerStore
                    };
                    const res = await apiService.fetchWithAuth('/api/recibo/pdf/public', {
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
                    a.target = '_blank';
                    a.rel = 'noreferrer';
                    document.body.appendChild(a);
                    if (typeof a.download === 'string') {
                      a.click();
                    } else {
                      window.open(url, '_blank', 'noopener');
                    }
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
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FileText className="w-6 h-6 text-blue-600" /> Histórico de Pedidos
        </h2>
      </div>

      {fetchError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">
          {fetchError}
        </div>
      )}

      <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
        >
          Todos ({orders.length})
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all flex items-center justify-center gap-1 ${activeTab === 'pending' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
        >
          Pendentes
          {pendingCount > 0 && <span className="bg-orange-100 text-orange-700 text-[10px] px-1.5 rounded-full">{pendingCount}</span>}
        </button>
        <button
          onClick={() => setActiveTab('synced')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'synced' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}
        >
          Enviados ({syncedCount})
        </button>
        <button
          onClick={() => setActiveTab('flow')}
          className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'flow' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500'}`}
        >
          Fluxo ({flowCount})
        </button>
      </div>

      {activeTab === 'flow' ? (
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <h3 className="font-bold mb-2 text-slate-800">Status do Fluxo</h3>
          <p className="text-sm mb-3 text-slate-600">Exibição apenas informativa; alterações são feitas no ERP.</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {businessStatusLegend.map((status) => (
              <span key={status.key} className={`px-2 py-1 text-xs font-semibold rounded-full ${status.classes}`}>
                {status.label}
              </span>
            ))}
          </div>
          {flowOrders.slice(0, 10).map((order) => (
            <div key={order.id} className="flex items-center justify-between border-t py-2 first:border-t-0 gap-3">
              <div className="min-w-0">
                <div className="font-semibold">#{order.displayId} • {order.customerName}</div>
                <div className="text-xs text-slate-500">Status do fluxo</div>
              </div>
              <div className="shrink-0">
                {renderBusinessStatusBadge(order.businessStatus)}
              </div>
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white p-12 rounded-lg text-center shadow-sm border border-slate-100">
          <p className="text-slate-500">Nenhum pedido encontrado nesta categoria.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const detail = orderDetails[order.id] ?? order;
            return (
              <div
                key={order.id}
                onClick={() => handleToggleOrder(order.id)}
                className="bg-white rounded-lg shadow-sm border border-slate-200 cursor-pointer"
              >
                <div className="p-4 flex items-start gap-4 hover:bg-slate-50">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${order.status === 'synced' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {order.status === 'synced' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">
                          #{order.displayId} - {order.customerName}
                        </h3>
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {new Date(order.createdAt).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" /> {order.items.length} itens
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1">
                          Vendedor: {resolveSellerName(order.sellerName)} {order.sellerId ? `(${order.sellerId})` : ''}
                        </div>
                      </div>
                      <div className="text-right text-blue-600 font-bold text-base">
                        {formatMoney(order.total)}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <div className="flex items-center gap-1 text-[11px] uppercase text-slate-500">
                        Status ERP: {order.status === 'synced' ? 'Sincronizado' : 'Pendente'}
                      </div>
                      {renderSyncBadge(detail)}
                    </div>
                  </div>
                  <div className="text-slate-400">
                    {expandedOrder === order.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>

                {expandedOrder === order.id && (
                  <div
                    className="bg-slate-50 border-t border-slate-100 p-4 space-y-4 cursor-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {fetchingDetailId === order.id && (
                      <div className="flex items-center gap-2 text-slate-500 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Atualizando para refletir o ERP...
                      </div>
                    )}
                    <div className="grid md:grid-cols-2 gap-4 text-sm text-slate-500">
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide">Cliente</p>
                        <p className="font-semibold text-slate-800">{detail.customerName || '—'}</p>
                        <p className="text-xs text-slate-500 font-mono">CPF/CNPJ: {detail.customerDoc || '—'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide">Status do fluxo</p>
                        {detail.businessStatus ? renderBusinessStatusBadge(detail.businessStatus) : <span className="text-xs text-slate-500">—</span>}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide">Forma de pagamento</p>
                        <p className="font-semibold text-slate-800">{detail.paymentMethod || '—'}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-wide">Frete</p>
                        <p className="font-semibold text-slate-800">{detail.shippingMethod || '—'}</p>
                      </div>
                    </div>

                    <div className="space-y-1 text-xs text-slate-500">
                      <div className="flex justify-between">
                        <span>Frete</span>
                        <span className="font-semibold text-slate-800">{detail.shippingCost ? formatMoney(detail.shippingCost) : '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total</span>
                        <span className="font-semibold text-slate-800">{formatMoney(detail.total)}</span>
                      </div>
                    </div>

                    <div className="space-y-1 bg-white rounded border border-slate-100 p-2 text-sm">
                      {detail.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b border-slate-100 last:border-0 py-2">
                          <div className="min-w-0">
                            <div className="text-xs text-slate-500 font-mono mb-1">{item.id}</div>
                            <div className="font-medium text-slate-800">{item.name}</div>
                          </div>
                          <div className="text-right text-sm">
                            <div className="text-xs text-slate-500">
                              {item.quantity} {item.unit} × R$ {item.price.toFixed(2)}
                            </div>
                            <div className="font-semibold text-slate-900">R$ {(item.quantity * item.price).toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenReceipt(order);
                        }}
                        className="flex-1 min-w-[120px] items-center justify-center gap-2 py-2 px-3 text-xs font-bold rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      >
                        <Printer className="w-3 h-3" /> Visualizar / PDF
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateOrder(order);
                        }}
                        className="flex-1 min-w-[120px] bg-green-600 text-white rounded text-xs font-bold py-2 px-3 flex items-center justify-center gap-2 hover:bg-green-700"
                        title="Duplicar pedido"
                      >
                        <Copy className="w-3 h-3" />
                        {duplicating === order.id ? 'Duplicando...' : 'Duplicar'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const text = `Pedido #${order.displayId}\nCliente: ${order.customerName}\nTotal: R$ ${order.total.toFixed(2)}\n\nItens:\n` +
                            order.items
                              .map((item) => `- ${item.quantity} ${item.unit} ${item.name} (R$ ${(item.quantity * item.price).toFixed(2)})`)
                              .join('\n');
                          window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                        }}
                        className="flex-1 min-w-[120px] bg-green-100 text-green-700 rounded text-xs font-bold py-2 px-3 flex items-center justify-center gap-2 hover:bg-green-200"
                        title="Compartilhar no WhatsApp"
                      >
                        <Share2 className="w-3 h-3" /> WhatsApp
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
