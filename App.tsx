
import React, { useState, useEffect } from 'react';
import { ProductList } from './components/ProductList';
import { Cart } from './components/Cart';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { CustomerList } from './components/CustomerList';
import { OrderHistory } from './components/OrderHistory';
import { SyncData } from './components/SyncData';
import { DraftsPage } from './src/pages/DraftsPage';
import { apiService } from './services/api';
import { dbService } from './services/db';
import { Product, CartItem, ThemeMode } from './types';
import { EnumProvider } from './contexts/EnumContext';
import { OrderDraft } from './src/types/orderDraft';
import { ArrowLeft, LogOut, User, Menu, Loader2, Store, ShoppingCart, FileText, LayoutGrid, Settings as SettingsIcon, Download, UploadCloud, X, ClipboardList } from 'lucide-react';

type View = 'dashboard' | 'products' | 'cart' | 'orders' | 'settings' | 'customers' | 'sync' | 'send' | 'drafts';

const navMenuItems: { view: View; label: string; icon: React.ComponentType<{ className?: string }>; }[] = [
  { view: 'dashboard', label: 'Início', icon: Store },
  { view: 'products', label: 'Catálogo', icon: LayoutGrid },
  { view: 'cart', label: 'Carrinho', icon: ShoppingCart },
  { view: 'orders', label: 'Histórico', icon: FileText },
  { view: 'drafts', label: 'Rascunhos', icon: ClipboardList },
  { view: 'customers', label: 'Carteira', icon: User },
  { view: 'sync', label: 'Sincronizar', icon: Download },
  { view: 'send', label: 'Envio Pendente', icon: UploadCloud },
  { view: 'settings', label: 'Ajustes', icon: SettingsIcon },
];

