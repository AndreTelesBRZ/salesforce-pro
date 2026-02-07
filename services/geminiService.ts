import { Product } from '../types';
import { apiService } from './api';

class GeminiService {
  private async postToAi<T extends Record<string, any>>(endpoint: string, payload: Record<string, any>): Promise<T> {
    const response = await apiService.fetchWithAuth(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`AI request failed (${response.status})`);
    }

    return response.json();
  }

  async generateSalesPitch(product: Product): Promise<string> {
    try {
      const data = await this.postToAi<{ text?: string }>('/api/ai/pitch', { product });
      return data.text || 'Não foi possível gerar o argumento de vendas.';
    } catch {
      return 'Erro ao comunicar com o servidor de IA.';
    }
  }

  async generateProductImage(product: Product): Promise<string | null> {
    try {
      const data = await this.postToAi<{ imageDataUrl?: string }>('/api/ai/image', { product });
      return data.imageDataUrl || null;
    } catch {
      return null;
    }
  }
}

export const geminiService = new GeminiService();
