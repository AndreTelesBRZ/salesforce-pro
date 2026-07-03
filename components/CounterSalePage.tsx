import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, LogOut, Minus, Package, Plus, RotateCcw, Save, Search, ShoppingCart, Store, Trash2, User, Wallet, XCircle, Tag, TrendingDown } from 'lucide-react';
import { apiService } from '../services/api';
import { dbService } from '../services/db';
import { deleteDraft, saveDraft, updateDraft } from '../src/services/draftDB';
import { DraftStatus, OrderDraft } from '../src/types/orderDraft';
import { CartItem, Customer, Order, PaymentPlan, Product, UserPermissions } from '../types';

interface CounterSalePageProps {
  currentUser: string;
  sellerCode: string | null;
  storeInfo?: any;
  permissions: UserPermissions | null;
  onBackToApp: () => void;
  onLogout: () => void;
}

const WALK_IN_CUSTOMER_ID = '0';

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX', icon: '⚡' },
  { value: 'dinheiro', label: 'Dinheiro', icon: '💵' },
  { value: 'cartao', label: 'Cartão', icon: '💳' },
  { value: 'boleto', label: 'Boleto', icon: '📄' },
];

const SHIPPING_METHODS = [
  { value: 'retirada', label: 'Retirada na loja', icon: '🏪' },
  { value: 'entrega_propria', label: 'Entrega própria', icon: '🚗' },
  { value: 'transportadora', label: 'Transportadora', icon: '🚚' },
  { value: 'sem_frete', label: 'Sem frete', icon: '—' },
];

const CATEGORY_COLORS: Record<string, string> = {
  default: 'bg-slate-100 text-slate-600',
  a: 'bg-blue-100 text-blue-700',
  b: 'bg-violet-100 text-violet-700',
  c: 'bg-emerald-100 text-emerald-700',
  d: 'bg-orange-100 text-orange-700',
  e: 'bg-rose-100 text-rose-700',
};

const getCategoryColor = (category?: string): string => {
  if (!category) return CATEGORY_COLORS.default;
  const key = category.trim().charAt(0).toLowerCase();
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.default;
};

const createOrderUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `order-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const normalizeText = (value: string | number | undefined | null): string => String(value ?? '').toLowerCase().trim();

const formatMoney = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const productMatchesSearch = (product: Product, rawSearch: string): boolean => {
  const terms = normalizeText(rawSearch).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    product.id,
    product.code,
    product.plu,
    product.reference,
    product.barcode,
    product.name,
    product.description,
    product.category,
  ].filter(Boolean).join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

const customerMatchesSearch = (customer: Customer, rawSearch: string): boolean => {
  const terms = normalizeText(rawSearch).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    customer.id,
    customer.name,
    customer.fantasyName,
    customer.document,
    customer.phone,
  ].filter(Boolean).join(' ').toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

const getInitials = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

// Toast notification component
interface ToastProps {
  type: 'success' | 'error' | 'info';
  text: string;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ type, text, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const config = {
    success: { icon: <CheckCircle2 className="h-5 w-5" />, bg: 'bg-emerald-600', text: 'text-white' },
    error: { icon: <XCircle className="h-5 w-5" />, bg: 'bg-rose-600', text: 'text-white' },
    info: { icon: <CheckCircle2 className="h-5 w-5" />, bg: 'bg-blue-600', text: 'text-white' },
  }[type];

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 shadow-2xl ${config.bg} ${config.text}`}
      style={{ animation: 'slideUp 0.3s ease-out', maxWidth: 380 }}
    >
      {config.icon}
      <span className="text-sm font-medium">{text}</span>
      <button onClick={onClose} className="ml-2 rounded-lg p-1 opacity-70 hover:opacity-100">
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
};

