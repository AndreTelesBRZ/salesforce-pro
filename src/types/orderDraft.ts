export type DraftStatus = 'DRAFT' | 'SYNCING' | 'SYNCED' | 'ERROR';

export interface OrderDraftItem {
  codigo_produto: string;
  quantidade: number;
  valor_unitario: number;
  nome_produto?: string;
  descricao?: string;
  unidade?: string;
  base_price?: number;
  category?: string;
  stock?: number;
  sectionCode?: string;
  groupCode?: string;
  subgroupCode?: string;
}

export interface OrderDraft {
  id: string;
  cliente_id: string;
  itens: OrderDraftItem[];
  total: number;
  data_criacao: string;
  updated_at: string;
  status: DraftStatus;
  error_message?: string;
  retry_count?: number;
  display_id?: number;
  notes?: string;
  payment_method?: string;
  payment_method_id?: string;
  shipping_method?: string;
  shipping_method_id?: string;
  payment_plan_code?: string;
  payment_plan_description?: string;
  payment_installments?: number;
  payment_first_installment_days?: number;
  payment_days_between?: number;
  payment_min_value?: number;
  cliente_nome?: string;
  cliente_documento?: string;
  cliente_tipo?: 'NORMAL' | 'TEMPORARIO';
}
