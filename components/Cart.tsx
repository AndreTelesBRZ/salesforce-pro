
import React, { useState, useEffect, useMemo } from 'react';
import { CartItem, Order, Customer, PaymentPlan, EnumOption } from '../types';
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
  { value: 'retirada', label: 'Retirada', icon: Store },
  { value: 'entrega_propria', label: 'Entrega Própria', icon: Truck },
  { value: 'transportadora', label: 'Transportadora', icon: Package },
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
  onConfirm: (val: number) => void;
  onClose: () => void;
}

const NumericKeypadModal: React.FC<NumericKeypadModalProps> = ({ title, initialValue, itemName, unit, onConfirm, onClose }) => {
  // Converte para string com vírgula para edição
  const [displayValue, setDisplayValue] = useState(initialValue.toString().replace('.', ','));
  const [hasTyped, setHasTyped] = useState(false); // Novo estado: sabe se o usuário começou a digitar

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


export const Cart: React.FC<CartProps> = ({ cart, onUpdateQuantity, onUpdatePrice, onRemove, onClear, draftToEdit, onClearDraft }) => {
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
  const [shippingMethod, setShippingMethod] = useState('retirada');
  
  // State para o Modal Keypad
  const [editingItem, setEditingItem] = useState<{ id: string, name: string, quantity: number, unit: string } | null>(null);
  const [editingPrice, setEditingPrice] = useState<{ id: string, name: string, price: number, unit: string } | null>(null);

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
    setShippingMethod(draftToEdit.shipping_method || 'retirada');
    setLastOrderNumber(draftToEdit.display_id ?? null);
    setPendingCustomerId(draftToEdit.cliente_id || null);
  }, [draftToEdit]);

  useEffect(() => {
    if (!pendingCustomerId) return;
    if (customers.length === 0) return;
    const customer = customers.find((c) => c.id === pendingCustomerId);
    if (customer) {
      setSelectedCustomer(customer);
    }
    setPendingCustomerId(null);
  }, [pendingCustomerId, customers]);

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
            const planosDisponiveis = data.filter((plan) => plan.disponivel === true);
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

  if (cart.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
        <ShoppingCart className="w-16 h-16 mb-4 opacity-20" />
        <p>Seu carrinho está vazio.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 max-w-2xl mx-auto shadow-sm md:rounded-lg md:my-6 overflow-hidden transition-colors relative">
      
      {/* --- MODAL KEYPAD: Quantidade --- */}
      {editingItem && (
        <NumericKeypadModal 
            title="Quantidade"
            initialValue={editingItem.quantity}
            itemName={editingItem.name}
            unit={editingItem.unit}
            onClose={() => setEditingItem(null)}
            onConfirm={(val) => {
                onUpdateQuantity(editingItem.id, val);
                setEditingItem(null);
            }}
        />
      )}

      {/* --- MODAL KEYPAD: Preço --- */}
      {editingPrice && (
        <NumericKeypadModal 
            title="Preço Unitário"
            initialValue={editingPrice.price}
            itemName={editingPrice.name}
            unit={editingPrice.unit}
            onClose={() => setEditingPrice(null)}
            onConfirm={(val) => {
                if (onUpdatePrice) onUpdatePrice(editingPrice.id, val);
                setEditingPrice(null);
            }}
        />
      )}

      {showAddCustomer && (
        <AddCustomerModal
          onClose={() => setShowAddCustomer(false)}
          onSelectCustomer={(customer) => {
            setSelectedCustomer(customer);
            setShowCustomerSearch(false);
          }}
        />
      )}

      {/* Customer Selection */}
      <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-center mb-3">
             <h2 className="text-lg font-bold text-slate-800 dark:text-white">Cliente</h2>
             <div className="flex items-center gap-2">
                <button
                    onClick={() => setShowAddCustomer(true)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" /> Adicionar Cliente
                </button>
                <button 
                    onClick={() => setShowClearConfirm(true)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                    <Trash2 className="w-3.5 h-3.5" /> Limpar
                </button>
             </div>
        </div>
        
        {!selectedCustomer ? (
            <div className="relative">
                 <button 
                    onClick={() => setShowCustomerSearch(!showCustomerSearch)}
                    className="w-full p-3 border border-slate-300 dark:border-slate-600 border-dashed rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center gap-2 transition-colors"
                 >
                    <User className="w-5 h-5" /> Selecionar Cliente
                 </button>
            </div>
        ) : (
            <div className="relative">
                <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center gap-3">
                        {selectedCustomer.id === '0' ? (
                           <div className="bg-blue-200 dark:bg-blue-800 p-2 rounded-full">
                              <Store className="w-4 h-4 text-blue-700 dark:text-blue-200" />
                           </div>
                        ) : (
                           <div className="bg-slate-200 dark:bg-slate-700 p-2 rounded-full">
                              <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                           </div>
                        )}
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-blue-900 dark:text-blue-100">{selectedCustomer.name}</p>
                                {selectedCustomer.type === 'TEMPORARIO' && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-orange-200 text-orange-800">
                                        Temporario
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-blue-700 dark:text-blue-300">{selectedCustomer.document}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowCustomerSearch(!showCustomerSearch)} 
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium px-2 py-1"
                    >
                        Trocar
                    </button>
                </div>

                {showCustomerSearch && (
                     <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xl rounded-lg z-20 p-2 max-h-60 overflow-y-auto animate-in slide-in-from-top-2">
                        <div className="sticky top-0 bg-white dark:bg-slate-800 p-2 border-b border-slate-100 dark:border-slate-700 flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Buscar cliente..." 
                                autoFocus
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="flex-1 p-2 border rounded text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button onClick={() => setShowCustomerSearch(false)} className="p-2 text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        {customers.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())).map(c => (
                            <button 
                                key={c.id}
                                onClick={() => { setSelectedCustomer(c); setShowCustomerSearch(false); }}
                                className={`w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-700 border-b border-slate-50 dark:border-slate-700 text-sm dark:text-white flex items-center gap-2 ${c.id === '0' ? 'font-bold bg-slate-50 dark:bg-slate-700/50' : ''}`}
                            >
                                {c.id === '0' && <Store className="w-4 h-4 text-blue-500" />}
                                <div>
                                    <div className="font-medium">{c.name}</div>
                                    <div className="text-xs text-slate-500">{c.document}</div>
                                </div>
                            </button>
                        ))}
                     </div>
                 )}
            </div>
        )}
      </div>

      {/* Payment Plan Selection */}
      <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Plano de Pagamento</h3>
        </div>

        {!selectedCustomer && (
          <div className="text-sm text-slate-500">Selecione um cliente para ver os planos.</div>
        )}

        {planLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando planos...
          </div>
        )}

        {!selectedCustomer ? null : !planLoading && planError && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded">
            {planError}{isBoleto ? '' : ' (opcional)'}
          </div>
        )}

        {!selectedCustomer ? null : !planLoading && !planError && (
          <div className="space-y-2">
            <select
              value={selectedPlan?.code || ''}
              onChange={(e) => {
                const plan = paymentPlans.find(p => p.code === e.target.value) || null;
                setSelectedPlan(plan);
              }}
              className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            >
              {!isBoleto && <option value="">Sem plano (opcional)</option>}
              {paymentPlans.map(plan => (
                <option key={plan.code} value={plan.code} disabled={plan.minValue > 0 && total < plan.minValue}>
                  {formatPlanLabel(plan)}
                </option>
              ))}
            </select>
            {selectedPlan && (
              <div className="text-xs text-slate-500">
                <div className="text-[11px] text-slate-600">
                  Parcelas: {selectedPlan.installments} • Dias 1ª parcela: {selectedPlan.daysFirstInstallment ?? 0} • Dias entre parcelas: {selectedPlan.daysBetweenInstallments ?? 0} • Valor mínimo: {formatMoney(selectedPlan.minValue)}
                </div>
                {paymentSchedule.length > 0 && (
                  <div className="mt-2 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-700">Vencimentos:</span> {paymentSchedule.map(date => date.toLocaleDateString('pt-BR')).join(' • ')}
                  </div>
                )}
                {selectedPlan.imageUrl && (
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src={selectedPlan.imageUrl}
                      alt={`Plano ${selectedPlan.description || selectedPlan.code}`}
                      className="h-16 w-16 rounded-lg border border-slate-200 object-contain dark:border-slate-700"
                    />
                    <p className="text-[11px] text-slate-500">
                      Imagem oficial do plano fornecida pela API.
                    </p>
                  </div>
                )}
              </div>
            )}
            {planValidationError && (
              <div className="mt-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                {planValidationError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Payment Method + Shipping */}
      <div className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Forma de Pagamento</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {paymentSelectOptions.map(option => {
              const Icon = option.icon;
              const active = paymentMethod === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setPaymentMethod(option.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  type="button"
                >
                  <Icon className="w-4 h-4" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Truck className="w-5 h-5 text-orange-600" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">Tipo de Frete</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {shippingSelectOptions.map(option => {
              const Icon = option.icon;
              const active = shippingMethod === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setShippingMethod(option.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  type="button"
                >
                  <Icon className="w-4 h-4" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cart.map((item) => {
            const isFractional = item.unit.toLowerCase() === 'cto';
            const step = isFractional ? 0.01 : 1;

            return (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-4 py-4 border-b border-slate-100 dark:border-slate-700 last:border-0">
                 <div className="flex items-center gap-4 flex-1">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-800 dark:text-white text-sm break-words">{item.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                          <span className="font-mono bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[10px] text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-600 flex items-center gap-1">
                             <Tag className="w-3 h-3" /> {item.id}
                          </span>
                          <span>•</span>
                          <button
                            onClick={() => setEditingPrice({ id: item.id, name: item.name, price: item.price, unit: item.unit })}
                            className="underline decoration-dotted hover:decoration-solid"
                            title="Editar preço"
                          >
                            R$ {item.price.toFixed(2)} / {item.unit}
                          </button>
                      </p>
                    </div>
                </div>
                
                {/* Quantity Controls */}
                <div className="flex items-center justify-between sm:justify-end gap-3 mt-2 sm:mt-0">
                    <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-md">
                        <button 
                            onClick={() => onUpdateQuantity(item.id, item.quantity - step)}
                            className="p-2 text-slate-500 hover:text-orange-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-l-md transition-colors"
                        >
                            <Minus className="w-4 h-4" />
                        </button>
                        
                        <button 
                            onClick={() => setEditingItem({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit })}
                            className="w-20 p-2 text-center text-sm font-bold text-slate-800 dark:text-white border-x border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors bg-slate-50 dark:bg-slate-900"
                        >
                            {item.quantity.toString().replace('.', ',')}
                        </button>

                         <button 
                            onClick={() => onUpdateQuantity(item.id, item.quantity + step)}
                            className="p-2 text-slate-500 hover:text-orange-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-r-md transition-colors"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    <button 
                        onClick={() => onRemove(item.id)} 
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors ml-2"
                        title="Remover Item"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                </div>
              </div>
            );
        })}
      </div>

      <div className="p-6 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
        {/* Observação do pedido */}
        <div className="mb-4">
          <label className="text-xs font-bold text-slate-500 uppercase">Observações</label>
          <textarea
            value={notes}
            onChange={(e)=>setNotes(e.target.value)}
            rows={3}
            placeholder="Alguma orientação para expedição, pagamento, entrega..."
            className="w-full p-2 mt-1 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          />
        </div>

        <div className="flex justify-between items-center mb-6">
          <span className="text-slate-600 dark:text-slate-400">Total</span>
          <span className="text-2xl font-bold text-blue-900 dark:text-white">R$ {total.toFixed(2).replace('.', ',')}</span>
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
             <button
                onClick={() => setShowClearConfirm(true)}
                disabled={submitting}
                className="flex-none px-4 py-4 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-600 font-bold rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 dark:hover:border-red-800 transition-colors"
                title="Limpar Carrinho"
             >
                <Trash2 className="w-5 h-5" />
             </button>

             <button
               onClick={shareQuote}
               className="flex-none px-4 py-4 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-200"
               title="Compartilhar orçamento via WhatsApp"
             >
               <Share2 className="w-5 h-5" />
             </button>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <button
              onClick={handleSaveDraft}
              disabled={submitting || !selectedCustomer || planLoading}
              className="flex-1 py-4 bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-blue-300 dark:border-blue-700 font-bold rounded-lg shadow-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Salvar Rascunho</span>
                </>
              )}
            </button>

            <button
              onClick={handleSendToERP}
              disabled={submitting || !selectedCustomer || planLoading}
              className="flex-1 py-4 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <ArrowRight className="w-5 h-5" />
                  <span>Enviar para ERP</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
