import { apiService } from './api';

export type SyncStatusType = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

export interface BackgroundSyncState {
  status: SyncStatusType;
  lastSyncAt: Date | null;
  error: string | null;
  isSyncing: boolean;
}

class BackgroundSyncService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private _isSyncing = false;
  private _status: SyncStatusType = 'idle';
  private _lastSyncAt: Date | null = null;
  private _error: string | null = null;
  private listeners: Set<() => void> = new Set();
  private readonly INTERVAL_MS = 5 * 60 * 1000;
  private readonly SYNC_TIMEOUT_MS = 60000;

  get state(): BackgroundSyncState {
    return {
      status: this._status,
      lastSyncAt: this._lastSyncAt,
      error: this._error,
      isSyncing: this._isSyncing,
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)
      ) as Promise<T>,
    ]);
  }

  private assertSyncResult(result: { success: boolean; message?: string }, label: string) {
    if (!result.success) {
      throw new Error(result.message || `Falha na ${label}`);
    }
  }

  private async checkConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(window.location.origin, {
        method: 'HEAD',
        signal: controller.signal,
      });
      clearTimeout(id);
      return response.ok || response.status >= 400;
    } catch {
      return false;
    }
  }

  private async runSyncCycle() {
    if (this._isSyncing) return;
    this._isSyncing = true;
    this._status = 'syncing';
    this._error = null;
    this.notify();

    try {
      const hasConnection = await this.checkConnection();
      if (!hasConnection) {
        this._status = 'offline';
        this._isSyncing = false;
        this.notify();
        return;
      }

      this.assertSyncResult(await this.withTimeout(
        apiService.syncFullCatalog(() => {}),
        this.SYNC_TIMEOUT_MS,
        'Sincronização de produtos'
      ), 'sincronização de produtos');

      this.assertSyncResult(await this.withTimeout(
        apiService.syncCustomers(() => {}),
        this.SYNC_TIMEOUT_MS,
        'Sincronização de clientes'
      ), 'sincronização de clientes');

      this.assertSyncResult(await this.withTimeout(
        apiService.syncDelinquency(),
        this.SYNC_TIMEOUT_MS,
        'Sincronização de inadimplência'
      ), 'sincronização de inadimplência');

      this.assertSyncResult(await this.withTimeout(
        apiService.syncOrders(),
        this.SYNC_TIMEOUT_MS,
        'Sincronização de pedidos'
      ), 'sincronização de pedidos');

      this._status = 'success';
      this._lastSyncAt = new Date();
      this._error = null;
      this.persistLastSync();
    } catch (err: any) {
      this._status = 'error';
      this._error = err?.message || 'Falha na sincronização automática';
    } finally {
      this._isSyncing = false;
      this.notify();
    }
  }

  private persistLastSync() {
    try {
      localStorage.setItem('bgSyncLastSync', this._lastSyncAt?.toISOString() || '');
    } catch {}
  }

  private restoreLastSync() {
    try {
      const raw = localStorage.getItem('bgSyncLastSync');
      if (raw) {
        const parsed = new Date(raw);
        if (!isNaN(parsed.getTime())) {
          this._lastSyncAt = parsed;
        }
      }
    } catch {}
  }

  start() {
    if (this.intervalId) return;
    this.restoreLastSync();
    this._status = 'idle';
    this.notify();
    this.runSyncCycle();
    this.intervalId = setInterval(() => {
      this.runSyncCycle();
    }, this.INTERVAL_MS);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this._isSyncing = false;
    this._status = 'idle';
    this.notify();
  }

  async triggerManualSync() {
    await this.runSyncCycle();
  }
}

export const backgroundSync = new BackgroundSyncService();
