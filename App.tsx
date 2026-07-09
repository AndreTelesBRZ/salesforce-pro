import React, { useState, useEffect } from 'react';
import { ProductList } from './components/ProductList';
import { Cart } from './components/Cart';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { CustomerList } from './components/CustomerList';
import { SalesHistoryPage } from './components/SalesHistoryPage';
import { OrderHistory } from './components/OrderHistory';
import { SyncData } from './components/SyncData';
import { ReportsPage } from './components/ReportsPage';
import { DraftsPage } from './src/pages/DraftsPage';
import { CounterSalePage } from './components/CounterSalePage';
import { apiService } from './services/api';
import { dbService } from './services/db';
import { Product, CartItem, ThemeMode, Customer, UserSessionProfile } from './types';
import { EnumProvider } from './contexts/EnumContext';
import { OrderDraft } from './src/types/orderDraft';
import { APP_VERSION_INFO } from './src/version';
import { getTenantConfig } from './src/config/tenantConfig';
import { ArrowLeft, LogOut, User, Menu, Loader2, Store, ShoppingCart, FileText, LayoutGrid, Settings as SettingsIcon, Download, UploadCloud, X, ClipboardList, BarChart3 } from 'lucide-react';
import { SyncIndicator } from './components/SyncIndicator';
import { backgroundSync } from './services/backgroundSync';

type View = 'dashboard' | 'products' | 'reports' | 'sales-history' | 'cart' | 'orders' | 'settings' | 'customers' | 'sync' | 'send' | 'drafts';

const navMenuItems: { view: View; label: string; icon: React.ComponentType<{ className?: string }>; }[] = [
  { view: 'dashboard', label: 'Início', icon: Store },
  { view: 'products', label: 'Catálogo', icon: LayoutGrid },
  { view: 'cart', label: 'Carrinho', icon: ShoppingCart },
  { view: 'drafts', label: 'Rascunhos', icon: ClipboardList },
  { view: 'reports', label: 'Relatórios', icon: BarChart3 },
  { view: 'sales-history', label: 'Consulta de vendas', icon: FileText },
  { view: 'orders', label: 'Histórico', icon: FileText },
  { view: 'customers', label: 'Carteira', icon: User },
  { view: 'sync', label: 'Sincronizar', icon: Download },
  { view: 'send', label: 'Envio pendente', icon: UploadCloud },
  { view: 'settings', label: 'Ajustes', icon: SettingsIcon },
];

const resolveProtectedStoreLabel = (): string => {
  const tenant = getTenantConfig(typeof window !== 'undefined' ? window.location.hostname : '');
  return tenant.mapped ? tenant.storeCode.replace(/^0+/, '') : '';
};

type RouteMode = 'app' | 'balcao' | 'desktop';

const resolveRouteMode = (): RouteMode => {
  if (typeof window === 'undefined') return 'app';
  const path = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
  if (path === '/balcao') return 'balcao';
  // Rota exclusiva para venda balcão desktop. /pedido é mantida por compatibilidade.
  if (path === '/venda-balcao' || path === '/pedido-balcao' || path === '/pedido' || path === '/venda-desktop' || path === '/pedido-desktop') return 'desktop';
  return 'app';
};

