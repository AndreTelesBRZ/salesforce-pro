
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  imageUrl?: string;
  unit: string; // Ex: 'un', 'kg', 'm', 'cx', 'L'
}

export interface Customer {
  id: string;
  name: string; // Razão Social
  fantasyName?: string; // Nome Fantasia
  document: string; // CPF/CNPJ
  type?: 'NORMAL' | 'TEMPORARIO';
  origin?: string;
  
  // Endereço detalhado
  address: string; // Logradouro
  addressNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;

  phone: string;
  email?: string;
  
  // Novos Campos de Vendas
  sellerId?: string; 
  sellerName?: string; // Nome do Vendedor Responsável
  lastSaleDate?: string; // Data da última compra
  lastSaleValue?: number; // Valor da última compra
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Order {
  id: string;
  displayId?: number; // Numeração sequencial visual
  customerId?: string;
  customerName?: string;
  customerDoc?: string;
  customerType?: 'NORMAL' | 'TEMPORARIO';
  paymentPlanCode?: string;
  paymentPlanDescription?: string;
  paymentInstallments?: number;
  paymentDaysBetween?: number;
  paymentMinValue?: number;
  items: CartItem[];
  total: number;
  status: 'pending' | 'synced';
  // Fluxo de negócio da venda
  businessStatus?: 'orcamento' | 'pre_venda' | 'separacao' | 'faturado' | 'entregue' | 'cancelado';
  // ID do pedido no servidor, se já transmitido
  remoteId?: string | number;
  // Observação livre do vendedor/cliente
  notes?: string;
  // Vendedor vinculado ao pedido
  sellerId?: string;
  sellerName?: string;
  createdAt: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppConfig {
  backendUrl: string;
  apiToken: string; // Token fixo para autenticação do App no ERP
  useMockData: boolean;
  theme: ThemeMode;
  // Quando verdadeiro, a listagem de clientes ignora o cache local e
  // consulta sempre o backend com limit=-1 (todos os clientes)
  alwaysFetchCustomers?: boolean;
}

export interface PaymentPlan {
  code: string;
  description: string;
  installments: number;
  daysBetweenInstallments: number;
  minValue: number;
}
