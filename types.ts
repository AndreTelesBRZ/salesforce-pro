
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
  items: CartItem[];
  total: number;
  status: 'pending' | 'synced';
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