const navigateToPath = (path: string) => {
  if (typeof window === 'undefined') return;
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

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
  const [userProfile, setUserProfile] = useState<UserSessionProfile | null>(null);
  const [storeInfo, setStoreInfo] = useState<any | undefined>(undefined);
  const [salesHistoryCustomer, setSalesHistoryCustomer] = useState<Customer | null>(null);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [routeMode, setRouteMode] = useState<RouteMode>(resolveRouteMode());

  const canAccessView = (view: View, profile: UserSessionProfile | null): boolean => {
    if (!profile) return view === 'dashboard' || view === 'settings';
    const perms = profile.permissions;
    switch (view) {
      case 'dashboard':
      case 'settings':
        return true;
      case 'products':
        return perms.can_view_products;
      case 'customers':
        return perms.can_view_clients;
      case 'cart':
        return perms.can_view_sales && perms.can_create_sales;
      case 'sales-history':
      case 'orders':
      case 'send':
      case 'drafts':
      case 'reports':
        return perms.can_view_sales;
      case 'sync':
        return perms.can_view_products || perms.can_view_clients;
      default:
        return false;
    }
  };

  useEffect(() => {
    const handlePopState = () => setRouteMode(resolveRouteMode());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const initApp = async () => {
      await apiService.initializeConfig();
      const validSession = await apiService.validateSession();

      setIsAuthenticated(validSession);
      if (validSession) {
        const profile = apiService.getCurrentUserProfile();
        setUserProfile(profile);
        const resolvedName = await apiService.resolveDisplayName();
        setCurrentUser(resolvedName);
        setSellerCode(apiService.getSellerId());

        apiService.fetchProfile().then(profile => {
          if (profile) {
            setUserProfile(profile);
            setCurrentUser(profile.name);
            if (profile.seller_id) setSellerCode(profile.seller_id);
          }
          apiService.resolveDisplayName().then((name) => {
            setCurrentUser(name);
          });
        });
        backgroundSync.start();
      }

      setTheme(apiService.getConfig().theme);
      setIsConfigLoaded(true);
    };

    initApp();
  }, []);

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
          unit: item.unidade || product?.unit || 'un',
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

  useEffect(() => {
    const unsubscribe = apiService.onSessionExpired(() => {
      setIsAuthenticated(false);
      setUserProfile(null);
      setCurrentView('dashboard');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!canAccessView(currentView, userProfile)) {
      setCurrentView('dashboard');
    }
  }, [currentView, userProfile]);

  useEffect(() => {
    if (!isAuthenticated) {
      setPendingOrderCount(0);
      return;
    }

    dbService.getPendingOrders()
      .then((orders) => setPendingOrderCount(orders.length))
      .catch(() => setPendingOrderCount(0));
  }, [isAuthenticated, currentView, cart.length]);

  const handleLoginSuccess = () => {
    const nextRouteMode = resolveRouteMode();
    setIsAuthenticated(true);
    setUserProfile(apiService.getCurrentUserProfile());
    setCurrentUser(apiService.getUsername());
    apiService.resolveDisplayName().then((name) => {
      setCurrentUser(name);
    });
    setSellerCode(apiService.getSellerId());
    setShowSettingsFromLogin(false);
    setRouteMode(nextRouteMode);
    if (nextRouteMode !== 'balcao') {
      setCurrentView('dashboard');
    }
    refreshStoreInfo();
    backgroundSync.start();
  };

  const handleLogout = () => {
    apiService.logout();
    setIsAuthenticated(false);
    setUserProfile(null);
    setCurrentView('dashboard');
    setStoreInfo(undefined);
    backgroundSync.stop();
  };

  const openCounterSale = () => navigateToPath('/balcao');
  const closeCounterSale = () => navigateToPath('/');

  const visibleNavMenuItems = navMenuItems.filter((item) => canAccessView(item.view, userProfile));
  const menuSections: { title?: string; items: typeof visibleNavMenuItems }[] = [
    { items: visibleNavMenuItems.filter((item) => item.view === 'dashboard') },
    {
      title: 'Vendas',
      items: visibleNavMenuItems.filter((item) => ['products', 'cart', 'drafts', 'sales-history'].includes(item.view)),
    },
    {
      title: 'Acompanhamento',
      items: visibleNavMenuItems.filter((item) => ['orders', 'reports', 'send'].includes(item.view)),
    },
    {
      title: 'Conta',
      items: visibleNavMenuItems.filter((item) => ['customers', 'sync', 'settings'].includes(item.view)),
    },
  ].filter((section) => section.items.length > 0);

  const refreshStoreInfo = async () => {
    try {
      if (isAuthenticated) {
        await apiService.refreshProtectedStoreFromERP();
      }
      const data = await apiService.loadTenantStoreInfo(true);
      setStoreInfo(data);
    } catch (error) {
      console.warn('Falha ao carregar dados da loja', error);
      setStoreInfo(null);
    }
  };

  useEffect(() => {
    if (!isConfigLoaded) return;
    refreshStoreInfo();
  }, [isConfigLoaded, isAuthenticated]);

  const addToCart = (product: Product, qty?: number) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const increment = qty ?? 1;
      if (existing) {
        const isFractional = product.unit.toLowerCase() === 'cto';
        const newQty = isFractional ? Math.round((existing.quantity + increment) * 100) / 100 : existing.quantity + increment;
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: newQty } : item
        );
      }
      return [...prev, { ...product, quantity: increment, basePrice: product.price }];
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
        storeInfo={storeInfo}
      />
    );
  }

  if (routeMode === 'balcao') {
    return (
      <EnumProvider>
        <CounterSalePage
          currentUser={currentUser}
          sellerCode={sellerCode}
          storeInfo={storeInfo}
          permissions={userProfile?.permissions || null}
          onBackToApp={closeCounterSale}
          onLogout={handleLogout}
        />
      </EnumProvider>
    );
  }

  if (routeMode === 'desktop') {
    if (!userProfile) {
      return (
        <div className="min-h-screen w-full bg-[#f4f5f7] dark:bg-slate-950 flex items-center justify-center text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando perfil...
        </div>
      );
    }
    if (!canAccessView('cart', userProfile)) {
      return (
        <div className="min-h-screen w-full bg-[#f4f5f7] dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-[#eaecf0] bg-white p-6 text-center shadow-sm dark:bg-slate-900 dark:border-slate-700">
            <ShoppingCart className="mx-auto mb-3 h-8 w-8 text-[#98a2b3]" />
            <h1 className="text-base font-semibold text-[#1a1d21] dark:text-white">Acesso restrito</h1>
            <p className="mt-2 text-sm text-[#667085] dark:text-slate-400">Seu perfil não possui permissão para criar vendas.</p>
          </div>
        </div>
      );
    }
    return (
      <EnumProvider>
        <div className="min-h-screen w-full bg-[#f4f5f7] dark:bg-slate-950 text-slate-800 dark:text-white p-6 overflow-auto">
          <Cart
            storeInfo={storeInfo}
            cart={cart}
            onUpdateQuantity={updateQuantity}
            onUpdatePrice={(id, newPrice) => {
              if (isNaN(newPrice) || newPrice < 0) return;
              if (newPrice === 0) {
                removeFromCart(id);
                return;
              }
              setCart(prev => prev.map(i => {
                if (i.id !== id) return i;
                return { ...i, price: newPrice };
              }));
            }}
            onRemove={removeFromCart}
            onClear={clearCart}
            draftToEdit={draftToEdit}
            onClearDraft={clearDraftEditing}
            onAddToCart={addToCart}
          />
        </div>
      </EnumProvider>
    );
  }

  const getHeaderTitle = () => {
    switch (currentView) {
      case 'dashboard': return 'Início';
      case 'products': return 'Catálogo';
      case 'reports': return 'Relatórios';
      case 'sales-history': return 'Consulta de Vendas';
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
      <div className="flex flex-col h-screen bg-[#0a0a0f] text-white">
        <header className="bg-[#0d0d14] text-white sticky top-0 z-30 border-b border-white/[0.08]">
          <div className="max-w-2xl mx-auto px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {currentView !== 'dashboard' ? (
                <button
                  onClick={() => setCurrentView('dashboard')}
                  className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              ) : (
                <button
                  onClick={() => setIsMainMenuOpen(true)}
                  className="p-1.5 bg-white/[0.08] hover:bg-white/[0.14] rounded-lg transition-colors text-white/70 shrink-0"
                  aria-label="Abrir menu principal"
                >
                  <Menu className="w-4.5 h-4.5" />
                </button>
              )}
              <div className="min-w-0">
                <h1 className="text-sm font-semibold leading-tight text-white truncate">
                  {getHeaderTitle()}
                </h1>
                {currentView === 'dashboard' && (
                  <p className="text-[10px] text-white/35 font-medium tracking-wide">SalesForce Pro</p>
                )}
              </div>
            </div>
            {storeInfo && (
              <div className="hidden md:flex items-center gap-2 bg-white/[0.06] px-2.5 py-1 rounded-full border border-white/[0.08]">
                {storeInfo.logo_url ? (
                  <img src={storeInfo.logo_url} alt={storeInfo.trade_name || 'Loja'} className="h-6 w-6 object-contain rounded-full border border-white/20" />
                ) : (
                  <Store className="w-4 h-4 text-white/50" />
                )}
                <div className="text-left">
                  <p className="text-xs font-semibold leading-none text-white/80">{storeInfo.trade_name || storeInfo.legal_name || 'SalesForce Pro'}</p>
                  <p className="text-[9px] uppercase tracking-wider text-white/40">
                    Loja {resolveProtectedStoreLabel() || storeInfo.id?.toString().padStart(2, '0')}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-1.5 shrink-0">
              {currentUser && (
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[9px] text-white/30 uppercase font-bold tracking-wider">Vendedor</span>
                  <span className="text-xs font-bold text-white/80 leading-none">
                    {currentUser}{sellerCode ? ` (${sellerCode})` : ''}
                  </span>
                </div>
              )}

              <button
                onClick={() => setCurrentView('cart')}
                className="relative p-1.5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"
                title="Carrinho"
              >
                <ShoppingCart className="w-4.5 h-4.5" />
                {cart.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {cart.reduce((a, b) => a + b.quantity, 0)}
                  </span>
                )}
              </button>

              <SyncIndicator />
              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition-colors"
                title="Sair"
              >
                <LogOut className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto w-full">
          <div className="max-w-6xl mx-auto w-full min-h-full">
            {currentView === 'dashboard' && (
              <Dashboard
                onNavigate={(v) => setCurrentView(v as View)}
                cartCount={cart.reduce((a, b) => a + b.quantity, 0)}
                permissions={userProfile?.permissions || null}
              />
            )}
            {currentView === 'products' && canAccessView('products', userProfile) && (
              <ProductList onAddToCart={addToCart} onRemoveFromCart={removeFromCart} onToggleCart={toggleCartProduct} cart={cart} />
            )}
            {currentView === 'reports' && canAccessView('reports', userProfile) && (
              <ReportsPage storeInfo={storeInfo} />
            )}
            {currentView === 'sales-history' && canAccessView('sales-history', userProfile) && (
              <SalesHistoryPage initialCustomer={salesHistoryCustomer} onNavigate={() => setCurrentView('cart')} />
            )}
            {currentView === 'cart' && canAccessView('cart', userProfile) && (
              <Cart
                storeInfo={storeInfo}
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onUpdatePrice={(id, newPrice) => {
                  if (isNaN(newPrice) || newPrice < 0) return;
                  if (newPrice === 0) {
                    removeFromCart(id);
                    return;
                  }
                  setCart(prev => prev.map(i => {
                    if (i.id !== id) return i;
                    return { ...i, price: newPrice };
                  }));
                }}
                onRemove={removeFromCart}
                onClear={clearCart}
                draftToEdit={draftToEdit}
                onClearDraft={clearDraftEditing}
                onAddToCart={addToCart}
              />
            )}
            {(currentView === 'orders' || currentView === 'send') && canAccessView(currentView, userProfile) && (
              <OrderHistory
                onNavigate={(v) => setCurrentView(v as View)}
                initialTab={currentView === 'send' ? 'pending' : 'all'}
                storeInfo={storeInfo}
              />
            )}
            {currentView === 'drafts' && canAccessView('drafts', userProfile) && (
              <DraftsPage
                storeInfo={storeInfo}
                onNavigate={(v) => setCurrentView(v as View)}
                onEditDraft={(draft) => {
                  try {
                    localStorage.setItem('orderDraftEdit', JSON.stringify(draft));
                  } catch {}
                  setCurrentView('cart');
                }}
              />
            )}
            {currentView === 'customers' && canAccessView('customers', userProfile) && (
              <CustomerList
                onOpenSalesHistory={(customer) => {
                  setSalesHistoryCustomer(customer);
                  setCurrentView('sales-history');
                }}
              />
            )}
            {currentView === 'settings' && (
              <Settings
                onClose={() => setCurrentView('dashboard')}
                onLogout={handleLogout}
                onThemeChange={setTheme}
              />
            )}
            {currentView === 'sync' && canAccessView('sync', userProfile) && (
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
              className="relative z-10 h-full max-w-xs w-full bg-[#0d0d14] shadow-2xl border-r border-white/[0.08] flex flex-col overflow-hidden"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                <div>
                  <p className="text-[11px] font-medium text-white/30 uppercase tracking-widest">Menu</p>
                  <h2 className="text-xl leading-none font-bold tracking-tight text-white mt-0.5">SalesForce Pro</h2>
                </div>
                <button
                  onClick={() => setIsMainMenuOpen(false)}
                  className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                  aria-label="Fechar menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-3">
                <div className="space-y-4">
                  {menuSections.map((section) => (
                    <div key={section.title || 'principal'} className="space-y-0.5">
                      {section.title && (
                        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/30">
                          {section.title}
                        </p>
                      )}
                      {section.items.map((item) => {
                        const active = item.view === currentView;
                        const badge = item.view === 'send' ? pendingOrderCount : undefined;
                        return (
                          <button
                            key={item.view}
                            onClick={() => {
                              setCurrentView(item.view);
                              setIsMainMenuOpen(false);
                            }}
                            className={`w-full text-left flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                              active
                                ? 'bg-blue-600/90 text-white'
                                : 'text-white/70 hover:bg-white/[0.07] hover:text-white'
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <item.icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-white/50'}`} />
                              <span className={`truncate text-sm ${active ? 'font-semibold' : 'font-normal'}`}>{item.label}</span>
                            </span>
                            {typeof badge === 'number' && badge > 0 && (
                              <span className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                                active ? 'bg-white/25 text-white' : 'bg-amber-400 text-black'
                              }`}>
                                {badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-white/[0.08] text-left">
                <p className="text-[11px] text-white/30">
                  {APP_VERSION_INFO.name} v{APP_VERSION_INFO.version}
                </p>
                <p className="mt-0.5 text-[10px] text-white/20">
                  Build {APP_VERSION_INFO.build}
                </p>
              </div>
            </aside>

          </div>
        )}
      </div>
    </EnumProvider>
  );
}
