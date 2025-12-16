
import { Product } from '../types';
import { apiService } from './api';

class GeminiService {
  private getBaseUrl(): string {
    const base = apiService.getConfig().backendUrl?.trim().replace(/\/$/, '') || '';
    return base;
  }

  private getAuthHeader(): string | null {
    const token = localStorage.getItem('authToken') || apiService.getConfig().apiToken;
    return token ? `Bearer ${token}` : null;
  }

  async generateSalesPitch(product: Product): Promise<string> {
    const auth = this.getAuthHeader();
    const tryFetch = async (url: string) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: auth } : {})
        },
        body: JSON.stringify({ product })
      });
      if (!res.ok) throw res;
      return res.json();
    };
    try {
      const base = this.getBaseUrl();
      // Tenta remoto (se configurado)
      if (base) {
        try {
          const data = await tryFetch(`${base}/api/ai/pitch`);
          return data.text || 'Não foi possível gerar o argumento de vendas.';
        } catch {}
      }
      // Fallback para local
      const data = await tryFetch(`/api/ai/pitch`);
      return data.text || 'Não foi possível gerar o argumento de vendas.';
    } catch {
      return 'Erro ao comunicar com o servidor de IA.';
    }
  }

  async generateProductImage(product: Product): Promise<string | null> {
    const auth = this.getAuthHeader();
    const tryFetch = async (url: string) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: auth } : {})
        },
        body: JSON.stringify({ product })
      });
      if (!res.ok) throw res;
      return res.json();
    };
    try {
      const base = this.getBaseUrl();
      if (base) {
        try {
          const data = await tryFetch(`${base}/api/ai/image`);
          return data.imageDataUrl || null;
        } catch {}
      }
      const data = await tryFetch(`/api/ai/image`);
      return data.imageDataUrl || null;
    } catch {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
