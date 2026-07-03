import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, LogOut, Minus, Plus, RotateCcw, Save, Search, ShoppingCart, Store, Trash2, User, Wallet } from 'lucide-react';
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
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartao' },
  { value: 'boleto', label: 'Boleto' },
];

const SHIPPING_METHODS = [
  { value: 'retirada', label: 'Retirada' },
  { value: 'entrega_propria', label: 'Entrega propria' },
  { value: 'transportadora', label: 'Transportadora' },
  { value: 'sem_frete', label: 'Sem frete' },
];

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
    return () => {
      active = false;
    };
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
      .finally(() => {
        if (active) setPlanLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCustomer?.id, isBoleto, cartTotal]);

  const addProductToCart = (product: Product) => {
    setFeedback(null);
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
    if (!canCreateSales) return 'Usuario sem permissao para criar vendas.';
    if (cart.length === 0) return 'Adicione pelo menos um item ao carrinho.';
    if (!selectedCustomer) return 'Selecione um cliente.';
    if (isBoleto && !selectedPlan) return 'Selecione um plano de pagamento para boleto.';
    if (selectedPlan && Number(selectedPlan.minValue || 0) > 0 && cartTotal < Number(selectedPlan.minValue || 0)) {
      return `Valor minimo do plano: ${formatMoney(Number(selectedPlan.minValue || 0))}.`;
    }
    if (stockViolation) {
      return `Estoque insuficiente para ${stockViolation.name}. Disponivel: ${stockViolation.stock}.`;
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
        throw new Error(result.message || 'Erro ao gerar pre-venda.');
      }
      await deleteDraft(draft.id);
      setFeedback({ type: 'success', text: `Pre-venda #${draft.display_id} gerada com sucesso.` });
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
      setFeedback({ type: 'error', text: error?.message || 'Erro ao gerar pre-venda.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (!canCreateSales) {
    return (
      <div className="min-h-screen bg-slate-100 p-8 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-rose-700">Acesso negado</h1>
          <p className="mt-3 text-sm text-slate-600">Seu perfil atual nao possui permissao para criar vendas no balcao.</p>
          <div className="mt-6 flex gap-3">
            <button onClick={onBackToApp} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Voltar ao app</button>
            <button onClick={onLogout} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Sair</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe,_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">Venda de Balcao</p>
            <h1 className="truncate text-2xl font-bold text-slate-900">{storeInfo?.trade_name || storeInfo?.legal_name || 'Loja ativa'}</h1>
            <p className="text-sm text-slate-500">Loja {storeInfo?.store_code || storeInfo?.codigo || storeInfo?.id || '-'} • Vendedor {currentUser || '-'}{sellerCode ? ` (${sellerCode})` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onBackToApp} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Voltar ao app</button>
            <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"><LogOut className="h-4 w-4" />Sair</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {feedback && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : feedback.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
            {feedback.text}
          </div>
        )}

        {loading ? (
          <div className="flex h-[60vh] items-center justify-center">
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-slate-700 shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span>Carregando dados da venda...</span>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_1.3fr_1fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-blue-700" />
                <h2 className="text-lg font-semibold">Cliente</h2>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Nome, codigo, CPF/CNPJ ou telefone"
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white"
                />
              </label>
              <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {filteredCustomers.map((customer) => {
                  const active = selectedCustomer?.id === customer.id;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelectedCustomer(customer)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{customer.name}</div>
                          <div className="text-xs text-slate-500">{customer.id} • {customer.document || 'Sem documento'}</div>
                        </div>
                        {customer.id === WALK_IN_CUSTOMER_ID && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Consumidor padrao</span>}
                      </div>
                      {(customer.phone || customer.fantasyName) && (
                        <div className="mt-2 text-xs text-slate-500">{customer.fantasyName || customer.phone}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <Store className="h-5 w-5 text-emerald-700" />
                <h2 className="text-lg font-semibold">Produtos</h2>
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Codigo, descricao, PLU, referencia ou codigo de barras"
                  className="w-full rounded-2xl border border-slate-300 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-emerald-500 focus:bg-white"
                />
              </label>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[1.1fr_2.2fr_0.8fr_0.8fr_1fr_90px] gap-3 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>Codigo</span>
                  <span>Descricao</span>
                  <span>Un.</span>
                  <span>Estoque</span>
                  <span>Preco</span>
                  <span className="text-right">Acao</span>
                </div>
                <div className="max-h-[560px] overflow-y-auto bg-white">
                  {filteredProducts.map((product) => (
                    <div key={product.id} className="grid grid-cols-[1.1fr_2.2fr_0.8fr_0.8fr_1fr_90px] gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700 first:border-t-0">
                      <div>
                        <div className="font-semibold text-slate-900">{product.id}</div>
                        <div className="text-[11px] text-slate-400">{product.reference || product.barcode || product.plu || '-'}</div>
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{product.name}</div>
                        <div className="text-xs text-slate-500">{product.description || product.category || '-'}</div>
                      </div>
                      <div>{product.unit}</div>
                      <div className={product.stock > 0 ? 'text-emerald-700' : 'text-rose-700'}>{product.stock}</div>
                      <div className="font-semibold">{formatMoney(product.price)}</div>
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => addProductToCart(product)}
                          className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          <Plus className="h-3.5 w-3.5" /> Adicionar
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="px-4 py-10 text-center text-sm text-slate-500">Nenhum produto encontrado.</div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-orange-600" />
                <h2 className="text-lg font-semibold">Carrinho e finalizacao</h2>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cliente selecionado</div>
                <div className="mt-1 font-semibold text-slate-900">{selectedCustomer?.name || 'Nenhum cliente selecionado'}</div>
                <div className="text-xs text-slate-500">{selectedCustomer?.document || 'Consumidor padrao'}</div>
              </div>

              {stockViolation && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 h-4 w-4" />Estoque insuficiente para {stockViolation.name}</div>
                  <div className="mt-1 text-xs">Disponivel: {stockViolation.stock} • Quantidade no carrinho: {stockViolation.quantity}</div>
                </div>
              )}

              <div className="mt-4 max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">{item.name}</div>
                        <div className="text-xs text-slate-500">{item.id} • Estoque {item.stock} • {item.unit}</div>
                      </div>
                      <button type="button" onClick={() => updateQuantity(item.id, 0)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-[auto_1fr] gap-3">
                      <div className="inline-flex items-center rounded-xl border border-slate-200">
                        <button type="button" onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-3 py-2 text-slate-600"><Minus className="h-4 w-4" /></button>
                        <input
                          value={item.quantity}
                          onChange={(event) => updateQuantity(item.id, Number(event.target.value || 0))}
                          className="w-16 border-x border-slate-200 bg-slate-50 px-2 py-2 text-center text-sm font-semibold outline-none"
                        />
                        <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-3 py-2 text-slate-600"><Plus className="h-4 w-4" /></button>
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preco unitario</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(event) => updatePrice(item.id, Number(event.target.value || 0))}
                          disabled={!canEditSales}
                          className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${canEditSales ? 'border-slate-300 bg-white focus:border-blue-500' : 'border-slate-200 bg-slate-100 text-slate-500'}`}
                        />
                        <div className="mt-1 text-[11px] text-slate-500">Tabela: {formatMoney(item.basePrice ?? item.price)}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {cart.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">Carrinho vazio.</div>}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Forma de pagamento</label>
                  <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500">
                    {PAYMENT_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tipo de frete</label>
                  <select value={shippingMethod} onChange={(event) => setShippingMethod(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500">
                    {SHIPPING_METHODS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                {isBoleto && (
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plano de pagamento</label>
                    <select value={selectedPlanCode} onChange={(event) => setSelectedPlanCode(event.target.value)} disabled={planLoading} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100">
                      <option value="">Selecione</option>
                      {paymentPlans.map((plan) => (
                        <option key={plan.code} value={plan.code}>{plan.description || plan.code}</option>
                      ))}
                    </select>
                    {planLoading && <div className="mt-2 text-xs text-slate-500">Carregando planos...</div>}
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observacoes</label>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500" />
                </div>
              </div>

              <div className="mt-5 rounded-2xl bg-slate-950 px-4 py-4 text-white">
                <div className="flex items-center justify-between text-sm text-slate-300"><span>Subtotal</span><span>{formatMoney(cartSubtotal)}</span></div>
                <div className="mt-2 flex items-center justify-between text-sm text-slate-300"><span>Desconto</span><span>{formatMoney(cartDiscount)}</span></div>
                <div className="mt-3 flex items-center justify-between text-lg font-bold"><span>Total</span><span>{formatMoney(cartTotal)}</span></div>
              </div>

              <div className="mt-5 grid gap-3">
                <button type="button" onClick={handleSaveDraft} disabled={submitting || cart.length === 0} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  <Save className="h-4 w-4" />Salvar rascunho
                </button>
                <button type="button" onClick={handleFinalizeSale} disabled={submitting || cart.length === 0} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}Gerar pre-venda
                </button>
                <button type="button" onClick={resetSale} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                  <RotateCcw className="h-4 w-4" />Limpar venda
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};
