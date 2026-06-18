import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import { Product } from '../types';
import { getStoreCodeForCurrentHost, isEdsonHostForCurrent, isLlfixHostForCurrent } from '../services/storeHost';
import { BarChart3, CheckSquare, Filter, Loader2, Package, Printer, RefreshCcw, Search, Square } from 'lucide-react';

interface StoreInfo {
  id?: number | string;
  legal_name?: string;
  trade_name?: string;
  document?: string;
  email?: string;
  phone?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  complement?: string;
  logo_url?: string;
}

interface ReportFilters {
  searchTerm: string;
  category: string;
  sectionCode: string;
  groupCode: string;
  subgroupCode: string;
  stockMode: 'all' | 'in-stock' | 'out-of-stock';
}

const DEFAULT_FILTERS: ReportFilters = {
  searchTerm: '',
  category: 'Todas',
  sectionCode: 'Todas',
  groupCode: 'Todas',
  subgroupCode: 'Todas',
  stockMode: 'all',
};

const normalizeText = (value?: string): string =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getUniqueValues = (products: Product[], accessor: (product: Product) => string | undefined): string[] => {
  return Array.from(
    new Set(
      products
        .map(accessor)
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

const formatCurrency = (value: number) =>
  `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatSectionTrail = (product: Product) =>
  [product.sectionCode, product.groupCode, product.subgroupCode].filter(Boolean).join(' / ') || '-';

const compareProductsBySectionTrail = (left: Product, right: Product) => {
  const sectionCompare = String(left.sectionCode || '').localeCompare(String(right.sectionCode || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  if (sectionCompare !== 0) return sectionCompare;

  const groupCompare = String(left.groupCode || '').localeCompare(String(right.groupCode || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  if (groupCompare !== 0) return groupCompare;

  const subgroupCompare = String(left.subgroupCode || '').localeCompare(String(right.subgroupCode || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
  if (subgroupCompare !== 0) return subgroupCompare;

  const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'pt-BR', { sensitivity: 'base' });
  if (categoryCompare !== 0) return categoryCompare;

  const nameCompare = String(left.name || '').localeCompare(String(right.name || ''), 'pt-BR', { sensitivity: 'base' });
  if (nameCompare !== 0) return nameCompare;

  return String(left.id || '').localeCompare(String(right.id || ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
};

const chunkProductsForPrint = (products: Product[], pageSize: number): Product[][] => {
  if (products.length === 0) return [];
  const pages: Product[][] = [];
  for (let index = 0; index < products.length; index += pageSize) {
    pages.push(products.slice(index, index + pageSize));
  }
  return pages;
};

const formatStoreAddress = (storeInfo?: StoreInfo | null): string => {
  if (!storeInfo) return '';
  const line1 = [storeInfo.street, storeInfo.number, storeInfo.complement].filter(Boolean).join(', ');
  const cityState = [storeInfo.city, storeInfo.state].filter(Boolean).join('/');
  const line2 = [storeInfo.neighborhood, cityState].filter(Boolean).join(' - ');
  const zip = storeInfo.zip ? `CEP ${storeInfo.zip}` : '';
  return [line1, line2, zip].filter(Boolean).join(' • ');
};

const formatStoreContact = (storeInfo?: StoreInfo | null): string => {
  if (!storeInfo) return '';
  return [storeInfo.phone ? `Fone: ${storeInfo.phone}` : '', storeInfo.email || ''].filter(Boolean).join(' • ');
};

export const ReportsPage: React.FC<{ storeInfo?: StoreInfo | null }> = ({ storeInfo }) => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [draftFilters, setDraftFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadProducts = async (showLoader: boolean) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError('');
    try {
      const products = await apiService.getAllProductsForReport();
      setAllProducts(products);
      if (products.length === 0) {
        setError('Nenhum produto encontrado para gerar o relatório.');
      }
    } catch {
      setError('Não foi possível carregar o catálogo para relatórios.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadProducts(true);
  }, []);

  const filteredProducts = useMemo(() => {
    const terms = normalizeText(appliedFilters.searchTerm).split(/\s+/).filter(Boolean);

    return allProducts
      .filter((product) => {
        if (appliedFilters.category !== 'Todas' && product.category !== appliedFilters.category) return false;
        if (appliedFilters.sectionCode !== 'Todas' && (product.sectionCode || '') !== appliedFilters.sectionCode) return false;
        if (appliedFilters.groupCode !== 'Todas' && (product.groupCode || '') !== appliedFilters.groupCode) return false;
        if (appliedFilters.subgroupCode !== 'Todas' && (product.subgroupCode || '') !== appliedFilters.subgroupCode) return false;
        if (appliedFilters.stockMode === 'in-stock' && (product.stock || 0) <= 0) return false;
        if (appliedFilters.stockMode === 'out-of-stock' && (product.stock || 0) > 0) return false;

        if (terms.length > 0) {
          const haystack = normalizeText(
            `${product.id} ${product.name} ${product.description} ${product.category} ${product.sectionCode} ${product.groupCode} ${product.subgroupCode}`
          );
          return terms.every((term) => haystack.includes(term));
        }

        return true;
      })
      .sort(compareProductsBySectionTrail);
  }, [allProducts, appliedFilters]);

  useEffect(() => {
    const filteredSet = new Set(filteredProducts.map((product) => product.id));
    setSelectedIds((current) => current.filter((id) => filteredSet.has(id)));
  }, [filteredProducts]);

  const selectedProducts = useMemo(
    () => filteredProducts.filter((product) => selectedIds.includes(product.id)),
    [filteredProducts, selectedIds]
  );

  const printProductPages = useMemo(
    () => chunkProductsForPrint(selectedProducts, 24),
    [selectedProducts]
  );

  const categories = useMemo(() => ['Todas', ...getUniqueValues(allProducts, (product) => product.category)], [allProducts]);
  const sections = useMemo(() => ['Todas', ...getUniqueValues(allProducts, (product) => product.sectionCode)], [allProducts]);
  const groups = useMemo(() => ['Todas', ...getUniqueValues(allProducts, (product) => product.groupCode)], [allProducts]);
  const subgroups = useMemo(() => ['Todas', ...getUniqueValues(allProducts, (product) => product.subgroupCode)], [allProducts]);

  const selectedTotalValue = useMemo(
    () => selectedProducts.reduce((sum, product) => sum + (Number(product.price) || 0), 0),
    [selectedProducts]
  );

  const currentStoreCode = getStoreCodeForCurrentHost();
  const isLlfixTheme = isLlfixHostForCurrent();
  const isEdsonTheme = isEdsonHostForCurrent();
  const brandThemeClass = isLlfixTheme ? 'report-theme-llfix' : isEdsonTheme ? 'report-theme-edson' : 'report-theme-default';

  const storeName = storeInfo?.trade_name || storeInfo?.legal_name || 'SalesForce Pro';
  const storeDocument = storeInfo?.document || '';
  const storeAddress = formatStoreAddress(storeInfo);
  const storeContact = formatStoreContact(storeInfo);
  const storeDomainLabel = isLlfixTheme ? 'llfix.app.br' : isEdsonTheme ? 'edsondosparafusos.app.br' : (typeof window !== 'undefined' ? window.location.hostname : '');
  const storeSlogan = isLlfixTheme
    ? 'Qualidade, agilidade e atendimento especializado para o seu negocio.'
    : isEdsonTheme
      ? 'Solucoes completas em sistemas de fixacao.'
      : 'Catalogo comercial de produtos.';
  const storeHighlights = isLlfixTheme
    ? ['Linha completa de produtos', 'Entrega rapida', 'Atendimento especializado']
    : isEdsonTheme
      ? ['Grande variedade', 'Entrega eficiente', 'Produtos de qualidade']
      : ['Catalogo selecionado', 'Produtos filtrados'];

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const handleResetFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setSelectedIds([]);
  };

  const toggleSelection = (productId: string) => {
    setSelectedIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    );
  };

  const selectAllFiltered = () => {
    setSelectedIds(filteredProducts.map((product) => product.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handlePrint = () => {
    if (selectedProducts.length === 0) return;
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-blue-900" />
        <p className="text-slate-500">Carregando dados do relatório...</p>
      </div>
    );
  }

  return (
    <div className="report-page p-4 pb-20 space-y-4">
      <div className="screen-only bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <BarChart3 className="w-4 h-4" />
              Relatórios
            </div>
            <h2 className="mt-3 text-xl font-bold text-slate-900 dark:text-white">Catálogo filtrado de produtos</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Lista compacta para selecionar e imprimir o máximo de itens por página.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => loadProducts(false)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
              {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />} Atualizar
            </button>
            <button type="button" onClick={handlePrint} disabled={selectedProducts.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
              <Printer className="w-4 h-4" /> Imprimir selecionados
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Busca</span>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" value={draftFilters.searchTerm} onChange={(event) => setDraftFilters((prev) => ({ ...prev, searchTerm: event.target.value }))} placeholder="Nome, código, descrição..." className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 py-2 pl-9 pr-3 text-sm" />
            </div>
          </label>
          <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Categoria</span><select value={draftFilters.category} onChange={(event) => setDraftFilters((prev) => ({ ...prev, category: event.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm">{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seção</span><select value={draftFilters.sectionCode} onChange={(event) => setDraftFilters((prev) => ({ ...prev, sectionCode: event.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm">{sections.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grupo</span><select value={draftFilters.groupCode} onChange={(event) => setDraftFilters((prev) => ({ ...prev, groupCode: event.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm">{groups.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subgrupo</span><select value={draftFilters.subgroupCode} onChange={(event) => setDraftFilters((prev) => ({ ...prev, subgroupCode: event.target.value }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm">{subgroups.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
          <label className="space-y-1"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estoque</span><select value={draftFilters.stockMode} onChange={(event) => setDraftFilters((prev) => ({ ...prev, stockMode: event.target.value as ReportFilters['stockMode'] }))} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"><option value="all">Todos</option><option value="in-stock">Somente com estoque</option><option value="out-of-stock">Somente sem estoque</option></select></label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleApplyFilters} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"><Filter className="w-4 h-4" />Gerar lista</button>
          <button type="button" onClick={handleResetFilters} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">Limpar filtros</button>
          <button type="button" onClick={selectAllFiltered} disabled={filteredProducts.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 dark:border-emerald-800 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"><CheckSquare className="w-4 h-4" />Selecionar todos</button>
          <button type="button" onClick={clearSelection} disabled={selectedIds.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"><Square className="w-4 h-4" />Limpar seleção</button>
        </div>
      </div>

      <div className="screen-only grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Itens filtrados</p><p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{filteredProducts.length}</p></div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selecionados</p><p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{selectedProducts.length}</p></div>
      </div>

      {error ? <div className="screen-only bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-200 rounded-2xl p-4">{error}</div> : null}

      <div className="screen-only bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-900 dark:text-white">Itens para o relatório</h3><p className="text-xs text-slate-500 dark:text-slate-400">Lista compacta com seleção por linha.</p></div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-right"><div>{selectedProducts.length} item(ns) selecionado(s)</div></div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="p-10 text-center"><Package className="w-12 h-12 mx-auto text-slate-300 mb-3" /><p className="font-medium text-slate-700 dark:text-slate-200">Nenhum item encontrado</p><p className="text-sm text-slate-500 dark:text-slate-400">Ajuste os filtros e gere a lista novamente.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950/70">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 w-12">Sel.</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Código</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Produto</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Categoria</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Sec/Grp/Sub</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Estoque</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Un.</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">Preço</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => {
                  const selected = selectedIds.includes(product.id);
                  return (
                    <tr key={product.id} onClick={() => toggleSelection(product.id)} className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${selected ? 'bg-blue-50/80 dark:bg-blue-950/20' : 'bg-white dark:bg-slate-900'}`}>
                      <td className="px-3 py-2"><div className={`flex h-6 w-6 items-center justify-center rounded-md border ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-700 text-transparent'}`}><CheckSquare className="w-4 h-4" /></div></td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold tracking-wide text-slate-700 dark:text-slate-200">{product.id}</td>
                      <td className="px-3 py-2"><div className="font-semibold text-slate-900 dark:text-white leading-tight">{product.name}</div>{product.description ? <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{product.description}</div> : null}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{product.category || '-'}</td>
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{formatSectionTrail(product)}</td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{'***'}</td>
                      <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300">{product.unit || '-'}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">{formatCurrency(Number(product.price) || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`print-only report-print-root ${brandThemeClass}`}>
        {printProductPages.length === 0 ? null : printProductPages.map((pageProducts, pageIndex) => (
          <section key={`print-page-${pageIndex + 1}`} className="report-print-sheet">
            <header className="report-print-header">
              <div className="report-print-header-band" />
              <div className="report-print-brand">
                {storeInfo?.logo_url ? <img src={storeInfo.logo_url} alt={storeName} className="report-print-logo" /> : null}
                <div className="report-print-brand-copy">
                  <div className="report-print-kicker">{storeName}</div>
                  <h1>Catálogo selecionado</h1>
                  <p className="report-print-slogan">{storeSlogan}</p>
                  <div className="report-print-highlights">
                    {storeHighlights.map((item) => <span key={item}>{item}</span>)}
                  </div>
                  <div className="report-print-store-lines">
                    <p>Loja {currentStoreCode.padStart(5, '0')} • {storeDomainLabel}</p>
                    {storeDocument ? <p>{storeDocument}</p> : null}
                    {storeAddress ? <p>{storeAddress}</p> : null}
                    {storeContact ? <p>{storeContact}</p> : null}
                  </div>
                </div>
              </div>
              <div className="report-print-meta">
                <span>Itens filtrados: {filteredProducts.length}</span>
                <span>Selecionados: {selectedProducts.length}</span>
                <span>Página {pageIndex + 1} de {printProductPages.length}</span>
                <span>Loja {currentStoreCode.padStart(5, '0')}</span>
              </div>
            </header>

            <table className="report-print-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Sec/Grp/Sub</th>
                  <th>Estoque</th>
                  <th>Un.</th>
                  <th>Preço</th>
                </tr>
              </thead>
              <tbody>
                {pageProducts.map((product) => (
                  <tr key={`${pageIndex + 1}-${product.id}`}>
                    <td>{product.id}</td>
                    <td><div className="report-print-product">{product.name}</div>{product.description ? <div className="report-print-description">{product.description}</div> : null}</td>
                    <td>{product.category || '-'}</td>
                    <td>{formatSectionTrail(product)}</td>
                    <td className="report-print-number">{'***'}</td>
                    <td className="report-print-number">{product.unit || '-'}</td>
                    <td className="report-print-number report-print-price-cell">{formatCurrency(Number(product.price) || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
};
