
export interface Product {
  id: string;
  code?: string;
  plu?: string;
  reference?: string;
  barcode?: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  imageUrl?: string;
  unit: string; // Ex: 'un', 'kg', 'm', 'cx', 'L'
  sectionCode?: string;
  groupCode?: string;
  subgroupCode?: string;
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
  // Preço base de tabela usado apenas para referência visual no carrinho.
  basePrice?: number;
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
  paymentFirstInstallmentDays?: number;
  paymentDaysBetween?: number;
  paymentMinValue?: number;
  paymentDueDates?: string[];
  items: CartItem[];
  total: number;
  status: 'pending' | 'synced';
  sincronizado?: boolean;
  sincronizadoEm?: string;
  sincronizacaoErro?: string;
  // Fluxo de negócio da venda
  businessStatus?: 'orcamento' | 'pre_venda' | 'separacao' | 'faturado' | 'entregue' | 'cancelado';
  // ID do pedido no servidor, se já transmitido
  remoteId?: string | number;
  // Observação livre do vendedor/cliente
  notes?: string;
  // Vendedor vinculado ao pedido
  sellerId?: string;
  sellerName?: string;
  // Condições comerciais
  paymentMethod?: string;
  paymentMethodId?: string;
  shippingMethod?: string;
  shippingMethodId?: string;
  paymentStatus?: string;
  createdAt: string;
  shippingCost?: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AppConfig {
  backendUrl: string;
  apiToken: string; // Token fixo para autenticação do App no ERP
  useMockData: boolean;
  theme: ThemeMode;
  connectionValidated?: boolean;
  validatedAt?: string;
  // Quando verdadeiro, a listagem de clientes ignora o cache local e
  // consulta sempre o backend com limit=-1 (todos os clientes)
  alwaysFetchCustomers?: boolean;
}

export interface UserPermissions {
  can_view_products: boolean;
  can_view_clients: boolean;
  can_view_sales: boolean;
  can_create_sales: boolean;
  can_edit_sales: boolean;
  can_delete_sales: boolean;
  can_view_purchases: boolean;
  can_view_financial: boolean;
  can_view_all_companies: boolean;
}

export interface UserCompanySummary {
  id: number;
  code: string;
  name: string;
  trade_name?: string;
  tax_id?: string;
}

export interface UserStoreSummary {
  id: number;
  codigo: string;
  nome: string;
  nome_fantasia?: string;
  razao_social?: string;
  company_id?: number | null;
}

export interface UserAccessProfileSummary {
  can_view_all_companies?: boolean;
  can_manage_products?: boolean;
  can_manage_clients?: boolean;
  can_manage_sales?: boolean;
  can_manage_purchases?: boolean;
  can_manage_finance?: boolean;
  can_create_sales_records?: boolean;
  can_edit_sales_records?: boolean;
  can_delete_sales_records?: boolean;
  roles?: string[];
  role_codes?: string[];
}

export interface UserSessionProfile {
  id: number | string;
  username: string;
  email?: string;
  name: string;
  is_active: boolean;
  role?: string;
  roles?: string[];
  vendor_code?: string;
  vendor_name?: string;
  seller_id?: string;
  seller_name?: string;
  vendedor_codigo?: string;
  vendedor_nome?: string;
  loja_codigo: string;
  loja_nome?: string;
  empresa_ativa?: UserCompanySummary;
  empresas_permitidas?: UserCompanySummary[];
  lojas_permitidas?: UserStoreSummary[];
  access_profile?: UserAccessProfileSummary;
  permissions: UserPermissions;
  can_view_products?: boolean;
  can_view_clients?: boolean;
  can_view_sales?: boolean;
  can_create_sales?: boolean;
  can_edit_sales?: boolean;
  can_delete_sales?: boolean;
  can_view_purchases?: boolean;
  can_view_financial?: boolean;
  can_view_all_companies?: boolean;
}

export interface PaymentPlan {
  code: string;
  description: string;
  legend?: string;
  document?: string;
  entryValue?: number;
  firstInstallmentInterval?: number;
  accrual?: number;
  daysFirstInstallment?: number;
  installments: number;
  daysBetweenInstallments: number;
  minValue: number;
  imageUrl?: string;
  disponivel: boolean;
  meioPagamento?: string;
}

export interface EnumOption {
  value: string;
  label: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface DelinquencyItem {
  id: string;
  storeCode?: string;
  sellerId?: string;
  titleNumber?: string;
  customerCode?: string;
  customerName?: string;
  fantasyName?: string;
  document?: string;
  documentType?: string;
  city?: string;
  dueDate?: string;
  dueDateReal?: string;
  amount: number;
  lastSync?: string;
}

export interface SalesHistoryFilters {
  cliente_codigo?: string;
  vendedor_codigo?: string;
  nota_numero?: string;
  produto_codigo?: string;
  data_inicio?: string;
  data_fim?: string;
  loja_codigo?: string;
  pedido_codigo?: string;
  saida_codigo?: string;
  q?: string;
}

export interface SalesHistoryNoteItem {
  produtoCodigo?: string;
  produtoDescricao?: string;
  itemQuantidade: number;
  itemValorUnitario: number;
  itemValorTotal: number;
  itemValorLiquido: number;
}

export interface SalesHistoryNote {
  lojaCodigo?: string;
  prevendaCodigo?: string;
  pedidoCodigo?: string;
  saidaCodigo?: string;
  notaData?: string;
  notaSerie?: string;
  notaNumero?: string;
  notaValorTotal: number;
  documentoStatus?: string;
  nfeStatus?: string;
  documentoTipo?: string;
  itens?: SalesHistoryNoteItem[];
}

export interface SalesHistoryCustomerGrouped {
  clienteCodigo: string;
  clienteRazaoSocial?: string;
  clienteFantasia?: string;
  vendedorCodigo?: string;
  vendedorNome?: string;
  notas: SalesHistoryNote[];
}

export interface SalesHistoryItem {
  clienteCodigo?: string;
  clienteRazaoSocial?: string;
  clienteFantasia?: string;
  clienteCnpjCpf?: string;
  clienteTelefone1?: string;
  clienteTelefone2?: string;
  clienteEndereco?: string;
  clienteNumero?: string;
  clienteComplemento?: string;
  clienteBairro?: string;
  clienteCidade?: string;
  clienteEstado?: string;
  clienteCep?: string;
  vendedorCodigo?: string;
  vendedorNome?: string;
  lojaCodigo?: string;
  prevendaCodigo?: string;
  prevendaData?: string;
  prevendaDataFaturamento?: string;
  prevendaValorTotal: number;
  prevendaFaturada?: boolean;
  prevendaStatus?: string;
  pedidoCodigo?: string;
  pedidoData?: string;
  pedidoValorTotal: number;
  pedidoStatus?: string;
  saidaCodigo?: string;
  notaNumero?: string;
  notaSerie?: string;
  notaData?: string;
  notaValorTotal: number;
  documentoStatus?: string;
  nfeStatus?: string;
  documentoTipo?: string;
  produtoCodigo?: string;
  produtoDescricao?: string;
  itemQuantidade: number;
  itemValorUnitario: number;
  itemValorTotal: number;
  itemValorLiquido: number;
  vendaIdOrigem?: string;
  itemIdOrigem?: string;
  dataMovimento?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginatedResults<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type SalesHistoryReportColumn =
  | 'pedido'
  | 'status'
  | 'cliente'
  | 'pedido_cliente'
  | 'emissao'
  | 'vendedor'
  | 'valor_bruto'
  | 'valor_total';

export interface SalesHistoryReportRow {
  pedido: string | null;
  status: string | null;
  statusCodigo: string | null;
  cliente: string;
  clienteCodigo: string | null;
  clienteNome: string | null;
  pedidoCliente: string | null;
  emissao: string | null;
  emissaoDisplay: string | null;
  vendedor: string;
  valorBruto: number;
  valorTotal: number;
  notaNumero: string | null;
  notaSerie: string | null;
  saidaCodigo: string | null;
  produtoCodigo: string | null;
  produtoDescricao: string | null;
  documentoTipo: string | null;
}

export interface SalesHistoryReportGroup {
  dataEmissao: string | null;
  dataEmissaoDisplay: string;
  rows: SalesHistoryReportRow[];
  totalDataEmissao: {
    valorBruto: number;
    valorTotal: number;
  };
}

export interface SalesHistoryReportView {
  groupBy: 'data_emissao';
  order: 'asc';
  layout: 'resumo_por_emissao';
  columns: SalesHistoryReportColumn[];
  groups: SalesHistoryReportGroup[];
  totals: {
    valorBruto: number;
    valorTotal: number;
  };
}

export interface SalesHistoryResponse extends PaginatedResults<SalesHistoryItem> {
  reportView: SalesHistoryReportView | null;
  reportTruncated: boolean;
}

const FRACTIONAL_UNITS = new Set(['cto', 'kg']);

export const isFractionalUnit = (unit?: string): boolean => {
  return FRACTIONAL_UNITS.has(String(unit || '').trim().toLowerCase());
};
