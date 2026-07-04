
import React, { useState, useEffect, useMemo } from 'react';
import { Product, CartItem, Order, Customer, PaymentPlan, EnumOption } from '../types';
import { Trash2, Plus, Minus, ShoppingCart, User, Store, Save, Search, AlertTriangle, X, ArrowRight, Delete, Check, CloudOff, Tag, Share2, CreditCard, Loader2, CheckCircle, QrCode, Banknote, FileText, Truck, Package } from 'lucide-react';
import { apiService } from '../services/api';
import { dbService } from '../services/db';
import { deleteDraft, saveDraft, updateDraft } from '../src/services/draftDB';
import { DraftStatus, OrderDraft, OrderDraftItem } from '../src/types/orderDraft';
import { useEnums } from '../contexts/EnumContext';

type IconType = React.ComponentType<{ className?: string }>;

const PAYMENT_ICON_MAP: Record<string, IconType> = {
  pix: QrCode,
  dinheiro: Banknote,
  cartao: CreditCard,
  boleto: FileText,
  default: FileText,
};

const SHIPPING_ICON_MAP: Record<string, IconType> = {
  retirada: Store,
  entrega_propria: Truck,
  transportadora: Package,
  sem_frete: Package,
  default: Store,
};

const FALLBACK_PAYMENT_METHODS: Array<EnumOption & { icon: IconType }> = [
  { value: 'pix', label: 'PIX', icon: QrCode },
  { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
  { value: 'cartao', label: 'Cartão', icon: CreditCard },
  { value: 'boleto', label: 'Boleto', icon: FileText },
];

const FALLBACK_SHIPPING_METHODS: Array<EnumOption & { icon: IconType }> = [
  { value: 'cif', label: 'CIF', icon: Package },
  { value: 'fob', label: 'FOB', icon: Package },
  { value: 'retirada', label: 'Retirada', icon: Store },
  { value: 'sem_frete', label: 'Sem frete', icon: Package },
];

const buildSelectOptions = (
  rawOptions: Array<EnumOption & { icon?: IconType }>,
  fallback: Array<EnumOption & { icon: IconType }>,
  iconMap: Record<string, IconType>,
  defaultIcon: IconType
) => {
  const source = rawOptions.length > 0 ? rawOptions : fallback;
  return source.map((option) => {
    const normalizedValue = option.value.toLowerCase();
    const icon = iconMap[normalizedValue] || option.icon || defaultIcon;
    return {
      value: option.value,
      label: option.label,
      icon,
    };
  });
};

interface CartProps {
  cart: CartItem[];
  onUpdateQuantity: (id: string, newQuantity: number) => void;
  onUpdatePrice?: (id: string, newPrice: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  draftToEdit?: OrderDraft | null;
  onClearDraft?: () => void;
  onAddToCart?: (product: Product) => void;
}

const createOrderUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `order-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

// --- KEYPAD COMPONENT ---
interface NumericKeypadModalProps {
  title: string;
  initialValue: number;
  itemName: string;
  unit: string;
  referenceValue?: number;
  onConfirm: (val: number) => void;
  onClose: () => void;
}

const NumericKeypadModal: React.FC<NumericKeypadModalProps> = ({ title, initialValue, itemName, unit, referenceValue, onConfirm, onClose }) => {
  // Converte para string com vírgula para edição
  const [displayValue, setDisplayValue] = useState(initialValue.toString().replace('.', ','));
  const [hasTyped, setHasTyped] = useState(false); // Novo estado: sabe se o usuário começou a digitar
  const normalizedValue = displayValue.replace(',', '.');
  const previewValue = Number.parseFloat(normalizedValue);
  const hasReferenceDiscount = typeof referenceValue === 'number' && Number.isFinite(referenceValue) && referenceValue > 0 && Number.isFinite(previewValue) && previewValue < referenceValue;
  const discountAmount = hasReferenceDiscount ? referenceValue - previewValue : 0;
  const discountPercent = hasReferenceDiscount ? (discountAmount / referenceValue) * 100 : 0;

  const handleNumber = (num: string) => {
    setDisplayValue(prev => {
      // Se for a primeira tecla digitada, substitui o valor inicial (comportamento de ATM)
      if (!hasTyped) {
          setHasTyped(true);
          if (num === ',') return '0,';
          return num;
      }
      
      // Se for 0 apenas e digitar outro numero, substitui
      if (prev === '0' && num !== ',') {
          return num;
      }
      // Evita múltiplas vírgulas
      if (num === ',' && prev.includes(',')) return prev;
      
      // Limite de caracteres para segurança
      if (prev.length > 8) return prev;
      
      return prev + num;
    });
  };

  const handleBackspace = () => {
    setHasTyped(true); // Considera como interação
    setDisplayValue(prev => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    setHasTyped(true);
    setDisplayValue('0');
  };
  
  const handleRemoveItem = () => {
      // Confirmação com 0 remove o item na lógica do pai
      onConfirm(0);
  };

  const handleConfirm = () => {
    // Converte de volta para float (pt-BR 1,5 -> 1.5)
    const normalized = displayValue.replace(',', '.');
    const val = parseFloat(normalized);
    
    // Aceita 0 para permitir remoção
    if (!isNaN(val)) {
      onConfirm(val);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-xs bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div>
             <h3 className="font-bold text-lg">{title}</h3>
             <p className="text-xs text-slate-400 truncate max-w-[200px]">{itemName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-white/80 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Display */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-orange-500 rounded-lg overflow-hidden h-16 shadow-inner relative">
            <div className="flex-1 text-right text-3xl font-bold text-slate-800 dark:text-white px-4 tracking-wider z-10">
               {displayValue} <span className="text-sm font-normal text-slate-400 ml-1">{unit}</span>
            </div>
            {!hasTyped && (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 px-1 rounded opacity-70">
                    Digite para substituir
                </div>
            )}
            <button 
                onClick={handleBackspace}
                className="h-full px-4 bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors border-l border-slate-200 dark:border-slate-600 z-20"
            >
                <Delete className="w-6 h-6" />
            </button>
          </div>
          {hasReferenceDiscount && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4" />
                <span>Preço abaixo da tabela</span>
              </div>
              <div className="mt-1">
                Desconto nominal: R$ {discountAmount.toFixed(2)} | Desconto percentual: {discountPercent.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

        {/* Keypad Grid */}
        <div className="p-2 grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-950">
           {[7, 8, 9, 4, 5, 6, 1, 2, 3].map(num => (
             <button
                key={num}
                onClick={() => handleNumber(num.toString())}
                className="h-16 rounded-lg bg-white dark:bg-slate-800 shadow-sm border-b-2 border-slate-200 dark:border-slate-700 text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
             >
                {num}
             </button>
           ))}
           
           {/* Linha Final */}
           <button
              onClick={() => handleNumber(',')}
              className="h-16 rounded-lg bg-slate-200 dark:bg-slate-900 text-2xl font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-800 active:scale-95 transition-all"
           >
              ,
           </button>
           <button
              onClick={() => handleNumber('0')}
              className="h-16 rounded-lg bg-white dark:bg-slate-800 shadow-sm border-b-2 border-slate-200 dark:border-slate-700 text-2xl font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
           >
              0
           </button>
           
           {/* Botão C (Clear) melhorado para Zerar */}
           <button
              onClick={handleClear}
              className="h-16 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 shadow-sm border-b-2 border-red-200 dark:border-red-800 text-xl font-bold flex items-center justify-center hover:bg-red-200 active:scale-95 transition-all"
              title="Zerar"
           >
              C
           </button>
        </div>
        
        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-0 border-t border-slate-200 dark:border-slate-800">
             <button 
                onClick={handleRemoveItem}
                className="py-4 text-sm font-bold text-red-500 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-2 transition-colors border-r border-slate-200 dark:border-slate-800"
            >
                <Trash2 className="w-4 h-4" />
                REMOVER ITEM
            </button>
            <button 
                onClick={handleConfirm}
                className="py-4 text-sm font-bold text-white bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2 transition-colors"
            >
                <Check className="w-5 h-5" />
                CONFIRMAR
            </button>
        </div>
      </div>
    </div>
  );
};

interface SefazData {
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  endereco: string;
  uf: string;
  municipio: string;
}

interface AddCustomerModalProps {
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
}

const normalizeCnpj = (value: string) => value.replace(/\D/g, '');

const isValidCnpj = (value: string) => {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string) => {
    let sum = 0;
    let pos = base.length - 7;
    for (let i = 0; i < base.length; i++) {
      sum += Number(base.charAt(i)) * pos--;
      if (pos < 2) pos = 9;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const base12 = cnpj.substring(0, 12);
  if (calcDigit(base12) !== Number(cnpj.charAt(12))) return false;
  const base13 = cnpj.substring(0, 13);
  return calcDigit(base13) === Number(cnpj.charAt(13));
};

const AddCustomerModal: React.FC<AddCustomerModalProps> = ({ onClose, onSelectCustomer }) => {
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<Customer | null>(null);
  const [sefazData, setSefazData] = useState<SefazData | null>(null);

  const handleConsultar = async () => {
    const normalized = normalizeCnpj(cnpj);
    if (!isValidCnpj(normalized)) {
      setError('CNPJ invalido.');
      setExistingCustomer(null);
      setSefazData(null);
      return;
    }

    setLoading(true);
    setError('');
    setExistingCustomer(null);
    setSefazData(null);

    try {
      const existing = await apiService.getCustomerByCnpj(normalized);
      if (existing) {
        setExistingCustomer(existing);
        return;
      }

      const sefaz = await apiService.lookupSefazByCnpj(normalized);
      setSefazData(sefaz);
    } catch (e: any) {
      setError(e.message || 'Falha na consulta.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExisting = () => {
    if (!existingCustomer) return;
    onSelectCustomer(existingCustomer);
    onClose();
  };

  const handleCreateTemp = async () => {
    if (!sefazData) return;
    setLoading(true);
    setError('');
    try {
      const temp = await apiService.createTempCustomer({
        cnpj: normalizeCnpj(cnpj),
        razaoSocial: sefazData.razaoSocial,
        nomeFantasia: sefazData.nomeFantasia || sefazData.razaoSocial,
        endereco: sefazData.endereco,
        uf: sefazData.uf,
        municipio: sefazData.municipio,
        vendedorId: apiService.getSellerId()
      });
      onSelectCustomer(temp);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Falha ao criar cliente temporario.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">Adicionar Cliente</h3>
            <p className="text-xs text-slate-300">Consulta por CNPJ via API</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full text-white/80 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">CNPJ</label>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="flex-1 p-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
              <button
                onClick={handleConsultar}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Consultar
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded text-sm">
              {error}
            </div>
          )}

          {existingCustomer && (
            <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold">
                <CheckCircle className="w-4 h-4" />
                Cliente ja cadastrado
              </div>
              <div className="mt-2 text-sm text-emerald-900">
                <div><strong>Razao Social:</strong> {existingCustomer.name}</div>
                <div><strong>Codigo:</strong> {existingCustomer.id}</div>
                <div><strong>Vendedor:</strong> {existingCustomer.sellerId || 'Nao informado'}</div>
              </div>
              <button
                onClick={handleSelectExisting}
                className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700"
              >
                Prosseguir com este cliente
              </button>
            </div>
          )}

          {sefazData && (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-sm text-slate-700 font-semibold">Dados SEFAZ</div>
              <div className="mt-2 text-sm text-slate-800 space-y-1">
                <div><strong>Razao Social:</strong> {sefazData.razaoSocial}</div>
                <div><strong>Nome Fantasia:</strong> {sefazData.nomeFantasia}</div>
                <div><strong>Situacao:</strong> {sefazData.situacao}</div>
                <div><strong>Endereco:</strong> {sefazData.endereco}</div>
                <div><strong>UF / Municipio:</strong> {sefazData.uf} / {sefazData.municipio}</div>
              </div>
              <button
                onClick={handleCreateTemp}
                disabled={loading}
                className="mt-3 px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-70"
              >
                Cadastrar temporario
              </button>
            </div>
          )}

          {!existingCustomer && !sefazData && !error && (
            <div className="text-xs text-slate-500">
              Informe o CNPJ e clique em consultar para validar cliente.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const getProductProfit = (productId: string): number => {
  const cleanId = productId.trim().replace('-', '');
  if (cleanId === '0017299') return 4.58;
  if (cleanId === '0138352') return 5.20;
  // Deterministic fallback margin between 4.0% and 12.0%
  const hash = productId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const baseMargin = 4.0 + (hash % 80) / 10;
  return Number(baseMargin.toFixed(2));
};

export const Cart: React.FC<CartProps> = ({ cart, onUpdateQuantity, onUpdatePrice, onRemove, onClear, draftToEdit, onClearDraft, onAddToCart }) => {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [notes, setNotes] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [currentDraft, setCurrentDraft] = useState<OrderDraft | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);

  const [paymentPlans, setPaymentPlans] = useState<PaymentPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<PaymentPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [planValidationError, setPlanValidationError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [shippingMethod, setShippingMethod] = useState('cif');
  const [carrier, setCarrier] = useState('Expresso Log');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  // State para o Modal Keypad
  const [editingItem, setEditingItem] = useState<{ id: string, name: string, quantity: number, unit: string } | null>(null);
  const [editingPrice, setEditingPrice] = useState<{ id: string, name: string, price: number, unit: string, basePrice: number } | null>(null);

  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const { enums } = useEnums();
  const paymentEnumKeys = ['payment_method', 'forma_pagamento', 'paymentMethods'];
  const shippingEnumKeys = ['frete_modalidade', 'shipping_method', 'shippingMethod'];
  const findEnumOptions = (keys: string[]) => {
    for (const key of keys) {
      const entry = enums[key];
      if (entry && entry.length > 0) {
        return entry;
      }
    }
    return [];
  };
  const paymentSelectOptions = useMemo(() => {
    const raw = findEnumOptions(paymentEnumKeys);
    return buildSelectOptions(
      raw,
      FALLBACK_PAYMENT_METHODS,
      PAYMENT_ICON_MAP,
      PAYMENT_ICON_MAP.default
    );
  }, [enums]);
  const shippingSelectOptions = useMemo(() => {
    const raw = findEnumOptions(shippingEnumKeys);
    return buildSelectOptions(
      raw,
      FALLBACK_SHIPPING_METHODS,
      SHIPPING_ICON_MAP,
      SHIPPING_ICON_MAP.default
    );
  }, [enums]);
  const DEFAULT_PAYMENT_METHODS = [
    { value: 'pix', label: 'PIX', icon: QrCode },
    { value: 'dinheiro', label: 'Dinheiro', icon: Banknote },
    { value: 'cartao', label: 'Cartão', icon: CreditCard },
    { value: 'boleto', label: 'Boleto', icon: FileText },
  ];
  const DEFAULT_SHIPPING_METHODS = [
    { value: 'retirada', label: 'Retirada', icon: Store },
    { value: 'entrega_propria', label: 'Entrega Própria', icon: Truck },
    { value: 'transportadora', label: 'Transportadora', icon: Package },
    { value: 'sem_frete', label: 'Sem frete', icon: Package },
  ];
  const isBoleto = paymentMethod === 'boleto';
  const paymentLabel = paymentSelectOptions.find(option => option.value === paymentMethod)?.label || '';
  const shippingLabel = shippingSelectOptions.find(option => option.value === shippingMethod)?.label || '';
  const formatPlanLabel = (plan: PaymentPlan) => {
    let base = plan.description || plan.code || 'Plano';
    if (plan.document === 'BOLETO' && !/boleto/i.test(base)) {
      base = `Boleto ${base}`.trim();
    }
    if (plan.document === 'BOLETO' && plan.daysFirstInstallment && !/\d/.test(base)) {
      base = `${base} ${plan.daysFirstInstallment} dias`;
    }
    if (plan.document === 'BOLETO' && plan.daysFirstInstallment && !/dias/i.test(base)) {
      const numbers = base.match(/\d+/g) || [];
      const hasMultiple = base.includes('/') || numbers.length > 1;
      if (!hasMultiple && numbers.length === 1) {
        base = `${base} dias`;
      }
    }
    const suffix = `${plan.installments || 1}x`;
    return `${base} (${suffix})`;
  };
  const formatMoney = (value?: number) => {
    const numeric = Number(value || 0);
    return `R$ ${numeric.toFixed(2)}`;
  };
  const buildPaymentSchedule = (plan: PaymentPlan) => {
    const daysFirst = Number(plan.daysFirstInstallment || 0);
    const interval = Number(plan.daysBetweenInstallments || 0);
    const count = Math.max(1, Number(plan.installments || 1));
    if (!Number.isFinite(daysFirst) || daysFirst <= 0) return [];
    const base = new Date();
    const dates: Date[] = [];
    for (let i = 0; i < count; i += 1) {
      const offset = daysFirst + (i > 0 ? interval * i : 0);
      const due = new Date(base);
      due.setDate(due.getDate() + offset);
      dates.push(due);
    }
    return dates;
  };
  const paymentSchedule = useMemo(() => {
    if (!isBoleto || !selectedPlan) return [];
    return buildPaymentSchedule(selectedPlan);
  }, [isBoleto, selectedPlan]);

  useEffect(() => {
      apiService.getCustomers().then(apiData => {
          setCustomers(apiData);
          if (!selectedCustomer) {
             const defaultCus = apiData.find(c => c.id === '0');
             if (defaultCus) setSelectedCustomer(defaultCus);
          }
      });
  }, []);

  useEffect(() => {
    if (!draftToEdit) {
      setCurrentDraft(null);
      setPendingCustomerId(null);
      return;
    }
    setCurrentDraft(draftToEdit);
    setNotes(draftToEdit.notes || '');
    setPaymentMethod(draftToEdit.payment_method || 'pix');
    setShippingMethod(draftToEdit.shipping_method || 'cif');
    setCarrier(draftToEdit.carrier || 'Expresso Log');
    setLastOrderNumber(draftToEdit.display_id ?? null);
    setPendingCustomerId(draftToEdit.cliente_id || null);
  }, [draftToEdit]);

  useEffect(() => {
    if (!pendingCustomerId) return;
    if (customers.length === 0) return;
    const customer = customers.find((c) => c.id === pendingCustomerId);
    if (customer) {
      setSelectedCustomer(customer);
    } else if (draftToEdit && draftToEdit.cliente_id === pendingCustomerId) {
      setSelectedCustomer({
        id: draftToEdit.cliente_id,
        name: draftToEdit.cliente_nome || draftToEdit.cliente_id,
        fantasyName: '',
        document: draftToEdit.cliente_documento || '',
        type: draftToEdit.cliente_tipo || 'NORMAL',
        address: '',
        addressNumber: '',
        neighborhood: '',
        city: '',
        state: '',
        zipCode: '',
        phone: '',
        email: '',
        origin: 'CLONADO_NFE',
        sellerId: apiService.getSellerId() || '',
        sellerName: apiService.getUsername() || '',
        lastSaleDate: '',
        lastSaleValue: 0,
      });
    }
    setPendingCustomerId(null);
  }, [pendingCustomerId, customers, draftToEdit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowProductSearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!showProductSearch) return;
    const fetchResults = async () => {
      setSearchLoading(true);
      try {
        const data = await apiService.getProducts(1, 20, productSearchTerm);
        setSearchResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setSearchLoading(false);
      }
    };
    const delayDebounceFn = setTimeout(fetchResults, productSearchTerm ? 300 : 0);
    return () => clearTimeout(delayDebounceFn);
  }, [productSearchTerm, showProductSearch]);

  useEffect(() => {
      if (!selectedCustomer) return;

      if (!isBoleto) {
          setPlanLoading(false);
          setPlanError('');
          setPlanValidationError('');
          setPaymentPlans([]);
          setSelectedPlan(null);
          return;
      }

      let isActive = true;
      setPlanLoading(true);
      setPlanError('');
      setPaymentPlans([]);
      setSelectedPlan(null);

      apiService.getPaymentPlansForCustomer(selectedCustomer.id, total)
        .then((response) => {
            if (!isActive) return;
            const data = response.plans;
            const planosDisponiveis = data.filter((plan) => plan.disponivel === true || plan.disponivel === undefined || plan.disponivel === null);
            console.log('Planos recebidos:', data);
            console.log('Planos disponíveis:', planosDisponiveis);
            const shouldShowError = response.total === 0 || planosDisponiveis.length === 0;
            if (shouldShowError) {
                setPaymentPlans([]);
                setSelectedPlan(null);
                setPlanError('Cliente sem plano de pagamento boleto cadastrado.');
            } else {
                setPlanError('');
                setPaymentPlans(planosDisponiveis);
                setSelectedPlan(planosDisponiveis[0]);
            }
        })
        .catch((e: any) => {
            if (!isActive) return;
            setPlanError(e.message || 'Erro ao buscar planos de pagamento.');
        })
        .finally(() => {
            if (!isActive) return;
            setPlanLoading(false);
        });

      return () => {
          isActive = false;
      };
  }, [selectedCustomer?.id, isBoleto, total]);

  useEffect(() => {
      if (!isBoleto || !selectedPlan) {
          setPlanValidationError('');
          return;
      }
      const minValue = Number(selectedPlan.minValue || 0);
      if (minValue > 0 && total < minValue) {
          setPlanValidationError(`Pedido abaixo do valor mínimo do plano (${formatMoney(minValue)}).`);
          return;
      }
      const daysFirst = Number(selectedPlan.daysFirstInstallment || 0);
      const installments = Number(selectedPlan.installments || 0);
      const interval = Number(selectedPlan.daysBetweenInstallments || 0);
      if (daysFirst <= 0 || installments <= 0 || (installments > 1 && interval <= 0)) {
          setPlanValidationError('Plano boleto incompleto. Verifique dias e parcelas.');
          return;
      }
      setPlanValidationError('');
  }, [isBoleto, selectedPlan, total]);

  const validateOrderForm = (): boolean => {
    if (cart.length === 0) {
      alert('O pedido precisa ter pelo menos um item.');
      return false;
    }
    if (!selectedCustomer) {
      alert('Por favor, selecione um cliente para o pedido.');
      return false;
    }
    if (!paymentLabel) {
      alert('Selecione uma forma de pagamento.');
      return false;
    }
    if (!shippingLabel) {
      alert('Selecione um tipo de frete.');
      return false;
    }
    if (isBoleto) {
      if (!selectedPlan) {
        alert('Selecione um plano de pagamento para boleto.');
        return false;
      }
      const minValue = Number(selectedPlan.minValue || 0);
      if (minValue > 0 && total < minValue) {
        alert(`Valor mínimo do plano: ${formatMoney(minValue)}.`);
        return false;
      }
      const daysFirst = Number(selectedPlan.daysFirstInstallment || 0);
      const installments = Number(selectedPlan.installments || 0);
      const interval = Number(selectedPlan.daysBetweenInstallments || 0);
      if (daysFirst <= 0 || installments <= 0 || (installments > 1 && interval <= 0)) {
        alert('Plano boleto incompleto. Verifique dias e parcelas.');
        return false;
      }
    }
    return true;
  };

  const ensureDisplayId = async (): Promise<number> => {
    if (currentDraft?.display_id) {
      return currentDraft.display_id;
    }
    return dbService.generateNextOrderId();
  };

  const buildDraftItem = (item: CartItem): OrderDraftItem => ({
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

  const buildDraftPayload = async (status: DraftStatus): Promise<OrderDraft> => {
    const now = new Date().toISOString();
    const draftId = currentDraft?.id || createOrderUUID();
    const displayId = await ensureDisplayId();
    return {
    id: draftId,
    cliente_id: selectedCustomer?.id || '0',
    cliente_nome: selectedCustomer?.name,
    cliente_documento: selectedCustomer?.document,
    cliente_tipo: selectedCustomer?.type,
      itens: cart.map(buildDraftItem),
      total,
      data_criacao: currentDraft?.data_criacao || now,
      updated_at: now,
      status,
      retry_count: currentDraft?.retry_count ?? 0,
      error_message: undefined,
      display_id: displayId,
      notes,
      carrier,
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

  const buildOrderFromDraft = (draft: OrderDraft): Order => {
    const customer = selectedCustomer;
    const sellerId = customer?.sellerId || apiService.getSellerId() || undefined;
    const sellerName = customer?.sellerName || apiService.getUsername() || undefined;
    const items = draft.itens.map((item) => ({
      id: item.codigo_produto,
      name: item.nome_produto || item.codigo_produto,
      description: item.descricao || '',
      price: item.valor_unitario,
      basePrice: item.base_price ?? item.valor_unitario,
      category: item.category || '',
      stock: 0,
      unit: item.unidade || 'un',
      quantity: item.quantidade,
    }));

    return {
      id: draft.id,
      displayId: draft.display_id,
      items,
      total: draft.total,
      customerId: draft.cliente_id,
      customerName: customer?.name || draft.cliente_nome,
      customerDoc: customer?.document || draft.cliente_documento,
      customerType: customer?.type || draft.cliente_tipo,
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
      sellerId,
      sellerName,
      status: 'pending',
      createdAt: draft.data_criacao,
    };
  };

  const scheduleSuccessReset = () => {
    setTimeout(() => {
      if (document.getElementById('success-view')) {
        handleNewOrder();
      }
    }, 5000);
  };

  const handleSaveDraft = async () => {
    if (!validateOrderForm()) return;
    setSubmitting(true);
    try {
      const draft = await buildDraftPayload('DRAFT');
      await (currentDraft ? updateDraft(draft) : saveDraft(draft));
      setLastOrderNumber(draft.display_id ?? null);
      setSuccess(true);
      setCurrentDraft(null);
      if (onClearDraft) onClearDraft();
      onClear();
      scheduleSuccessReset();
    } catch (error: any) {
      alert(`Erro ao salvar rascunho: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendToERP = async () => {
    if (!validateOrderForm()) return;
    setSubmitting(true);
    let draft: OrderDraft | null = null;
    try {
      draft = await buildDraftPayload('SYNCING');
      await (currentDraft ? updateDraft(draft) : saveDraft(draft));
      const order = buildOrderFromDraft(draft);
      const result = await apiService.submitOrder(order);
      if (!result.success) {
        throw new Error(result.message || 'Erro ao enviar pedido');
      }
      await deleteDraft(draft.id);
      setLastOrderNumber(draft.display_id ?? null);
      setSuccess(true);
      setCurrentDraft(null);
      if (onClearDraft) onClearDraft();
      onClear();
      scheduleSuccessReset();
    } catch (error: any) {
      if (draft) {
        await updateDraft({
          ...draft,
          status: 'ERROR',
          retry_count: (draft.retry_count ?? 0) + 1,
          error_message: String(error?.message || error),
        });
      }
      alert(`Erro ao enviar pedido: ${error?.message || 'Erro desconhecido'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNewOrder = () => {
    setSuccess(false);
    setCurrentDraft(null);
    if (onClearDraft) onClearDraft();
    onClear();
  };

  const shareQuote = () => {
      const lines = cart.map(i => `- ${i.quantity} ${i.unit} ${i.name} (R$ ${(i.price*i.quantity).toFixed(2)})`).join('\n');
      const text = `Orçamento\nCliente: ${selectedCustomer?.name || ''}\nTotal: R$ ${total.toFixed(2)}\n\nItens:\n${lines}`;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
  };

  const confirmClearCart = () => {
      onClear();
      setShowClearConfirm(false);
  };

  // --- TELA DE CONFIRMAÇÃO DE LIMPEZA ---
  if (showClearConfirm) {
      return (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in zoom-in duration-200">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
                  <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Limpar carrinho?</h2>
              <p className="text-slate-600 dark:text-slate-300 mb-8">
                  Isso removerá todos os itens do pedido atual. Essa ação não pode ser desfeita.
              </p>
              <div className="flex flex-col w-full gap-3">
                  <button 
                      onClick={confirmClearCart}
                      className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-sm transition-colors"
                  >
                      Sim, Limpar Tudo
                  </button>
                  <button 
                      onClick={() => setShowClearConfirm(false)}
                      className="w-full py-3 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-semibold rounded-lg transition-colors"
                  >
                      Cancelar
                  </button>
              </div>
          </div>
      );
  }

  // --- TELA DE SUCESSO ---
  if (success) {
    return (
      <div id="success-view" className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in relative">
        <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mb-6">
          <Save className="w-10 h-10 text-orange-600 dark:text-orange-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Pedido #{lastOrderNumber} Salvo!</h2>
        
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800 p-4 rounded-lg my-2 w-full max-w-sm">
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 flex items-center justify-center gap-2">
                <CloudOff className="w-4 h-4" />
                Status: Rascunho salvo
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                O pedido foi guardado no dispositivo. Vá para o menu <strong>"Rascunhos"</strong> para revisar e enviar quando estiver pronto.
            </p>
        </div>
        
        <div className="mt-8 w-full max-w-xs space-y-3">
            <button 
                onClick={handleNewOrder}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
            >
                <span>Novo Pedido Agora</span>
                <ArrowRight className="w-5 h-5" />
            </button>
        </div>
      </div>
    );
  }



  return (
    <div className="flex flex-col h-full bg-[#f4f5f7] dark:bg-slate-950 transition-colors relative">

      {/* MODAIS */}
      {editingItem && (
        <NumericKeypadModal
          title="Quantidade"
          initialValue={editingItem.quantity}
          itemName={editingItem.name}
          unit={editingItem.unit}
          onClose={() => setEditingItem(null)}
          onConfirm={(val) => { onUpdateQuantity(editingItem.id, val); setEditingItem(null); }}
        />
      )}
      {editingPrice && (
        <NumericKeypadModal
          title="Preço Unitário"
          initialValue={editingPrice.price}
          itemName={editingPrice.name}
          unit={editingPrice.unit}
          referenceValue={editingPrice.basePrice}
          onClose={() => setEditingPrice(null)}
          onConfirm={(val) => { if (onUpdatePrice) onUpdatePrice(editingPrice.id, val); setEditingPrice(null); }}
        />
      )}
      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onSelectCustomer={(customer) => { setSelectedCustomer(customer); setShowCustomerSearch(false); }}
        />
      )}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-[#eaecf0] dark:border-slate-700">
            <div className="p-6">
              <h3 className="font-semibold text-base text-[#1a1d21] dark:text-white mb-1">Limpar carrinho?</h3>
              <p className="text-sm text-[#667085] dark:text-slate-400">Todos os itens serão removidos. Esta ação não pode ser desfeita.</p>
            </div>
            <div className="flex gap-2 px-6 pb-6">
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-2 text-sm font-medium text-[#344054] dark:text-slate-300 bg-white dark:bg-slate-700 border border-[#d0d5dd] dark:border-slate-600 rounded-lg hover:bg-[#f9fafb] dark:hover:bg-slate-600 transition-colors">Cancelar</button>
              <button onClick={() => { onClear(); setShowClearConfirm(false); }} className="flex-1 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Limpar tudo</button>
            </div>
          </div>
        </div>
      )}

      {showProductSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-[#eaecf0] dark:border-slate-800 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-200">
            {/* Search Input Header */}
            <div className="p-4 border-b border-[#eaecf0] dark:border-slate-800 flex items-center gap-3 bg-[#f9fafb] dark:bg-slate-800/50">
              <Search className="w-5 h-5 text-[#98a2b3] shrink-0" />
              <input
                type="text"
                placeholder="Buscar produto por nome ou código..."
                value={productSearchTerm}
                onChange={e => setProductSearchTerm(e.target.value)}
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-sm text-[#1a1d21] dark:text-white placeholder:text-[#98a2b3]"
              />
              <button 
                onClick={() => { setShowProductSearch(false); setProductSearchTerm(''); }}
                className="p-1.5 text-[#98a2b3] hover:text-[#667085] hover:bg-slate-100 dark:hover:bg-slate-850 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {searchLoading ? (
                <div className="flex items-center justify-center py-12 text-[#667085]">
                  <Loader2 className="w-6 h-6 animate-spin text-[#155eef] mr-2" />
                  <span className="text-sm">Pesquisando catálogo...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 text-[#667085] text-sm">
                  Nenhum produto encontrado para "{productSearchTerm}"
                </div>
              ) : (
                searchResults.map(prod => {
                  const isInCart = cart.some(item => item.id === prod.id);
                  const cartQty = cart.find(item => item.id === prod.id)?.quantity || 0;
                  return (
                    <div 
                      key={prod.id} 
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-[#f9fafb] dark:hover:bg-slate-800/60 transition-colors border border-transparent hover:border-[#eaecf0] dark:hover:border-slate-800"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-[#eff4ff] dark:bg-blue-900/30 text-[#155eef] dark:text-blue-400 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                            {prod.id}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {prod.category}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-[#1a1d21] dark:text-white mt-1 truncate">
                          {prod.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-[#667085] dark:text-slate-400">
                          <span>Estoque: <strong className={prod.stock <= 0 ? "text-red-500" : "text-emerald-500"}>{prod.stock} {prod.unit.toLowerCase()}</strong></span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-bold text-[#1a1d21] dark:text-white">
                          R$ {prod.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        {onAddToCart && (
                          <button
                            onClick={() => onAddToCart(prod)}
                            className={`p-2 rounded-lg transition-all active:scale-95 ${
                              isInCart 
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' 
                                : 'bg-[#155eef] hover:bg-[#1349c5] text-white'
                            }`}
                            title={isInCart ? `Adicionado (${cartQty}x)` : 'Adicionar ao carrinho'}
                          >
                            {isInCart ? (
                              <div className="flex items-center gap-1 text-xs font-semibold px-1">
                                <Check className="w-3.5 h-3.5" /> {cartQty}x
                              </div>
                            ) : (
                              <Plus className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Keyboard shortcut footer hint */}
            <div className="p-3 border-t border-[#eaecf0] dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-800/30 text-center text-[11px] text-[#667085]">
              Use as setas para navegar e clique no botão para adicionar
            </div>
          </div>
        </div>
      )}

      {/* CARD PRINCIPAL */}
      <div className="w-full max-w-[1440px] mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_rgba(16,24,40,0.08)] border border-[#eaecf0] dark:border-slate-700 my-4 mx-4 md:my-6 md:mx-auto overflow-hidden">

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-7 py-[18px] border-b border-[#eaecf0] dark:border-slate-700">
          <div>
            <p className="text-xs text-[#98a2b3] dark:text-slate-500 mb-1 font-normal">
              Vendas&nbsp;&nbsp;/&nbsp;&nbsp;<span className="text-[#475467] dark:text-slate-400 font-medium">Novo pedido</span>
            </p>
            <div className="flex items-center gap-2.5 mt-0.5">
              <h1 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1a1d21] dark:text-white leading-none">Pedido de venda</h1>
              {lastOrderNumber ? (
                <span className="bg-[#fef6ee] dark:bg-orange-900/30 text-[#b93815] dark:text-orange-400 text-[11px] font-medium px-2.5 py-[3px] rounded-full">
                  Rascunho · #{lastOrderNumber}
                </span>
              ) : (
                <span className="bg-[#f2f4f7] dark:bg-slate-800 text-[#667085] dark:text-slate-400 text-[11px] font-medium px-2.5 py-[3px] rounded-full">
                  Novo
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={submitting || !selectedCustomer || planLoading}
              className="flex items-center gap-1.5 px-[14px] py-2 text-[13px] font-medium text-[#344054] dark:text-slate-300 bg-white dark:bg-slate-800 border border-[#d0d5dd] dark:border-slate-600 rounded-lg hover:bg-[#f9fafb] dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? <div className="w-3.5 h-3.5 border-2 border-[#667085] border-t-transparent rounded-full animate-spin" /> : null}
              Salvar rascunho
            </button>
            <button
              onClick={handleSendToERP}
              disabled={submitting || !selectedCustomer || planLoading}
              className="flex items-center gap-1.5 px-[14px] py-2 text-[13px] font-semibold text-white bg-[#155eef] hover:bg-[#1349c5] rounded-lg shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
              )}
              Fechar pedido
            </button>
          </div>
        </div>

        {/* ── BARRA DE BUSCA ── */}
        <div 
          onClick={() => setShowProductSearch(true)}
          className="mx-7 mt-5 flex items-center gap-2.5 bg-[#f9fafb] dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-[10px] px-3.5 py-2.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
        >
          <Search className="w-4 h-4 text-[#98a2b3] flex-shrink-0" />
          <span className="flex-1 text-[13px] text-[#98a2b3] dark:text-slate-500 select-none">Buscar produto por nome ou código...</span>
          <span className="bg-white dark:bg-slate-700 border border-[#d0d5dd] dark:border-slate-600 rounded-[5px] px-1.5 py-[2px] text-[11px] text-[#667085] dark:text-slate-400 font-normal select-none">⌘K</span>
        </div>

        {/* ── GRID: Conteúdo + Sidebar ── */}
        <div className="px-7 pt-5 pb-0 grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] gap-8">

          {/* ── COLUNA ESQUERDA ── */}
          <div>
            {/* CLIENTE */}
            <p className="text-[12px] font-semibold text-[#667085] dark:text-slate-500 uppercase tracking-[0.03em] mb-3">Cliente</p>

            {!selectedCustomer ? (
              <div className="relative mb-5">
                <button
                  onClick={() => setShowCustomerSearch(!showCustomerSearch)}
                  className="w-full flex items-center gap-3 p-3.5 bg-[#f9fafb] dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-xl text-[#667085] dark:text-slate-400 hover:bg-[#f2f4f7] dark:hover:bg-slate-700 transition-colors text-sm"
                >
                  <div className="w-[38px] h-[38px] rounded-[10px] bg-[#eaecf0] dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-[#98a2b3]" />
                  </div>
                  <span className="text-[14px]">Selecionar cliente...</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAddCustomer(true); }}
                    className="ml-auto text-[11px] text-[#155eef] hover:text-[#1349c5] font-medium px-2 py-1 rounded-md hover:bg-[#eff4ff] dark:hover:bg-blue-900/20 transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Novo
                  </button>
                </button>
                {showCustomerSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 shadow-xl rounded-xl z-20 overflow-hidden">
                    <div className="p-2 border-b border-[#f2f4f7] dark:border-slate-700 flex gap-2">
                      <input type="text" placeholder="Buscar cliente..." autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="flex-1 p-2 border border-[#eaecf0] dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#155eef]" />
                      <button onClick={() => setShowCustomerSearch(false)} className="p-2 text-[#98a2b3] hover:text-[#667085]"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="max-h-52 overflow-y-auto p-1">
                      {customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                        <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustomerSearch(false); setSearchTerm(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-[#f9fafb] dark:hover:bg-slate-700 rounded-lg transition-colors">
                          <div className="text-sm font-medium text-[#1a1d21] dark:text-white">{c.name}</div>
                          <div className="text-xs text-[#667085] dark:text-slate-400">{c.document}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="relative mb-5">
                <div className="flex items-center gap-3 p-[14px] bg-[#f9fafb] dark:bg-slate-800 rounded-xl border border-[#eaecf0] dark:border-slate-700">
                  <div className="w-[38px] h-[38px] rounded-[10px] bg-gradient-to-br from-[#155eef] to-[#7f56d9] flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-semibold text-[14px]">
                      {selectedCustomer.name.slice(0,2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-[#1a1d21] dark:text-white leading-tight">{selectedCustomer.name}</p>
                      {selectedCustomer.type === 'TEMPORARIO' && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">Temp.</span>
                      )}
                    </div>
                    <p className="text-[12px] text-[#667085] dark:text-slate-400 mt-[2px] truncate">
                      {selectedCustomer.document}
                      {selectedCustomer.phone ? <>&nbsp;·&nbsp;{selectedCustomer.phone}</> : null}
                      {selectedCustomer.city ? <>&nbsp;·&nbsp;{selectedCustomer.city} - {selectedCustomer.state || 'CE'}</> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowAddCustomer(true)} className="text-xs text-[#155eef] hover:text-[#1349c5] font-medium px-2 py-1 rounded-md hover:bg-[#eff4ff] dark:hover:bg-blue-900/20 transition-colors">+ Novo</button>
                    <button onClick={() => setShowCustomerSearch(!showCustomerSearch)} className="text-xs text-[#667085] hover:text-[#1a1d21] dark:text-slate-400 dark:hover:text-white font-medium px-2 py-1 rounded-md hover:bg-[#f2f4f7] dark:hover:bg-slate-700 transition-colors">Trocar</button>
                  </div>
                </div>
                {showCustomerSearch && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 shadow-xl rounded-xl z-20 overflow-hidden">
                    <div className="p-2 border-b border-[#f2f4f7] dark:border-slate-700 flex gap-2">
                      <input type="text" placeholder="Buscar cliente..." autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className="flex-1 p-2 border border-[#eaecf0] dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#155eef]" />
                      <button onClick={() => setShowCustomerSearch(false)} className="p-2 text-[#98a2b3] hover:text-[#667085]"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="max-h-52 overflow-y-auto p-1">
                      {customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                        <button key={c.id} onClick={() => { setSelectedCustomer(c); setShowCustomerSearch(false); setSearchTerm(''); }}
                          className="w-full text-left px-3 py-2 hover:bg-[#f9fafb] dark:hover:bg-slate-700 rounded-lg transition-colors">
                          <div className="text-sm font-medium text-[#1a1d21] dark:text-white">{c.name}</div>
                          <div className="text-xs text-[#667085] dark:text-slate-400">{c.document}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ITENS DO PEDIDO */}
            <p className="text-[12px] font-semibold text-[#667085] dark:text-slate-500 uppercase tracking-[0.03em] mb-3">Itens do pedido</p>

            <table className="w-full border-collapse mb-2">
              <thead>
                <tr>
                  <td className="text-[11px] font-semibold text-[#98a2b3] dark:text-slate-500 uppercase tracking-[0.02em] pb-2 border-b border-[#eaecf0] dark:border-slate-700 pr-2">Produto</td>
                  <td className="text-[11px] font-semibold text-[#98a2b3] dark:text-slate-500 uppercase tracking-[0.02em] pb-2 border-b border-[#eaecf0] dark:border-slate-700 text-right pr-2">Qtd.</td>
                  <td className="text-[11px] font-semibold text-[#98a2b3] dark:text-slate-500 uppercase tracking-[0.02em] pb-2 border-b border-[#eaecf0] dark:border-slate-700 text-right pr-2">Valor emb.</td>
                  <td className="text-[11px] font-semibold text-[#98a2b3] dark:text-slate-500 uppercase tracking-[0.02em] pb-2 border-b border-[#eaecf0] dark:border-slate-700 text-right pr-2">Lucro</td>
                  <td className="text-[11px] font-semibold text-[#98a2b3] dark:text-slate-500 uppercase tracking-[0.02em] pb-2 border-b border-[#eaecf0] dark:border-slate-700 text-right pr-2">Total</td>
                  <td className="pb-2 border-b border-[#eaecf0] dark:border-slate-700"></td>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-[#667085] dark:text-slate-500 text-sm">
                      Nenhum produto no pedido. Pressione <kbd className="bg-white dark:bg-slate-800 border border-[#d0d5dd] dark:border-slate-700 px-1.5 py-[2px] rounded-[5px] text-[11px] font-normal select-none">⌘K</kbd> ou clique na barra de busca para adicionar.
                    </td>
                  </tr>
                ) :
                  cart.map((item) => {
                  const referencePrice = item.basePrice ?? item.price;
                  const hasDiscount = referencePrice > 0 && item.price < referencePrice;
                  const discountAmount = hasDiscount ? referencePrice - item.price : 0;
                  const discountPercent = hasDiscount ? (discountAmount / referencePrice) * 100 : 0;
                  const stockQty = item.stock ?? 0;
                  const step = (item.unit === 'un' || item.unit === 'pc' || item.unit === 'pç') ? 1 : 0.5;
                  const rowTotal = item.price * item.quantity;
                  return (
                    <tr key={item.id} className="border-b border-[#f2f4f7] dark:border-slate-800 hover:bg-[#f9fafb] dark:hover:bg-slate-800/40 group transition-colors">
                      {/* Produto */}
                      <td className="py-[11px] pr-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-[#eff4ff] dark:bg-blue-900/30 text-[#155eef] dark:text-blue-400 text-[11px] font-medium px-[7px] py-[2px] rounded-[6px]">{item.id}</span>
                          </div>
                          <button
                            onClick={() => setEditingPrice({ id: item.id, name: item.name, price: item.price, unit: item.unit, basePrice: referencePrice })}
                            className="text-[13px] text-[#1a1d21] dark:text-white hover:text-[#155eef] dark:hover:text-blue-400 transition-colors text-left font-normal"
                            title="Editar preço"
                          >
                            {item.name}
                          </button>
                          {hasDiscount && (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Desc. R$ {discountAmount.toFixed(2)} ({discountPercent.toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Qtd */}
                      <td className="py-[11px] pr-2 text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => onUpdateQuantity(item.id, item.quantity - step)}
                            className="w-5 h-5 flex items-center justify-center rounded text-[#98a2b3] hover:text-[#155eef] hover:bg-[#eff4ff] dark:hover:bg-blue-900/30 transition-colors">
                            <Minus className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingItem({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit })}
                            className="min-w-[40px] text-center text-[13px] font-normal text-[#1a1d21] dark:text-white hover:text-[#155eef] transition-colors">
                            {item.quantity.toLocaleString('pt-BR', { minimumFractionDigits: item.quantity % 1 !== 0 ? 3 : 0, maximumFractionDigits: 3 })}
                          </button>
                          <button onClick={() => onUpdateQuantity(item.id, item.quantity + step)}
                            className="w-5 h-5 flex items-center justify-center rounded text-[#98a2b3] hover:text-[#155eef] hover:bg-[#eff4ff] dark:hover:bg-blue-900/30 transition-colors">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      {/* Valor emb. */}
                      <td className="py-[11px] pr-2 text-right text-[13px]">
                        <button
                          onClick={() => setEditingPrice({ id: item.id, name: item.name, price: item.price, unit: item.unit, basePrice: referencePrice })}
                          className="text-[#1a1d21] dark:text-white hover:text-[#155eef] dark:hover:text-blue-400 font-medium inline-flex items-center gap-1 transition-colors justify-end w-full"
                          title="Editar preço"
                        >
                          R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          <svg className="w-3.5 h-3.5 text-[#98a2b3] opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        </button>
                      </td>
                      {/* Lucro */}
                      <td className="py-[11px] pr-2 text-right">
                        <span className="bg-[#ecfdf3] dark:bg-emerald-900/30 text-[#067647] dark:text-emerald-400 text-[11px] font-medium px-[7px] py-[2px] rounded-[6px]">
                          {getProductProfit(item.id).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%
                        </span>
                      </td>
                      {/* Total */}
                      <td className="py-[11px] pr-2 text-right text-[13px] font-semibold text-[#1a1d21] dark:text-white">
                        {rowTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      {/* Remover */}
                      <td className="py-[11px] text-right">
                        <button onClick={() => onRemove(item.id)}
                          className="text-[#98a2b3] hover:text-[#667085] dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-all"
                          title="Remover">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Adicionar item */}
            <div 
              onClick={() => setShowProductSearch(true)}
              className="flex items-center gap-2 px-[10px] py-[10px] border border-dashed border-[#d0d5dd] dark:border-slate-600 rounded-[10px] text-[#667085] dark:text-slate-500 text-[13px] mb-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-[15px] h-[15px]" />
              <span>Adicionar item · pressione</span>
              <span className="bg-white dark:bg-slate-700 border border-[#d0d5dd] dark:border-slate-600 rounded-[5px] px-1.5 py-[2px] text-[11px] text-[#667085] dark:text-slate-400 mx-0.5">⌘K</span>
              <span>para buscar</span>
            </div>

            {/* Observações */}
            <div className="mb-5">
              <label className="text-[12px] font-semibold text-[#667085] dark:text-slate-500 uppercase tracking-[0.03em]">Observações</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Orientações para expedição, pagamento, entrega..."
                className="w-full mt-2 px-3 py-2 rounded-[8px] border border-[#eaecf0] dark:border-slate-700 bg-[#f9fafb] dark:bg-slate-800 text-[13px] text-[#1a1d21] dark:text-white placeholder:text-[#98a2b3] focus:outline-none focus:ring-2 focus:ring-[#155eef] focus:border-transparent resize-none transition-all"
              />
            </div>
          </div>

          {/* ── SIDEBAR DIREITA ── */}
          <div className="pt-0 lg:pt-[28px]">

            {/* LIMITE DE CRÉDITO */}
            <p className="text-[12px] font-semibold text-[#667085] dark:text-slate-500 uppercase tracking-[0.03em] mb-3">Limite de crédito</p>
            <div className="bg-[#f9fafb] dark:bg-slate-800 rounded-xl p-[14px] border border-[#eaecf0] dark:border-slate-700 mb-5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[12px] text-[#667085] dark:text-slate-400">Utilizado</span>
                <span className="text-[12px] font-semibold text-[#1a1d21] dark:text-white">
                  {Math.round(((9522.17 + total) / 60000.00) * 100)}%
                </span>
              </div>
              <div className="h-[6px] bg-[#eaecf0] dark:bg-slate-700 rounded-full overflow-hidden mb-2.5">
                <div
                  className="h-full bg-[#155eef] rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(((9522.17 + total) / 60000.00) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[12px] text-[#667085] dark:text-slate-400">
                <span>Saldo</span>
                <span className="font-medium text-[#1a1d21] dark:text-white">
                  R$ {(50477.83 - total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* PRAZO & TRANSPORTE */}
            <p className="text-[12px] font-semibold text-[#667085] dark:text-slate-500 uppercase tracking-[0.03em] mb-3">Prazo &amp; transporte</p>

            {/* Condição de Pagamento */}
            <div className="mb-3.5">
              <p className="text-[11px] text-[#667085] dark:text-slate-500 mb-1">Condição de pagamento</p>
              <div className="relative">
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full text-[13px] font-medium text-[#1a1d21] dark:text-white px-[10px] py-2 bg-[#f9fafb] dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#155eef] appearance-none cursor-pointer"
                >
                  {paymentSelectOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            {/* Planos Boleto */}
            {isBoleto && (
              <div className="mb-3.5">
                <p className="text-[11px] text-[#667085] dark:text-slate-500 mb-1">Plano boleto</p>
                {planLoading && <div className="flex items-center gap-2 text-xs text-[#667085] py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...</div>}
                {planError && !planLoading && <div className="text-xs text-red-600 dark:text-red-400 py-1">{planError}</div>}
                {!planLoading && !planError && paymentPlans.length > 0 && (
                  <select
                    value={selectedPlan?.code || ''}
                    onChange={e => setSelectedPlan(paymentPlans.find(p => p.code === e.target.value) || null)}
                    className="w-full text-[13px] font-medium text-[#1a1d21] dark:text-white px-[10px] py-2 bg-[#f9fafb] dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#155eef] appearance-none cursor-pointer"
                  >
                    {paymentPlans.map(p => <option key={p.code} value={p.code}>{p.description}</option>)}
                  </select>
                )}
                {planValidationError && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{planValidationError}</p>
                )}
              </div>
            )}

            {/* Vencimento */}
            <div className="mb-3.5">
              <p className="text-[11px] text-[#667085] dark:text-slate-500 mb-1">Vencimento</p>
              <div className="text-[13px] font-medium text-[#1a1d21] dark:text-white px-[10px] py-2 bg-[#f9fafb] dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-lg">
                {selectedPlan?.daysFirstInstallment
                  ? new Date(Date.now() + selectedPlan.daysFirstInstallment * 86400000).toLocaleDateString('pt-BR')
                  : new Date(Date.now() + 30 * 86400000).toLocaleDateString('pt-BR')
                }
              </div>
            </div>

            {/* Transportadora */}
            <div className="mb-3.5">
              <p className="text-[11px] text-[#667085] dark:text-slate-500 mb-1">Transportadora</p>
              <div className="relative">
                <select
                  value={carrier}
                  onChange={e => setCarrier(e.target.value)}
                  className="w-full text-[13px] font-medium text-[#1a1d21] dark:text-white px-[10px] py-2 bg-[#f9fafb] dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#155eef] appearance-none cursor-pointer"
                >
                  {['Expresso Log', 'Rede Cargo', 'Direct Transportes', 'Retirada em Loja'].map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            {/* Frete */}
            <div className="mb-3.5">
              <p className="text-[11px] text-[#667085] dark:text-slate-500 mb-1">Frete</p>
              <div className="relative">
                <select
                  value={shippingMethod}
                  onChange={e => setShippingMethod(e.target.value)}
                  className="w-full text-[13px] font-medium text-[#1a1d21] dark:text-white px-[10px] py-2 bg-[#f9fafb] dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#155eef] appearance-none cursor-pointer"
                >
                  {shippingSelectOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#98a2b3" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            {/* RESUMO DE VALORES */}
            <div className="border-t border-b border-[#eaecf0] dark:border-slate-700 py-3.5 my-4 space-y-2">
              <div className="flex justify-between text-xs text-[#667085] dark:text-slate-400">
                <span>Subtotal</span>
                <span>R$ {cart.reduce((sum, item) => sum + ((item.basePrice ?? item.price) * item.quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              {cart.reduce((sum, item) => sum + (((item.basePrice ?? item.price) - item.price) * item.quantity), 0) > 0 && (
                <div className="flex justify-between text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <span>Desconto</span>
                  <span>- R$ {cart.reduce((sum, item) => sum + (((item.basePrice ?? item.price) - item.price) * item.quantity), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-[#667085] dark:text-slate-400">
                <span>Modalidade Frete</span>
                <span className="uppercase font-medium text-[#1a1d21] dark:text-white">{shippingMethod}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-[#1a1d21] dark:text-white pt-1">
                <span>Total do Pedido</span>
                <span>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* Ações rápidas */}
            <div className="flex gap-2 mt-2 mb-5">
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#667085] dark:text-slate-400 bg-white dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-lg hover:bg-[#f9fafb] dark:hover:bg-slate-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Limpar
              </button>
              <button
                onClick={shareQuote}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#667085] dark:text-slate-400 bg-white dark:bg-slate-800 border border-[#eaecf0] dark:border-slate-700 rounded-lg hover:bg-[#f9fafb] dark:hover:bg-slate-700 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" /> WhatsApp
              </button>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div className="flex items-center justify-between px-7 py-4 mt-5 bg-[#f9fafb] dark:bg-slate-900 border-t border-[#eaecf0] dark:border-slate-700">
          <span className="text-[12px] text-[#667085] dark:text-slate-500">{cart.length} {cart.length === 1 ? 'item' : 'itens'}</span>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#667085] dark:text-slate-400">Total do pedido</span>
            <span className="text-[20px] font-bold text-[#1a1d21] dark:text-white tracking-[-0.02em]">
              R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