export const CounterSalePage: React.FC<CounterSalePageProps> = ({
  currentUser,
  sellerCode,
  storeInfo,
  permissions,
  onBackToApp,
  onLogout,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [shippingMethod, setShippingMethod] = useState('retirada');
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [selectedPlanCode, setSelectedPlanCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  const canEditSales = Boolean(permissions?.can_edit_sales);
  const canCreateSales = Boolean(permissions?.can_view_sales && permissions?.can_create_sales);
  const isBoleto = paymentMethod === 'boleto';
  const selectedPlan = paymentPlans.find((plan) => plan.code === selectedPlanCode) || null;

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setLoading(true);
      try {
        const [customerList, productList] = await Promise.all([
          apiService.getCustomers(),
          apiService.getAllProductsForReport(),
        ]);
        if (!active) return;
        setCustomers(customerList);
        setProducts(productList);
        const walkIn = customerList.find((customer) => customer.id === WALK_IN_CUSTOMER_ID) || customerList[0] || null;
        setSelectedCustomer(walkIn);
      } catch (error: any) {
        if (!active) return;
        setFeedback({ type: 'error', text: error?.message || 'Nao foi possivel carregar clientes e produtos.' });
      } finally {
        if (active) setLoading(false);
      }
    };
    loadData();
    return () => { active = false; };
  }, []);

  const filteredCustomers = useMemo(
    () => customers.filter((customer) => customerMatchesSearch(customer, customerSearch)).slice(0, 30),
    [customers, customerSearch]
  );

  const filteredProducts = useMemo(
    () => products.filter((product) => productMatchesSearch(product, productSearch)).slice(0, 80),
    [products, productSearch]
  );

  const cartSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + ((item.basePrice ?? item.price) * item.quantity), 0),
    [cart]
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    [cart]
  );

  const cartDiscount = useMemo(
    () => cart.reduce((sum, item) => sum + Math.max((item.basePrice ?? item.price) - item.price, 0) * item.quantity, 0),
    [cart]
  );

  const stockViolation = useMemo(
    () => cart.find((item) => Number.isFinite(item.stock) && item.quantity > Math.max(item.stock, 0)),
    [cart]
  );

  useEffect(() => {
    if (!selectedCustomer || !isBoleto) {
      setPaymentPlans([]);
      setSelectedPlanCode('');
      return;
    }

    let active = true;
    setPlanLoading(true);
    apiService.getPaymentPlansForCustomer(selectedCustomer.id, cartTotal)
      .then((result) => {
        if (!active) return;
        const available = result.plans.filter((plan) => plan.disponivel === true || plan.disponivel === undefined || plan.disponivel === null);
        setPaymentPlans(available);
        setSelectedPlanCode(available[0]?.code || '');
      })
      .catch((error: any) => {
        if (!active) return;
        setPaymentPlans([]);
        setSelectedPlanCode('');
        setFeedback({ type: 'error', text: error?.message || 'Erro ao carregar planos de pagamento.' });
      })
      .finally(() => { if (active) setPlanLoading(false); });

    return () => { active = false; };
  }, [selectedCustomer?.id, isBoleto, cartTotal]);

  const addProductToCart = (product: Product) => {
    setFeedback(null);
    setLastAddedId(product.id);
    setTimeout(() => setLastAddedId(null), 1200);
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id);
      const increment = product.unit.toLowerCase() === 'cto' ? 0.01 : 1;
      if (existing) {
        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Number((item.quantity + increment).toFixed(2)) }
            : item
        );
      }
      return [...current, { ...product, quantity: increment === 0.01 ? 1 : 1, basePrice: product.price }];
    });
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((current) => current.filter((item) => item.id !== productId));
      return;
    }
    setCart((current) =>
      current.map((item) => {
        if (item.id !== productId) return item;
        const nextQuantity = item.unit.toLowerCase() === 'cto'
          ? Number(quantity.toFixed(2))
          : Math.max(1, Math.floor(quantity));
        return { ...item, quantity: nextQuantity };
      })
    );
  };

  const updatePrice = (productId: string, price: number) => {
    if (!canEditSales || !Number.isFinite(price) || price < 0) return;
    setCart((current) => current.map((item) => (item.id === productId ? { ...item, price } : item)));
  };

  const resetSale = () => {
    setCart([]);
    setNotes('');
    setPaymentMethod('pix');
    setShippingMethod('retirada');
    setPaymentPlans([]);
    setSelectedPlanCode('');
    setCurrentDraftId(null);
    const walkIn = customers.find((customer) => customer.id === WALK_IN_CUSTOMER_ID) || customers[0] || null;
    setSelectedCustomer(walkIn);
  };

  const validateSale = (): string | null => {
    if (!canCreateSales) return 'Usuário sem permissão para criar vendas.';
    if (cart.length === 0) return 'Adicione pelo menos um item ao carrinho.';
    if (!selectedCustomer) return 'Selecione um cliente.';
    if (isBoleto && !selectedPlan) return 'Selecione um plano de pagamento para boleto.';
    if (selectedPlan && Number(selectedPlan.minValue || 0) > 0 && cartTotal < Number(selectedPlan.minValue || 0)) {
      return `Valor mínimo do plano: ${formatMoney(Number(selectedPlan.minValue || 0))}.`;
    }
    if (stockViolation) {
      return `Estoque insuficiente para ${stockViolation.name}. Disponível: ${stockViolation.stock}.`;
    }
    return null;
  };

  const ensureDisplayId = async (): Promise<number> => dbService.generateNextOrderId();

  const buildDraftPayload = async (status: DraftStatus): Promise<OrderDraft> => ({
    id: currentDraftId || createOrderUUID(),
    cliente_id: selectedCustomer?.id || WALK_IN_CUSTOMER_ID,
    cliente_nome: selectedCustomer?.name,
    cliente_documento: selectedCustomer?.document,
    cliente_tipo: selectedCustomer?.type || 'NORMAL',
    itens: cart.map((item) => ({
      codigo_produto: item.id,
      quantidade: item.quantity,
      valor_unitario: item.price,
      nome_produto: item.name,
      descricao: item.description,
      unidade: item.unit,
      base_price: item.basePrice ?? item.price,
      category: item.category,
      stock: item.stock,
      sectionCode: item.sectionCode,
      groupCode: item.groupCode,
      subgroupCode: item.subgroupCode,
    })),
    total: cartTotal,
    data_criacao: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status,
    retry_count: 0,
    display_id: await ensureDisplayId(),
    notes,
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
  });

  const buildOrderFromDraft = (draft: OrderDraft): Order => ({
    id: draft.id,
    displayId: draft.display_id,
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
    sellerId: apiService.getSellerId() || undefined,
    sellerName: currentUser || apiService.getUsername() || undefined,
    paymentMethod: draft.payment_method,
    paymentMethodId: draft.payment_method_id,
    shippingMethod: draft.shipping_method,
    shippingMethodId: draft.shipping_method_id,
    status: 'pending',
    businessStatus: 'pre_venda',
    createdAt: draft.data_criacao,
  });

  const handleSaveDraft = async () => {
    const validationError = validateSale();
    if (validationError) {
      setFeedback({ type: 'error', text: validationError });
      return;
    }

    setSubmitting(true);
    try {
      const draft = await buildDraftPayload('DRAFT');
      if (currentDraftId) {
        await updateDraft(draft);
      } else {
        await saveDraft(draft);
      }
      setCurrentDraftId(draft.id);
      setFeedback({ type: 'success', text: `Rascunho #${draft.display_id} salvo com sucesso.` });
    } catch (error: any) {
      setFeedback({ type: 'error', text: error?.message || 'Erro ao salvar rascunho.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalizeSale = async () => {
    const validationError = validateSale();
    if (validationError) {
      setFeedback({ type: 'error', text: validationError });
      return;
    }

    setSubmitting(true);
    let draft: OrderDraft | null = null;
    try {
      draft = await buildDraftPayload('SYNCING');
      if (currentDraftId) {
        await updateDraft(draft);
      } else {
        await saveDraft(draft);
      }
      setCurrentDraftId(draft.id);
      const order = buildOrderFromDraft(draft);
      const result = await apiService.submitOrder(order);
      if (!result.success) {
        throw new Error(result.message || 'Erro ao gerar pré-venda.');
      }
      await deleteDraft(draft.id);
      setFeedback({ type: 'success', text: `Pré-venda #${draft.display_id} gerada com sucesso! 🎉` });
      resetSale();
    } catch (error: any) {
      if (draft) {
        await updateDraft({
          ...draft,
          status: 'ERROR',
          retry_count: (draft.retry_count ?? 0) + 1,
          error_message: String(error?.message || error),
        });
      }
      setFeedback({ type: 'error', text: error?.message || 'Erro ao gerar pré-venda.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCreateSales) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-8">
        <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-10 shadow-xl text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50">
            <XCircle className="h-8 w-8 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Acesso negado</h1>
          <p className="mt-3 text-sm text-slate-500">Seu perfil não possui permissão para criar vendas no balcão.</p>
          <div className="mt-8 flex justify-center gap-3">
            <button onClick={onBackToApp} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors">Voltar ao app</button>
            <button onClick={onLogout} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Sair</button>
          </div>
        </div>
      </div>
    );
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 text-slate-900">
      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes popIn { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes pulse-ring { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); } 70% { box-shadow: 0 0 0 8px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
        .cart-badge { animation: popIn 0.3s ease-out; }
        .product-added { animation: pulse-ring 1s ease-out; }
        .section-card { background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); }
      `}</style>

      {/* Toast notification */}
      {feedback && (
        <Toast type={feedback.type} text={feedback.text} onClose={() => setFeedback(null)} />
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-md">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-700">Venda Balcão</span>
                {storeInfo?.store_code && (
                  <span className="text-xs text-slate-400">Loja {storeInfo.store_code}</span>
                )}
              </div>
              <h1 className="truncate text-base font-bold text-slate-900 leading-tight">{storeInfo?.trade_name || storeInfo?.legal_name || 'Loja ativa'}</h1>
            </div>
          </div>

          {/* Cart summary in header */}
          <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 md:flex">
            <div className="relative">
              <ShoppingCart className="h-5 w-5 text-slate-500" />
              {cart.length > 0 && (
                <span key={cart.length} className="cart-badge absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                  {cart.length}
                </span>
              )}
            </div>
            <div className="text-sm">
              <span className="text-slate-500">{cart.length} {cart.length === 1 ? 'item' : 'itens'} • </span>
              <span className="font-bold text-slate-900">{formatMoney(cartTotal)}</span>
              {cartDiscount > 0 && <span className="ml-1 text-emerald-600 text-xs">(-{formatMoney(cartDiscount)})</span>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 sm:flex">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                {getInitials(currentUser)}
              </div>
              <span className="text-xs font-medium text-slate-700 max-w-[120px] truncate">{currentUser}</span>
              {sellerCode && <span className="text-xs text-slate-400">({sellerCode})</span>}
            </div>
            <button onClick={onBackToApp} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">Voltar</button>
            <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm">
              <LogOut className="h-3.5 w-3.5" />Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 md:px-6">
        {loading ? (
          <div className="flex h-[70vh] items-center justify-center">
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-white/90 px-10 py-10 shadow-xl backdrop-blur">
              <div className="relative">
                <div className="h-14 w-14 rounded-full border-4 border-blue-100"></div>
                <div className="absolute inset-0 h-14 w-14 animate-spin rounded-full border-4 border-transparent border-t-blue-600"></div>
              </div>
              <div className="text-center">
                <div className="font-semibold text-slate-800">Carregando dados</div>
                <div className="text-sm text-slate-500">Aguarde um momento...</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[1.1fr_1.4fr_1fr]">

            {/* ── COLUNA 1: CLIENTES ── */}
            <section className="section-card flex flex-col rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 shadow-md">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Cliente</h2>
                  <p className="text-xs text-slate-500">{filteredCustomers.length} disponíveis</p>
                </div>
                {selectedCustomer && (
                  <div className="ml-auto flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-1.5">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white flex-shrink-0">
                      {getInitials(selectedCustomer.name)}
                    </div>
                    <span className="max-w-[80px] truncate text-xs font-semibold text-blue-800">{selectedCustomer.name}</span>
                  </div>
                )}
              </div>

              <div className="p-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder="Nome, código, CPF/CNPJ ou telefone"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5" style={{ maxHeight: 540 }}>
                {filteredCustomers.map((customer) => {
                  const active = selectedCustomer?.id === customer.id;
                  const isDelinquent = (customer as any).inadimplente || (customer as any).delinquent;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelectedCustomer(customer)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-all duration-150 ${
                        active
                          ? 'border-blue-400 bg-blue-50 shadow-sm ring-1 ring-blue-200'
                          : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {getInitials(customer.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 text-sm truncate">{customer.fantasyName || customer.name}</span>
                            {customer.id === WALK_IN_CUSTOMER_ID && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">Padrão</span>
                            )}
                            {isDelinquent && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-700">⚠ Inadimplente</span>
                            )}
                          </div>
                          {customer.fantasyName && customer.fantasyName !== customer.name && (
                            <div className="text-[11px] text-slate-400 truncate">{customer.name}</div>
                          )}
                          <div className="text-[11px] text-slate-400">{customer.document || 'Sem documento'}{customer.phone ? ` • ${customer.phone}` : ''}</div>
                        </div>
                        {active && <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0"></div>}
                      </div>
                    </button>
                  );
                })}
                {filteredCustomers.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-10 text-center">
                    <User className="h-8 w-8 text-slate-300" />
                    <p className="text-sm text-slate-400">Nenhum cliente encontrado</p>
                  </div>
                )}
              </div>
            </section>

            {/* ── COLUNA 2: PRODUTOS ── */}
            <section className="section-card flex flex-col rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 shadow-md">
                  <Store className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Produtos</h2>
                  <p className="text-xs text-slate-500">{filteredProducts.length} {filteredProducts.length === products.length ? 'disponíveis' : `de ${products.length}`}</p>
                </div>
              </div>

              <div className="p-4">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    ref={productSearchRef}
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Código, descrição, PLU, referência ou código de barras"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-4 text-sm outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1.1fr_2fr_0.7fr_0.7fr_1fr_80px] gap-2 border-b border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Código</span>
                  <span>Produto</span>
                  <span>Un.</span>
                  <span>Estoque</span>
                  <span>Preço</span>
                  <span className="text-right">Ação</span>
                </div>

                <div className="overflow-y-auto" style={{ maxHeight: 540 }}>
                  {filteredProducts.map((product) => {
                    const inCart = cart.find((item) => item.id === product.id);
                    const lowStock = product.stock !== undefined && product.stock <= 5 && product.stock > 0;
                    const outOfStock = product.stock !== undefined && product.stock <= 0;
                    const isJustAdded = lastAddedId === product.id;
                    return (
                      <div
                        key={product.id}
                        className={`grid grid-cols-[1.1fr_2fr_0.7fr_0.7fr_1fr_80px] gap-2 border-b border-slate-50 px-4 py-2.5 text-sm transition-colors ${
                          isJustAdded ? 'bg-emerald-50' : inCart ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-800 text-xs">{product.id}</div>
                          <div className="text-[10px] text-slate-400">{product.reference || product.barcode || product.plu || ''}</div>
                        </div>
                        <div>
                          <div className="font-medium text-slate-900 text-xs leading-tight">{product.name}</div>
                          {product.category && (
                            <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getCategoryColor(product.category)}`}>
                              {product.category}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 self-center">{product.unit}</div>
                        <div className={`text-xs font-semibold self-center ${outOfStock ? 'text-rose-600' : lowStock ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {product.stock ?? '–'}
                          {lowStock && <span className="ml-0.5 text-[9px]">⚠</span>}
                        </div>
                        <div className="text-xs font-bold text-slate-900 self-center">{formatMoney(product.price)}</div>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={() => addProductToCart(product)}
                            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                              isJustAdded
                                ? 'product-added bg-emerald-500 text-white scale-95'
                                : inCart
                                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
                            }`}
                          >
                            <Plus className="h-3 w-3" />
                            {inCart ? `+${inCart.quantity}` : 'Add'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <Package className="h-8 w-8 text-slate-300" />
                      <p className="text-sm text-slate-400">Nenhum produto encontrado</p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ── COLUNA 3: CARRINHO E FINALIZAÇÃO ── */}
            <section className="section-card flex flex-col rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
              {/* Cart header */}
              <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-orange-50 to-amber-50 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 shadow-md">
                  <ShoppingCart className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-bold text-slate-900">Carrinho</h2>
                  <p className="text-xs text-slate-500">{cart.length} {cart.length === 1 ? 'produto' : 'produtos'} • {cartItemCount} {cartItemCount === 1 ? 'unidade' : 'unidades'}</p>
                </div>
                {cart.length > 0 && (
                  <span className="rounded-xl bg-orange-100 px-2.5 py-1 text-sm font-bold text-orange-700">{formatMoney(cartTotal)}</span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-3" style={{ maxHeight: 320 }}>
                {/* Stock violation warning */}
                {stockViolation && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                    <div className="flex items-center gap-2 font-semibold text-xs">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      Estoque insuficiente: {stockViolation.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-amber-700">Disponível: {stockViolation.stock} • No carrinho: {stockViolation.quantity}</div>
                  </div>
                )}

                {cart.map((item) => {
                  const discountValue = Math.max((item.basePrice ?? item.price) - item.price, 0) * item.quantity;
                  const hasDiscount = discountValue > 0;
                  return (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900 text-sm truncate">{item.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-slate-400">{item.id}</span>
                            {item.stock !== undefined && (
                              <span className={`text-[10px] font-medium ${item.stock <= 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                Estoque: {item.stock}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400">{item.unit}</span>
                          </div>
                        </div>
                        <button type="button" onClick={() => updateQuantity(item.id, 0)} className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500 transition-colors flex-shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-2.5 grid grid-cols-[auto_1fr] gap-2">
                        {/* Quantity control */}
                        <div className="inline-flex items-center rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                          <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-100 transition-colors">
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <input
                            value={item.quantity}
                            onChange={(event) => updateQuantity(item.id, Number(event.target.value || 0))}
                            className="w-12 border-x border-slate-200 bg-slate-50 px-1 py-2 text-center text-sm font-bold outline-none"
                          />
                          <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-2.5 py-2 text-slate-500 hover:bg-slate-100 transition-colors">
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Price */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Preço unit.</label>
                            <div className="text-xs font-bold text-slate-900">{formatMoney(item.price * item.quantity)}</div>
                          </div>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.price}
                            onChange={(event) => updatePrice(item.id, Number(event.target.value || 0))}
                            disabled={!canEditSales}
                            className={`w-full rounded-xl border px-2.5 py-1.5 text-sm outline-none transition ${canEditSales ? 'border-slate-300 bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100' : 'border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'}`}
                          />
                          {hasDiscount ? (
                            <div className="mt-0.5 flex items-center gap-1 text-[10px] text-emerald-600">
                              <TrendingDown className="h-2.5 w-2.5" />
                              <span>Desconto {formatMoney(discountValue)} (tabela: {formatMoney(item.basePrice ?? item.price)})</span>
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[10px] text-slate-400">Tabela: {formatMoney(item.basePrice ?? item.price)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {cart.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                      <ShoppingCart className="h-6 w-6 text-slate-300" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-400 text-sm">Carrinho vazio</p>
                      <p className="text-xs text-slate-300">Adicione produtos ao lado</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer selected info */}
              <div className="mx-4 mt-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                    {selectedCustomer ? getInitials(selectedCustomer.name) : '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Cliente</div>
                    <div className="truncate text-xs font-semibold text-slate-800">{selectedCustomer?.name || 'Nenhum selecionado'}</div>
                    <div className="text-[10px] text-slate-400">{selectedCustomer?.document || 'Consumidor padrão'}</div>
                  </div>
                </div>
              </div>

              {/* Payment & shipping */}
              <div className="space-y-3 px-4 pt-3 pb-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Pagamento</label>
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    >
                      {PAYMENT_METHODS.map((option) => (
                        <option key={option.value} value={option.value}>{option.icon} {option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Frete</label>
                    <select
                      value={shippingMethod}
                      onChange={(event) => setShippingMethod(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
                    >
                      {SHIPPING_METHODS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {isBoleto && (
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Plano de pagamento</label>
                    <select
                      value={selectedPlanCode}
                      onChange={(event) => setSelectedPlanCode(event.target.value)}
                      disabled={planLoading}
                      className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium outline-none focus:border-blue-400 disabled:bg-slate-100 transition"
                    >
                      <option value="">Selecione</option>
                      {paymentPlans.map((plan) => (
                        <option key={plan.code} value={plan.code}>{plan.description || plan.code}</option>
                      ))}
                    </select>
                    {planLoading && (
                      <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" />Carregando planos...
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Observações</label>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={2}
                    placeholder="Alguma observação para este pedido?"
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition resize-none"
                  />
                </div>
              </div>

              {/* Total box */}
              <div className="mx-4 mb-3 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-4 text-white shadow-lg">
                {cartDiscount > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Subtotal</span>
                      <span>{formatMoney(cartSubtotal)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-emerald-400">
                      <span className="flex items-center gap-1"><Tag className="h-3 w-3" />Desconto</span>
                      <span>-{formatMoney(cartDiscount)}</span>
                    </div>
                    <div className="my-2 border-t border-slate-700/60"></div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-300">Total</span>
                  <span className="text-2xl font-extrabold tracking-tight">{formatMoney(cartTotal)}</span>
                </div>
                {cart.length > 0 && (
                  <div className="mt-2 text-[10px] text-slate-500">{cartItemCount} {cartItemCount === 1 ? 'unidade' : 'unidades'} em {cart.length} {cart.length === 1 ? 'produto' : 'produtos'}</div>
                )}
              </div>

              {/* Action buttons */}
              <div className="grid gap-2 px-4 pb-4">
                <button
                  type="button"
                  onClick={handleFinalizeSale}
                  disabled={submitting || cart.length === 0 || !!stockViolation}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/30 hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none transition-all active:scale-[0.98]"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Gerar pré-venda
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={submitting || cart.length === 0}
                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                  >
                    <Save className="h-3.5 w-3.5" />Salvar rascunho
                  </button>
                  <button
                    type="button"
                    onClick={resetSale}
                    className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />Limpar
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
