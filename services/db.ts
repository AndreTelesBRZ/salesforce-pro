
import { Product, Order, Customer, AppConfig, DelinquencyItem } from '../types';

const DB_NAME = 'SalesForceDB';
const DB_VERSION = 5;
const STORE_PRODUCTS = 'products';
const STORE_ORDERS = 'orders';
const STORE_CUSTOMERS = 'customers';
const STORE_SETTINGS = 'settings';
const STORE_DELINQUENCY = 'delinquency';

class DatabaseService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store de Produtos
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const store = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('description', 'description', { unique: false });
        }

        // Store de Pedidos
        if (!db.objectStoreNames.contains(STORE_ORDERS)) {
          const orderStore = db.createObjectStore(STORE_ORDERS, { keyPath: 'id' });
          orderStore.createIndex('createdAt', 'createdAt', { unique: false });
          orderStore.createIndex('status', 'status', { unique: false });
          orderStore.createIndex('displayId', 'displayId', { unique: true });
          orderStore.createIndex('businessStatus', 'businessStatus', { unique: false });
        }

        // Store de Clientes
        if (!db.objectStoreNames.contains(STORE_CUSTOMERS)) {
            const customerStore = db.createObjectStore(STORE_CUSTOMERS, { keyPath: 'id' });
            customerStore.createIndex('name', 'name', { unique: false });
            customerStore.createIndex('document', 'document', { unique: false });
        }

        // Store de Inadimplencia
        if (!db.objectStoreNames.contains(STORE_DELINQUENCY)) {
            const delinquencyStore = db.createObjectStore(STORE_DELINQUENCY, { keyPath: 'id' });
            delinquencyStore.createIndex('sellerId', 'sellerId', { unique: false });
            delinquencyStore.createIndex('customerCode', 'customerCode', { unique: false });
            delinquencyStore.createIndex('dueDate', 'dueDate', { unique: false });
        }

        // Store de Configurações
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
            db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
      };
    });
    
    return this.initPromise;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    return this.db!;
  }

  // --- ARMAZENAMENTO PERSISTENTE ---
  
  async isStoragePersisted(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persisted) {
      return await navigator.storage.persisted();
    }
    return false;
  }

  async requestPersistentStorage(): Promise<boolean> {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
    return false;
  }

  // --- CONFIGURAÇÕES (SETTINGS) ---

  async saveSettings(config: AppConfig): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_SETTINGS], 'readwrite');
        const store = transaction.objectStore(STORE_SETTINGS);
        const request = store.put({ key: 'appConfig', value: config });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
  }

  async getSettings(): Promise<AppConfig | null> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
          try {
            const transaction = db.transaction([STORE_SETTINGS], 'readonly');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.get('appConfig');
            request.onsuccess = () => {
                resolve(request.result ? request.result.value : null);
            };
            request.onerror = () => resolve(null);
          } catch (e) {
              resolve(null);
          }
      });
  }

  // --- SEQUÊNCIA DE PEDIDOS ---

  async generateNextOrderId(): Promise<number> {
    const db = await this.getDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_SETTINGS, STORE_ORDERS], 'readwrite');
        const settingsStore = transaction.objectStore(STORE_SETTINGS);
        const ordersStore = transaction.objectStore(STORE_ORDERS);
        
        const getSettingReq = settingsStore.get('lastOrderId');
        
        getSettingReq.onsuccess = () => {
            if (getSettingReq.result) {
                const nextId = getSettingReq.result.value + 1;
                settingsStore.put({ key: 'lastOrderId', value: nextId });
                resolve(nextId);
            } else {
                const index = ordersStore.index('displayId');
                const cursorReq = index.openCursor(null, 'prev');
                
                cursorReq.onsuccess = () => {
                    const cursor = cursorReq.result;
                    let maxId = 0;
                    if (cursor && cursor.value.displayId) {
                        maxId = cursor.value.displayId;
                    }
                    
                    const nextId = maxId + 1;
                    settingsStore.put({ key: 'lastOrderId', value: nextId });
                    resolve(nextId);
                };
                
                cursorReq.onerror = () => {
                    settingsStore.put({ key: 'lastOrderId', value: 1 });
                    resolve(1);
                };
            }
        };
        
        getSettingReq.onerror = () => reject(getSettingReq.error);
    });
  }

  // --- MÉTODOS DE PRODUTOS ---

  async clearProducts(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_PRODUCTS], 'readwrite');
      const store = transaction.objectStore(STORE_PRODUCTS);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async bulkAddProducts(products: Product[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_PRODUCTS], 'readwrite');
      const store = transaction.objectStore(STORE_PRODUCTS);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      products.forEach(product => {
        store.put(product);
      });
    });
  }

  async getProductById(id: string): Promise<Product | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_PRODUCTS], 'readonly');
      const store = transaction.objectStore(STORE_PRODUCTS);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async countProducts(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_PRODUCTS], 'readonly');
      const store = transaction.objectStore(STORE_PRODUCTS);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async searchProducts(
    page: number = 1, 
    limit: number = 50, 
    searchTerm: string = '', 
    category: string = 'Todas'
  ): Promise<{ products: Product[], total: number }> {
    const db = await this.getDB();
    const products: Product[] = [];
    const terms = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
    
    // Calcula offset e limite
    const offset = (page - 1) * limit;
    let skipped = 0;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_PRODUCTS], 'readonly');
      const store = transaction.objectStore(STORE_PRODUCTS);
      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
        
        // PONTO DE OTIMIZAÇÃO CRÍTICO:
        // Se já temos produtos suficientes para a página, paramps IMEDIATAMENTE.
        if (products.length >= limit) {
           resolve({ products, total: -1 });
           return;
        }

        if (cursor) {
          const p = cursor.value as Product;
          let match = true;

          // Filtro de Categoria
          if (category !== 'Todas' && p.category !== category) match = false;

          // Filtro de Texto
          if (match && terms.length > 0) {
            const text = `${p.id} ${p.name} ${p.description || ''} ${p.category || ''}`.toLowerCase();
            // Verifica se todos os termos digitados estão presentes
            for (const term of terms) {
                if (!text.includes(term)) {
                    match = false;
                    break;
                }
            }
          }

          if (match) {
            // Paginação manual: pula os primeiros 'offset' itens
            if (skipped < offset) {
                skipped++;
            } else {
                products.push(p);
            }
          }
          
          cursor.continue();
        } else {
          // Fim do cursor (sem mais itens no DB)
          resolve({ products, total: products.length });
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  // --- MÉTODOS DE CLIENTES ---

  async clearCustomers(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CUSTOMERS], 'readwrite');
      const store = transaction.objectStore(STORE_CUSTOMERS);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async bulkAddCustomers(customers: Customer[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CUSTOMERS], 'readwrite');
      const store = transaction.objectStore(STORE_CUSTOMERS);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      customers.forEach(customer => {
        store.put(customer);
      });
    });
  }

  async getLocalCustomers(): Promise<Customer[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CUSTOMERS], 'readonly');
      const store = transaction.objectStore(STORE_CUSTOMERS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async countCustomers(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_CUSTOMERS], 'readonly');
      const store = transaction.objectStore(STORE_CUSTOMERS);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- MÉTODOS DE INADIMPLÊNCIA ---

  async clearDelinquency(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_DELINQUENCY], 'readwrite');
      const store = transaction.objectStore(STORE_DELINQUENCY);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async bulkAddDelinquency(items: DelinquencyItem[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_DELINQUENCY], 'readwrite');
      const store = transaction.objectStore(STORE_DELINQUENCY);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      items.forEach(item => {
        store.put(item);
      });
    });
  }

  async getDelinquency(): Promise<DelinquencyItem[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_DELINQUENCY], 'readonly');
      const store = transaction.objectStore(STORE_DELINQUENCY);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async countDelinquency(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_DELINQUENCY], 'readonly');
      const store = transaction.objectStore(STORE_DELINQUENCY);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- MÉTODOS DE PEDIDOS (Store/Retrieve Local) ---

  async saveOrder(order: Order): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ORDERS], 'readwrite');
      const store = transaction.objectStore(STORE_ORDERS);
      const request = store.put(order);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async bulkPutOrders(orders: Order[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ORDERS], 'readwrite');
      const store = transaction.objectStore(STORE_ORDERS);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      orders.forEach(o => store.put(o));
    });
  }

  async getOrders(): Promise<Order[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ORDERS], 'readonly');
      const store = transaction.objectStore(STORE_ORDERS);
      const index = store.index('createdAt');
      // Pega todos ordenados por data (mais recente no final, revertemos no JS)
      const request = index.getAll();
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingOrders(): Promise<Order[]> {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_ORDERS], 'readonly');
        const store = transaction.objectStore(STORE_ORDERS);
        const index = store.index('status');
        const request = index.getAll('pending');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
  }

  async deleteOrder(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ORDERS], 'readwrite');
      const store = transaction.objectStore(STORE_ORDERS);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const dbService = new DatabaseService();
