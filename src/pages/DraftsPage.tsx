import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Edit3, Loader2, Trash2 } from 'lucide-react';
import { Order } from '../../types';
import { OrderDraft } from '../types/orderDraft';
import { apiService } from '../../services/api';
import { deleteDraft, getAllDrafts, updateDraft } from '../services/draftDB';

type AppView = 'dashboard' | 'products' | 'cart' | 'orders' | 'settings' | 'customers' | 'sync' | 'send' | 'drafts';

interface DraftsPageProps {
  onNavigate: (view: AppView) => void;
  onEditDraft: (draft: OrderDraft) => void;
}

const buildOrderFromDraft = (draft: OrderDraft): Order => {
  const items = draft.itens.map((item) => ({
    id: item.codigo_produto,
    name: item.nome_produto || item.codigo_produto,
    description: item.descricao || '',
    price: item.valor_unitario,
    basePrice: item.base_price ?? item.valor_unitario,
    category: item.category || '',
    stock: item.stock ?? 0,
    unit: item.unidade || 'un',
    quantity: item.quantidade,
  }));

  return {
    id: draft.id,
    displayId: draft.display_id,
    items,
    total: draft.total,
    customerId: draft.cliente_id,
    customerName: draft.cliente_nome,
    customerDoc: draft.cliente_documento,
    customerType: draft.cliente_tipo,
    paymentPlanCode: draft.payment_plan_code,
    paymentPlanDescription: draft.payment_plan_description,
    paymentInstallments: draft.payment_installments,
    paymentFirstInstallmentDays: draft.payment_first_installment_days,
    paymentDaysBetween: draft.payment_days_between,
    paymentMinValue: draft.payment_min_value,
    paymentMethod: draft.payment_method,
    paymentMethodId: draft.payment_method_id,
    shippingMethod: draft.shipping_method,
    shippingMethodId: draft.shipping_method_id,
    notes: draft.notes,
    sellerId: apiService.getSellerId() || undefined,
    sellerName: apiService.getUsername() || undefined,
    status: 'pending',
    createdAt: draft.data_criacao,
  };
};

const statusStyles: Record<OrderDraft['status'], string> = {
  DRAFT: 'bg-blue-50 text-blue-700 border border-blue-100',
  SYNCING: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
  SYNCED: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  ERROR: 'bg-red-50 text-red-700 border border-red-100',
};

export const DraftsPage: React.FC<DraftsPageProps> = ({ onNavigate, onEditDraft }) => {
  const [drafts, setDrafts] = useState<OrderDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const refreshDrafts = async () => {
    setLoading(true);
    setError('');
    try {
      const items = await getAllDrafts();
      setDrafts(items);
    } catch (err) {
      console.error('Falha ao carregar rascunhos', err);
      setError('Não foi possível carregar os rascunhos no momento.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDrafts();
  }, []);

  const handleDelete = async (draft: OrderDraft) => {
    if (!window.confirm('Remover este rascunho?')) return;
    setDeletingId(draft.id);
    try {
      await deleteDraft(draft.id);
      await refreshDrafts();
    } catch (err) {
      console.error('Erro ao remover rascunho', err);
      alert('Não foi possível excluir o rascunho.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSend = async (draft: OrderDraft) => {
    setProcessingId(draft.id);
    try {
      await updateDraft({ ...draft, status: 'SYNCING', error_message: undefined });
      const order = buildOrderFromDraft(draft);
      const result = await apiService.submitOrder(order);
      if (!result.success) {
        throw new Error(result.message || 'Erro ao enviar pedido');
      }
      await deleteDraft(draft.id);
      alert('Pedido enviado com sucesso.');
      await refreshDrafts();
    } catch (err: any) {
      console.error('Erro ao enviar rascunho', err);
      await updateDraft({
        ...draft,
        status: 'ERROR',
        error_message: String(err?.message || err),
        retry_count: (draft.retry_count || 0) + 1,
      });
      alert(`Falha ao enviar pedido: ${err?.message || 'Erro desconhecido'}`);
      await refreshDrafts();
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Fluxo Offline</p>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Rascunhos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
            Revise e envie manualmente pedidos salvos no dispositivo. Rascunhos sobrevivem a recarregamentos e ficarão disponíveis mesmo sem conexão.
          </p>
        </div>
        <div className="space-x-2 flex-shrink-0">
          <button
            onClick={() => onNavigate('cart')}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            Novo Pedido
          </button>
          <button
            onClick={() => onNavigate('dashboard')}
            className="px-4 py-2 bg-white dark:bg-slate-900 text-blue-600 border border-blue-200 dark:border-blue-700 rounded-lg font-semibold text-sm hover:bg-blue-50 dark:hover:bg-blue-900/70"
          >
            Voltar
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando rascunhos...
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-50 text-red-700 border border-red-100">
          <AlertTriangle className="w-4 h-4 mr-2 inline" /> {error}
        </div>
      )}

      {!loading && drafts.length === 0 && (
        <div className="p-6 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 text-sm text-center">
          Nenhum rascunho salvo. Crie um novo pedido e selecione "Salvar Rascunho".
        </div>
      )}

      <div className="space-y-4">
        {drafts.map((draft) => (
          <article key={draft.id} className="p-4 border rounded-2xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Cliente ID • {draft.cliente_id}</p>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Pedido {draft.display_id ? `#${draft.display_id}` : draft.id}</h2>
              </div>
              <span className={`px-3 py-1 rounded-full text-[11px] font-semibold uppercase ${statusStyles[draft.status]}`}>
                {draft.status}
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-300 mb-2">
              Total: R$ {draft.total.toFixed(2)} • Criado em {new Date(draft.data_criacao).toLocaleString('pt-BR')}
            </p>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-3 flex flex-wrap gap-3">
              <span>Itens: {draft.itens.length}</span>
              <span>Última atualização: {new Date(draft.updated_at).toLocaleString('pt-BR')}</span>
              {draft.retry_count !== undefined && <span>Tentativas: {draft.retry_count}</span>}
            </div>
            {!!draft.error_message && (
              <div className="mb-3 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3">
                <p className="font-semibold">Erro anterior:</p>
                <p className="text-[13px] leading-snug break-words">{draft.error_message}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => onEditDraft(draft)}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold flex items-center gap-1"
              >
                <Edit3 className="w-4 h-4" /> Editar
              </button>
              <button
                onClick={() => handleSend(draft)}
                disabled={processingId === draft.id}
                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 ${processingId === draft.id ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-orange-600 text-white border border-orange-600 hover:bg-orange-700'}`}
              >
                <ArrowUpRight className="w-4 h-4" />
                {processingId === draft.id ? 'Enviando...' : 'Enviar para ERP'}
              </button>
              <button
                onClick={() => handleDelete(draft)}
                disabled={deletingId === draft.id}
                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 ${deletingId === draft.id ? 'bg-red-100 text-red-600 border border-red-200' : 'bg-white text-red-600 border border-red-200 hover:bg-red-50'}`}
              >
                <Trash2 className="w-4 h-4" />
                {deletingId === draft.id ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
