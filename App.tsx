
import React, { useState, useEffect } from 'react';
import { ProductList } from './components/ProductList';
import { Cart } from './components/Cart';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { CustomerList } from './components/CustomerList';
import { OrderHistory } from './components/OrderHistory';
import { SyncData } from './components/SyncData';
import { apiService } from './services/api';
import { Product, CartItem, ThemeMode } from './types';
import { ArrowLeft, LogOut, User, Menu, Loader2, Store } from 'lucide-react';

type View = 'dashboard' | 'products' | 'cart' | 'orders' | 'settings' | 'customers' | 'sync' | 'send';

export default function App() {
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [showSettingsFromLogin, setShowSettingsFromLogin] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [currentUser, setCurrentUser] = useState('');
  const [sellerCode, setSellerCode] = useState<string | null>(null);

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
          setCurrentUser(apiService.getUsername());
          setSellerCode(apiService.getSellerId());
          
          // Tenta buscar o perfil mais atual em background para corrigir "Terminal Vinculado"
          // se a conexão estiver disponível
          apiService.fetchProfile().then(profile => {
              if (profile) {
                setCurrentUser(profile.name);
                if (profile.seller_id) setSellerCode(profile.seller_id);
              }
          });
      }
      
      setTheme(apiService.getConfig().theme);
      
      // 3. Libera a UI
      setIsConfigLoaded(true);
    };

    initApp();
  }, []);

  // Carrega rascunho de carrinho ao navegar para Cart (duplicar pedido)
  useEffect(() => {
    if (currentView === 'cart') {
       try {
          const raw = localStorage.getItem('cartDraft');
          if (raw) {
            const items: CartItem[] = JSON.parse(raw);
            // Ignora se carrinho já tem itens (não sobrescreve pedido atual)
            if (cart.length === 0 && Array.isArray(items) && items.length > 0) {
               setCart(items.map(i => ({ ...i, quantity: Number(i.quantity) || 1, price: Number(i.price) || 0 })));
            }
            localStorage.removeItem('cartDraft');
          }
       } catch {}
    }
  }, [currentView]);

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
    setSellerCode(apiService.getSellerId());
    setShowSettingsFromLogin(false);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    apiService.logout();
    setIsAuthenticated(false);
    setCurrentView('dashboard');
  };

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
      return [...prev, { ...product, quantity: product.unit.toLowerCase() === 'cto' ? 1.00 : 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
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
      case 'dashboard': return 'Visão Geral';
      case 'products': return 'Catálogo';
      case 'cart': return 'Carrinho';
      case 'orders': return 'Meus Pedidos';
      case 'customers': return 'Carteira de Clientes';
      case 'settings': return 'Ajustes';
      case 'sync': return 'Sincronizar Dados';
      case 'send': return 'Envio Pendente';
      default: return 'SalesForce';
    }
  };

  return (
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
               <div className="p-2 bg-blue-800 rounded-lg shadow-inner text-orange-400">
                  <Menu className="w-6 h-6" />
               </div>
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
            <ProductList onAddToCart={addToCart} cart={cart} />
          )}
          {currentView === 'cart' && (
            <Cart 
              cart={cart} 
              onUpdateQuantity={updateQuantity} 
              onUpdatePrice={(id, newPrice) => {
                 if (newPrice <= 0 || isNaN(newPrice)) return;
                 setCart(prev => prev.map(i => {
                   if (i.id !== id) return i;
                   // Nunca permitir reduzir o preço abaixo do atual
                   if (newPrice < i.price) return i;
                   return { ...i, price: newPrice };
                 }));
              }}
              onRemove={removeFromCart} 
              onClear={clearCart} 
            />
          )}
          {/* Unificando a visão de Pedidos e Envio Pendente no Histórico */}
          {(currentView === 'orders' || currentView === 'send') && (
            <OrderHistory 
                onNavigate={(v) => setCurrentView(v as View)} 
                initialTab={currentView === 'send' ? 'pending' : 'all'}
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
    </div>
  );
}
