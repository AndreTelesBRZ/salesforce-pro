
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
    try {
      const base = this.getBaseUrl();
      const url = `${base}/api/ai/pitch`;
      const auth = this.getAuthHeader();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: auth } : {})
        },
        body: JSON.stringify({ product })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return data.message || 'Falha ao gerar argumento de vendas.';
      }
      const data = await res.json();
      return data.text || 'Não foi possível gerar o argumento de vendas.';
    } catch (e: any) {
      return 'Erro ao comunicar com o servidor de IA.';
    }
  }

  async generateProductImage(product: Product): Promise<string | null> {
    try {
      const base = this.getBaseUrl();
      const url = `${base}/api/ai/image`;
      const auth = this.getAuthHeader();
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: auth } : {})
        },
        body: JSON.stringify({ product })
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.imageDataUrl || null;
    } catch (e) {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
