
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Product, CartItem } from '../types';
import { apiService } from '../services/api';
import { geminiService } from '../services/geminiService';
import { ShoppingCart, Sparkles, Loader2, Search, Filter, X, List, Grid, WifiOff, Box, Check, ImagePlus, Package, Plus, Save } from 'lucide-react';

interface ProductListProps {
  onAddToCart: (product: Product) => void;
  cart: CartItem[];
}

export const ProductList: React.FC<ProductListProps> = ({ onAddToCart, cart }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  const [showImages, setShowImages] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  
  // Add Product Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({ unit: 'UN', category: 'Geral', stock: 100 });
  const [addingProduct, setAddingProduct] = useState(false);
  
  // IA States
  const [pitchLoadingId, setPitchLoadingId] = useState<string | null>(null);
  const [imageLoadingId, setImageLoadingId] = useState<string | null>(null);
  const [salesPitches, setSalesPitches] = useState<Record<string, string>>({});

  const observer = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
     setIsTyping(true);
     const delayDebounceFn = setTimeout(() => {
        setIsTyping(false);
        loadFirstPage();
     }, 800);

     return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, selectedCategory]);

  const loadFirstPage = async () => {
    setLoading(true);
    setError('');
    setPage(1);
    setHasMore(true);
    try {
      const data = await apiService.getProducts(1, 50, searchTerm, selectedCategory); 
      setProducts(data);
      if (data.length < 50) setHasMore(false);
    } catch (err) {
      setError('Não foi possível conectar ao servidor ou banco local.');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreProducts = async () => {
    if (loadingMore || !hasMore) return;
    
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await apiService.getProducts(nextPage, 50, searchTerm, selectedCategory);
      
      if (data.length === 0) {
        setHasMore(false);
      } else {
        setProducts(prev => {
           const existingIds = new Set(prev.map(p => p.id));
           const newUnique = data.filter(p => !existingIds.has(p.id));
           return [...prev, ...newUnique];
        });
        setPage(nextPage);
        if (data.length < 50) setHasMore(false);
      }
    } catch (err) {
      console.error("Erro ao carregar mais itens", err);
      setHasMore(false); 
    } finally {
      setLoadingMore(false);
    }
  };

  const lastProductElementRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMoreProducts();
      }
    });

    if (node) observer.current.observe(node);
  }, [loading, loadingMore, hasMore, page]);

  const generatePitch = async (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    if (salesPitches[product.id]) return;

    setPitchLoadingId(product.id);
    const pitch = await geminiService.generateSalesPitch(product);
    setSalesPitches(prev => ({ ...prev, [product.id]: pitch }));
    setPitchLoadingId(null);
  };

  const generateImage = async (product: Product, e: React.MouseEvent) => {
      e.stopPropagation();
      setImageLoadingId(product.id);
      
      const newImageUrl = await geminiService.generateProductImage(product);
      
      if (newImageUrl) {
          setProducts(prev => prev.map(p => 
              p.id === product.id ? { ...p, imageUrl: newImageUrl } : p
          ));
      } else {
          alert('Não foi possível gerar a imagem. Verifique sua chave de API.');
      }
      
      setImageLoadingId(null);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newProduct.id || !newProduct.name || !newProduct.price) {
          alert('Preencha os campos obrigatórios.');
          return;
      }
      
      setAddingProduct(true);
      const result = await apiService.createProduct(newProduct);
      setAddingProduct(false);
      
      if (result.success) {
          setShowAddModal(false);
          setNewProduct({ unit: 'UN', category: 'Geral', stock: 100 });
          loadFirstPage(); // Recarrega a lista
          alert('Produto cadastrado com sucesso!');
      } else {
          alert(`Erro: ${result.message}`);
      }
  };

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return ['Todas', ...Array.from(cats)];
  }, [products]);

  const getCartItem = (productId: string) => {
    return cart.find(i => i.id === productId);
  };

  if (loading && page === 1 && !searchTerm) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600 mb-2" />
        <p className="text-slate-500">Carregando catálogo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center px-4">
        <WifiOff className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-slate-600 dark:text-slate-300 mb-4">{error}</p>
        <button 
          onClick={loadFirstPage}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="pb-20">
      
      {/* Modal de Adicionar Produto */}
      {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
                  <div className="bg-blue-900 p-4 flex justify-between items-center">
                      <h3 className="text-white font-bold flex items-center gap-2">
                          <Plus className="w-5 h-5" /> Novo Produto
                      </h3>
                      <button onClick={() => setShowAddModal(false)} className="text-white/70 hover:text-white">
                          <X className="w-6 h-6" />
                      </button>
                  </div>
                  <form onSubmit={handleCreateProduct} className="p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase">Código (PLU)</label>
                              <input 
                                  required
                                  type="text" 
                                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                  value={newProduct.id || ''}
                                  onChange={e => setNewProduct({...newProduct, id: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase">Preço (R$)</label>
                              <input 
                                  required
                                  type="number" step="0.01"
                                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                  value={newProduct.price || ''}
                                  onChange={e => setNewProduct({...newProduct, price: parseFloat(e.target.value)})}
                              />
                          </div>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Nome do Produto</label>
                          <input 
                              required
                              type="text" 
                              className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                              value={newProduct.name || ''}
                              onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                          />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Descrição Técnica</label>
                          <textarea 
                              className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                              rows={2}
                              value={newProduct.description || ''}
                              onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                          />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                           <div>
                              <label className="text-xs font-bold text-slate-500 uppercase">Estoque</label>
                              <input 
                                  type="number" 
                                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                  value={newProduct.stock || ''}
                                  onChange={e => setNewProduct({...newProduct, stock: parseInt(e.target.value)})}
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase">Unidade</label>
                              <input 
                                  type="text" 
                                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                  value={newProduct.unit || ''}
                                  onChange={e => setNewProduct({...newProduct, unit: e.target.value})}
                              />
                          </div>
                          <div>
                              <label className="text-xs font-bold text-slate-500 uppercase">Categoria</label>
                              <input 
                                  type="text" 
                                  className="w-full p-2 border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                                  value={newProduct.category || ''}
                                  onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                              />
                          </div>
                      </div>
                      
                      <button 
                          type="submit" 
                          disabled={addingProduct}
                          className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 mt-2"
                      >
                          {addingProduct ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                          Salvar no Banco
                      </button>
                  </form>
              </div>
          </div>
      )}

      {/* Cabeçalho de Controles */}
      <div className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-950 pt-4 pb-2 px-4 space-y-3">
        <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, código ou descrição..."
                className="w-full pl-10 pr-10 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 shadow-sm transition-all"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                 {isTyping ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
              </div>
              
              {searchTerm && (
                 <button 
                   onClick={() => setSearchTerm('')}
                   className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                 >
                   <X className="w-4 h-4" />
                 </button>
              )}
            </div>
            
            {/* Botão Adicionar Produto */}
            <button 
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg shadow-sm flex items-center justify-center"
                title="Cadastrar Novo Produto"
            >
                <Plus className="w-6 h-6" />
            </button>
        </div>

        {/* Filtros e Alternância de Visualização */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar items-center">
          <button 
             onClick={() => setShowFilters(!showFilters)}
             className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap border transition-colors ${showFilters ? 'bg-orange-100 border-orange-200 text-orange-700 dark:bg-orange-900/40 dark:border-orange-800 dark:text-orange-300' : 'bg-white border-slate-300 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}
          >
            <Filter className="w-4 h-4" /> Filtros
          </button>
          
          <div className="w-px bg-slate-300 dark:bg-slate-700 mx-1 h-6 self-center"></div>

          <button 
            onClick={() => setShowImages(!showImages)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {showImages ? <List className="w-4 h-4" /> : <Grid className="w-4 h-4" />}
            {showImages ? 'Lista' : 'Cartões'}
          </button>

          {categories.slice(0, 3).map(cat => (
             <button
               key={cat}
               onClick={() => setSelectedCategory(cat)}
               className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-blue-900 text-white dark:bg-white dark:text-blue-900' : 'bg-white text-slate-600 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}
             >
               {cat}
             </button>
          ))}
        </div>

        {showFilters && (
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2">
            <h3 className="font-semibold mb-2 text-slate-800 dark:text-white text-sm">Categorias</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selectedCategory === cat 
                      ? 'bg-orange-100 border-orange-200 text-orange-800 dark:bg-orange-900 dark:border-orange-800 dark:text-orange-200' 
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lista de Produtos */}
      <div className={`px-4 pt-2 ${showImages ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-2'}`}>
        {products.map((product, index) => {
            const isLastElement = index === products.length - 1;
            const cartItem = getCartItem(product.id);
            const isInCart = !!cartItem;
            const quantity = cartItem?.quantity || 0;
            const qtyDisplay = Number.isInteger(quantity) ? quantity : quantity.toFixed(2);

            return showImages ? (
            <div 
                key={product.id} 
                ref={isLastElement ? lastProductElementRef : null}
                className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border overflow-hidden flex flex-col transition-all ${
                    isInCart 
                    ? 'border-orange-500 dark:border-orange-500 ring-1 ring-orange-500/50' 
                    : 'border-slate-200 dark:border-slate-700'
                }`}
            >
              <div className="relative aspect-square bg-slate-100 dark:bg-slate-700 group flex items-center justify-center">
                {product.imageUrl ? (
                    <img 
                      src={product.imageUrl} 
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                ) : (
                    <Package className="w-16 h-16 text-slate-300 dark:text-slate-600" />
                )}
                
                <button
                    onClick={(e) => generateImage(product, e)}
                    disabled={imageLoadingId === product.id}
                    className="absolute top-2 right-2 p-2 bg-white/90 dark:bg-slate-900/90 rounded-full shadow-md text-purple-600 dark:text-purple-400 hover:scale-110 transition-transform disabled:opacity-50 z-10"
                >
                    {imageLoadingId === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
                </button>

                <span className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm">
                  Est: {product.stock}
                </span>

                {isInCart && (
                  <div className="absolute top-2 left-2 bg-orange-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1 animate-in zoom-in">
                    <Check className="w-3 h-3" />
                    <span>{qtyDisplay}</span>
                  </div>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                 <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-900 dark:text-white leading-tight">{product.name}</h3>
                    <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-1 rounded">{product.id}</span>
                 </div>
                 
                 <p className="text-slate-500 dark:text-slate-400 text-sm mb-4 line-clamp-2 flex-1">{product.description}</p>
                 
                 {salesPitches[product.id] && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                        <div className="flex items-center gap-1 text-blue-700 dark:text-blue-300 text-xs font-bold mb-1">
                            <Sparkles className="w-3 h-3" /> Argumento de Venda
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 italic">"{salesPitches[product.id]}"</p>
                    </div>
                 )}

                 <div className="flex items-end justify-between mt-auto">
                    <div>
                        <span className="block text-xs text-slate-500">Preço Unitário</span>
                        <span className="text-xl font-bold text-blue-800 dark:text-blue-400">R$ {product.price.toFixed(2)}</span>
                    </div>
                    <button 
                        onClick={() => onAddToCart(product)}
                        className={`p-3 rounded-lg shadow-lg active:scale-95 transition-all flex items-center gap-2 ${
                            isInCart
                            ? 'bg-orange-700 text-white shadow-orange-600/30 ring-2 ring-orange-300 dark:ring-orange-900'
                            : 'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/20'
                        }`}
                    >
                        <ShoppingCart className="w-5 h-5" />
                        {isInCart && <span className="text-xs font-bold">Adicionar Mais</span>}
                    </button>
                 </div>
                 
                 <button 
                    onClick={(e) => generatePitch(product, e)}
                    disabled={!!pitchLoadingId}
                    className="w-full mt-3 py-2 flex items-center justify-center gap-2 text-xs font-medium text-slate-500 hover:text-orange-600 dark:text-slate-400 dark:hover:text-orange-400 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                 >
                    {pitchLoadingId === product.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    {salesPitches[product.id] ? 'Gerar Novo Argumento' : 'Gerar Argumento com IA'}
                 </button>
              </div>
            </div>
          ) : (
            <div 
                key={product.id} 
                ref={isLastElement ? lastProductElementRef : null}
                className={`p-3 rounded-lg border flex items-start justify-between gap-3 shadow-sm active:scale-[0.99] transition-all ${
                    isInCart 
                    ? 'bg-orange-50/50 border-orange-400 dark:bg-orange-900/10 dark:border-orange-500' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                }`}
            >
               <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2 mb-1 text-xs text-slate-500 dark:text-slate-400">
                     <span className={`font-mono px-1.5 py-0.5 rounded text-[10px] border font-bold ${
                         isInCart ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                     }`}>
                        {product.id}
                     </span>
                     <span className="truncate max-w-[100px] hidden sm:inline">{product.category}</span>
                     <span className="hidden sm:inline text-slate-300 dark:text-slate-600">•</span>
                     <span className="flex items-center gap-1 whitespace-nowrap font-medium text-slate-600 dark:text-slate-300">
                        <Box className="w-3 h-3" /> {product.stock} {product.unit}
                     </span>
                  </div>

                  <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug whitespace-normal break-words">
                     {product.name}
                  </h3>
                   
                   {product.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{product.description}</p>
                   )}

                  {isInCart && (
                     <div className="mt-1 flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400">
                        <Check className="w-3 h-3" />
                        No carrinho: {qtyDisplay}
                     </div>
                  )}
               </div>

               <div className="flex flex-col items-end gap-2 pl-2 shrink-0">
                  <div className="text-right">
                     <div className="font-bold text-blue-800 dark:text-blue-400 text-sm whitespace-nowrap">R$ {product.price.toFixed(2)}</div>
                     <div className="text-[10px] text-slate-400">/{product.unit}</div>
                  </div>
                  <button 
                    onClick={() => onAddToCart(product)}
                    className={`p-2 rounded-lg transition-colors ${
                        isInCart
                        ? 'bg-orange-600 text-white hover:bg-orange-700'
                        : 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50'
                    }`}
                  >
                     <ShoppingCart className="w-4 h-4" />
                  </button>
               </div>
            </div>
          );
        })}

        {loadingMore && (
            <div className="py-4 text-center flex justify-center items-center gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                <span className="text-sm">Carregando mais produtos...</span>
            </div>
        )}

        {!hasMore && products.length > 0 && !searchTerm && (
            <div className="py-6 text-center text-xs text-slate-400">
                Você chegou ao fim da lista.
            </div>
        )}

        {products.length === 0 && !loading && (
            <div className="text-center py-12 text-slate-400">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>Nenhum produto encontrado para "{searchTerm}"</p>
                {!searchTerm && hasMore && (
                    <button onClick={loadMoreProducts} className="mt-4 text-orange-600 text-sm hover:underline">
                        Carregar mais produtos do servidor
                    </button>
                )}
            </div>
        )}
      </div>
    </div>
  );
};
