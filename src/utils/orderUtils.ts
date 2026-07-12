import { CartItem, Order, Product } from '../../types';
import { OrderDraft, OrderDraftItem, DraftStatus } from '../types/orderDraft';
import { buildBudgetNumber } from './documentIdentity';

export const createOrderUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `order-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const buildDraftItem = (item: CartItem): OrderDraftItem => ({
  codigo_produto: item.id,
  quantidade: item.quantity,
  valor_unitario: item.price,
  nome_produto: item.name,
  descricao: item.description || '',
  unidade: item.unit,
  base_price: item.basePrice ?? item.price,
  category: item.category,
  stock: item.stock,
  sectionCode: item.sectionCode,
  groupCode: item.groupCode,
  subgroupCode: item.subgroupCode,
});

export const buildDraftPayload = async (params: {
  cart: CartItem[];
  total: number;
  selectedCustomer: { id: string; name?: string; document?: string; type?: string } | null;
  storeInfo: Record<string, any> | null | undefined;
  sellerCode: string;
  currentDraft?: OrderDraft | null;
  notes: string;
  paymentMethod: string;
  shippingMethod: string;
  selectedPlan: {
    code?: string;
    description?: string;
    installments?: number;
    daysFirstInstallment?: number;
    daysBetweenInstallments?: number;
    minValue?: number;
  } | null;
  status: DraftStatus;
  carrier?: string;
}): Promise<OrderDraft> => {
  const {
    cart, total, selectedCustomer, storeInfo, sellerCode, currentDraft,
    notes, paymentMethod, shippingMethod, selectedPlan, status, carrier,
  } = params;
  const now = new Date().toISOString();
  const draftId = currentDraft?.id || createOrderUUID();
  const numeroOrcamento = buildBudgetNumber({
    store: storeInfo,
    sellerCode,
    issuedAt: currentDraft?.data_criacao || now,
    existingNumber: null,
  });
  return {
    id: draftId,
    cliente_id: selectedCustomer?.id || '0',
    cliente_nome: selectedCustomer?.name,
    cliente_documento: selectedCustomer?.document,
    cliente_tipo: selectedCustomer?.type as any,
    itens: cart.map(buildDraftItem),
    total,
    data_criacao: currentDraft?.data_criacao || now,
    updated_at: now,
    status,
    retry_count: currentDraft?.retry_count ?? 0,
    error_message: undefined,
    display_id: currentDraft?.display_id,
    numero_orcamento: numeroOrcamento,
    notes,
    carrier: carrier || 'Retirada em Loja',
    payment_method: paymentMethod,
    payment_method_id: paymentMethod,
    shipping_method: shippingMethod,
    shipping_method_id: shippingMethod,
    payment_plan_code: selectedPlan?.code,
    payment_plan_description: selectedPlan?.description,
    payment_installments: selectedPlan?.installments,
    payment_first_installment_days: selectedPlan?.daysFirstInstallment,
    payment_days_between: selectedPlan?.daysBetweenInstallments,
    payment_min_value: selectedPlan?.minValue,
  };
};

export const buildOrderFromDraft = (draft: OrderDraft, params: {
  selectedCustomer?: { id: string; name?: string; document?: string; type?: string; sellerId?: string; sellerName?: string } | null;
  sellerId?: string;
  sellerName?: string;
}): Order => {
  const { selectedCustomer, sellerId, sellerName } = params;
  return {
    id: draft.id,
    displayId: draft.display_id,
    numero_orcamento: draft.numero_orcamento,
    numero_pedido: draft.numero_pedido,
    customerId: draft.cliente_id,
    customerName: selectedCustomer?.name || draft.cliente_nome,
    customerDoc: selectedCustomer?.document || draft.cliente_documento,
    customerType: (selectedCustomer?.type || draft.cliente_tipo) as any,
    paymentPlanCode: draft.payment_plan_code,
    paymentPlanDescription: draft.payment_plan_description,
    paymentInstallments: draft.payment_installments,
    paymentFirstInstallmentDays: draft.payment_first_installment_days,
    paymentDaysBetween: draft.payment_days_between,
    paymentMinValue: draft.payment_min_value,
    items: draft.itens.map((item) => ({
      id: item.codigo_produto,
      name: item.nome_produto || item.codigo_produto,
      description: item.descricao || '',
      price: item.valor_unitario,
      basePrice: item.base_price ?? item.valor_unitario,
      category: item.category || '',
      stock: Number(item.stock || 0),
      unit: item.unidade || 'un',
      quantity: item.quantidade,
      sectionCode: item.sectionCode,
      groupCode: item.groupCode,
      subgroupCode: item.subgroupCode,
    })),
    total: draft.total,
    notes: draft.notes,
    sellerId: sellerId || selectedCustomer?.sellerId || undefined,
    sellerName: sellerName || selectedCustomer?.sellerName || undefined,
    paymentMethod: draft.payment_method,
    paymentMethodId: draft.payment_method_id,
    shippingMethod: draft.shipping_method,
    shippingMethodId: draft.shipping_method_id,
    status: 'pending',
    createdAt: draft.data_criacao,
  };
};