export default function App() {
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [showSettingsFromLogin, setShowSettingsFromLogin] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draftToEdit, setDraftToEdit] = useState<OrderDraft | null>(null);
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const clearDraftEditing = () => setDraftToEdit(null);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [currentUser, setCurrentUser] = useState('');
  const [sellerCode, setSellerCode] = useState<string | null>(null);
  const [storeInfo, setStoreInfo] = useState<any | undefined>(undefined);

  // Inicialização do App
  useEffect(() => {
    const initApp = async () => {
      // 1. Carrega configurações do Banco de Dados
      await apiService.initializeConfig();
      
      // 2. Valida a sessão ativamente (verifica se token é válido no servidor)
      const validSession = await apiService.validateSession();
      
      setIsAuthenticated(validSession);
      if (validSession) {
          // Garante que a UI receba o nome atualizado, mesmo se vier do cache local inicial
          const resolvedName = await apiService.resolveDisplayName();
          setCurrentUser(resolvedName);
          setSellerCode(apiService.getSellerId());
          
          // Tenta buscar o perfil mais atual em background para corrigir "Terminal Vinculado"
          // se a conexão estiver disponível
          apiService.fetchProfile().then(profile => {
              if (profile) {
                setCurrentUser(profile.name);
                if (profile.seller_id) setSellerCode(profile.seller_id);
              }
              apiService.resolveDisplayName().then((name) => {
                setCurrentUser(name);
              });
          });
      }
      
      setTheme(apiService.getConfig().theme);
      
      // 3. Libera a UI
      setIsConfigLoaded(true);
    };

    initApp();
  }, []);

  // Carrega rascunho de carrinho ao navegar para Cart (duplicar pedido)
  const hydrateCartFromDraft = async (draft: OrderDraft): Promise<CartItem[]> => {
    return Promise.all(draft.itens.map(async (item) => {
      let basePrice = Number(item.base_price ?? item.valor_unitario ?? 0);
      try {
        const product = await dbService.getProductById(item.codigo_produto);
        if (product?.price) basePrice = product.price;
        return {
          id: item.codigo_produto,
          name: item.nome_produto || product?.name || item.codigo_produto,
          description: product?.description || item.descricao || '',
          price: Number(item.valor_unitario ?? basePrice),
          basePrice,
          category: product?.category || '',
          stock: product?.stock ?? 0,
          unit: product?.unit || item.unidade || 'un',
          quantity: item.quantidade,
          sectionCode: product?.sectionCode,
          groupCode: product?.groupCode,
          subgroupCode: product?.subgroupCode,
        };
      } catch {
        return {
          id: item.codigo_produto,
          name: item.nome_produto || item.codigo_produto,
          description: item.descricao || '',
          price: Number(item.valor_unitario ?? basePrice),
          basePrice,
          category: '',
          stock: 0,
          unit: item.unidade || 'un',
          quantity: item.quantidade,
        };
      }
    }));
  };

  useEffect(() => {
    if (currentView === 'cart') {
       const loadDraft = async () => {
          try {
            if (cart.length > 0) return;
            setDraftToEdit(null);
            const draftRaw = localStorage.getItem('orderDraftEdit');
            if (draftRaw) {
              const draft: OrderDraft = JSON.parse(draftRaw);
              setDraftToEdit(draft);
              const hydrated = await hydrateCartFromDraft(draft);
              if (hydrated.length > 0) {
                setCart(hydrated);
              }
              return;
            }

            const raw = localStorage.getItem('cartDraft');
            if (!raw) return;
            const items: CartItem[] = JSON.parse(raw);
            if (Array.isArray(items) && items.length > 0) {
               const hydrated = await Promise.all(items.map(async (item) => {
                  let basePrice = item.basePrice ?? (Number(item.price) || 0);
                  try {
                    const product = await dbService.getProductById(item.id);
                    if (product?.price) basePrice = product.price;
                  } catch {}
                  return { ...item, quantity: Number(item.quantity) || 1, price: Number(item.price) || 0, basePrice };
               }));
               setCart(hydrated);
            }
          } catch {}
          finally {
            localStorage.removeItem('cartDraft');
            localStorage.removeItem('orderDraftEdit');
          }
       };
       loadDraft();
    }
  }, [currentView, cart.length]);

  // Efeito apenas para tema visual
  useEffect(() => {
    const applyTheme = () => {
      const isDark = 
        theme === 'dark' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    applyTheme();
  }, [theme]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setCurrentUser(apiService.getUsername());
    apiService.resolveDisplayName().then((name) => {
      setCurrentUser(name);
    });
    setSellerCode(apiService.getSellerId());
    setShowSettingsFromLogin(false);
    setCurrentView('dashboard');
    refreshStoreInfo();
  };

  const handleLogout = () => {
    apiService.logout();
    setIsAuthenticated(false);
    setCurrentView('dashboard');
    setStoreInfo(undefined);
  };

  const refreshStoreInfo = async () => {
    try {
      const res = await apiService.fetchWithAuth('/api/store/public');
      if (res.ok) {
        const data = await res.json();
        setStoreInfo(data);
        return;
      }
      setStoreInfo(null);
    } catch (error) {
      console.warn('Falha ao carregar dados da loja', error);
      setStoreInfo(null);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    refreshStoreInfo();
  }, [isAuthenticated]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        const isFractional = product.unit.toLowerCase() === 'cto';
        const increment = isFractional ? 0.01 : 1;
        const newQty = existing.quantity + increment;
        const finalQty = isFractional ? Math.round(newQty * 100) / 100 : newQty;

        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: finalQty } : item
        );
      }
      return [...prev, { ...product, quantity: product.unit.toLowerCase() === 'cto' ? 1.00 : 1, basePrice: product.price }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const toggleCartProduct = (product: Product) => {
    const exists = cart.find(i => i.id === product.id);
    if (exists) {
      removeFromCart(product.id);
    } else {
      addToCart(product);
    }
  };

  const updateQuantity = (id: string, newQuantity: number) => {
    // Se o usuário definir 0 ou menos, removemos o item
    if (newQuantity <= 0) {
        removeFromCart(id);
        return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const isFractional = item.unit.toLowerCase() === 'cto';
          let qty = newQuantity;

          if (isFractional) {
             qty = Math.round(qty * 100) / 100;
             // Permite editar livremente, mas mantemos consistência de decimais
          } else {
             qty = Math.floor(qty);
          }
          
          return { ...item, quantity: qty };
        }
        return item;
      })
    );
  };

  const clearCart = () => {
    setCart([]);
    setCurrentView('dashboard');
  };

  // --- TELA DE CARREGAMENTO (SPLASH) ---
  if (!isConfigLoaded) {
      return (
          <div className="flex flex-col items-center justify-center h-screen bg-blue-900 text-white gap-4">
              <Store className="w-12 h-12 mb-2" />
              <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                  <span className="font-semibold text-sm">Validando acesso seguro...</span>
              </div>
          </div>
      );
  }

  // Renderização Condicional Limpa
  if (!isAuthenticated) {
    if (showSettingsFromLogin) {
      return (
        <Settings 
            onClose={() => setShowSettingsFromLogin(false)} 
            onThemeChange={setTheme} 
        />
      );
    }
    return (
        <Login 
            onLoginSuccess={handleLoginSuccess} 
            onOpenSettings={() => setShowSettingsFromLogin(true)} 
        />
    );
  }

  const getHeaderTitle = () => {
    switch (currentView) {
      case 'dashboard': return 'Início';
      case 'products': return 'Catálogo';
      case 'cart': return 'Carrinho';
      case 'orders': return 'Meus Pedidos';
      case 'drafts': return 'Rascunhos';
      case 'customers': return 'Carteira de Clientes';
      case 'settings': return 'Ajustes';
      case 'sync': return 'Sincronizar Dados';
      case 'send': return 'Envio Pendente';
      default: return 'SalesForce';
    }
  };

  return (
    <EnumProvider>
      <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Cabeçalho Azul Profundo (Navy) */}
          <header className="bg-blue-900 text-white shadow-lg sticky top-0 z-30 border-b border-blue-800">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
            {currentView !== 'dashboard' ? (
              <button 
                onClick={() => setCurrentView('dashboard')} 
                className="p-2 hover:bg-blue-800 rounded-full transition-colors text-white"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            ) : (
               <button
                 onClick={() => setIsMainMenuOpen(true)}
                 className="p-2 bg-blue-800 rounded-lg shadow-inner text-orange-400"
                 aria-label="Abrir menu principal"
               >
                  <Menu className="w-6 h-6" />
               </button>
            )}
            <div>
              <h1 className="text-lg font-bold leading-tight text-white">
                {getHeaderTitle()}
              </h1>
              {currentView === 'dashboard' && (
                 <p className="text-xs text-orange-300 font-medium">SalesForce Pro</p>
              )}
            </div>
            </div>
            {storeInfo && (
              <div className="hidden md:flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/25">
                {storeInfo.logo_url ? (
                  <img src={storeInfo.logo_url} alt={storeInfo.trade_name || 'Loja'} className="h-9 w-9 object-contain rounded-full border border-white/30" />
                ) : (
                  <Store className="w-6 h-6 text-white/80" />
                )}
                <div className="text-left text-xs">
                  <p className="font-semibold leading-none">{storeInfo.trade_name || storeInfo.legal_name || 'SalesForce Pro'}</p>
                  <p className="text-[10px] uppercase tracking-wider text-white/70">
                    Loja {storeInfo.id?.toString().padStart(2, '0')}
                  </p>
                </div>
              </div>
            )}
  
          <div className="flex items-center gap-2">
              {currentUser && (
                  <div className="flex flex-col items-end mr-1">
                      <span className="text-[10px] text-blue-300 uppercase font-bold tracking-wider">Vendedor</span>
                      <span className="text-sm font-bold text-white leading-none">
                        {currentUser}{sellerCode ? ` (${sellerCode})` : ''}
                      </span>
                  </div>
              )}

              <button
                onClick={() => setCurrentView('cart')}
                className="relative p-2 hover:bg-blue-800 rounded-full text-blue-200 hover:text-white transition-colors"
                title="Carrinho"
              >
                <ShoppingCart className="w-5 h-5" />
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border border-blue-900">
                    {cart.reduce((a, b) => a + b.quantity, 0)}
                  </span>
                )}
              </button>

              <button 
                onClick={handleLogout} 
                className="p-2 hover:bg-blue-800 rounded-full text-blue-200 hover:text-white transition-colors" 
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto w-full min-h-full">
          {currentView === 'dashboard' && (
            <Dashboard onNavigate={(v) => setCurrentView(v as View)} cartCount={cart.reduce((a, b) => a + b.quantity, 0)} />
          )}
          {currentView === 'products' && (
            <ProductList onAddToCart={addToCart} onRemoveFromCart={removeFromCart} onToggleCart={toggleCartProduct} cart={cart} />
          )}
          {currentView === 'cart' && (
            <Cart 
              cart={cart} 
              onUpdateQuantity={updateQuantity} 
              onUpdatePrice={(id, newPrice) => {
                 if (newPrice <= 0 || isNaN(newPrice)) return;
                 setCart(prev => prev.map(i => {
                   if (i.id !== id) return i;
                   const floor = i.basePrice ?? i.price;
                   if (newPrice < floor) return i;
                   return { ...i, price: newPrice };
                 }));
              }}
              onRemove={removeFromCart} 
              onClear={clearCart} 
              draftToEdit={draftToEdit}
              onClearDraft={clearDraftEditing}
            />
          )}
          {/* Unificando a visão de Pedidos e Envio Pendente no Histórico */}
          {(currentView === 'orders' || currentView === 'send') && (
            <OrderHistory 
                onNavigate={(v) => setCurrentView(v as View)} 
                initialTab={currentView === 'send' ? 'pending' : 'all'}
                storeInfo={storeInfo}
            />
          )}
          {currentView === 'drafts' && (
            <DraftsPage
              onNavigate={(v) => setCurrentView(v as View)}
              onEditDraft={(draft) => {
                try {
                  localStorage.setItem('orderDraftEdit', JSON.stringify(draft));
                } catch {}
                setCurrentView('cart');
              }}
            />
          )}
          {currentView === 'customers' && (
            <CustomerList />
          )}
          {currentView === 'settings' && (
            <Settings 
                onClose={() => setCurrentView('dashboard')} 
                onLogout={handleLogout}
                onThemeChange={setTheme} 
            />
          )}
          {currentView === 'sync' && (
             <SyncData onBack={() => setCurrentView('dashboard')} />
          )}
        </div>
      </main>

      {isMainMenuOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMainMenuOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
            className="relative z-10 h-full max-w-xs w-full bg-white dark:bg-slate-900 shadow-2xl border-r border-slate-200 dark:border-slate-800 flex flex-col p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Menu</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">SalesForce Pro</h2>
              </div>
              <button
                onClick={() => setIsMainMenuOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-6 space-y-2">
              {navMenuItems.map((item) => {
                const active = item.view === currentView;
                return (
                  <button
                    key={item.view}
                    onClick={() => {
                      setCurrentView(item.view);
                      setIsMainMenuOpen(false);
                    }}
                    className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                      active
                        ? 'bg-blue-900 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-semibold text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}
      </div>
    </EnumProvider>
  );
}
