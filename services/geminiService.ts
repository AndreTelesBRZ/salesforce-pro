
import { GoogleGenAI } from "@google/genai";
import { Product } from '../types';

class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // Ensure the API key is available
    const apiKey = process.env.API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generateSalesPitch(product: Product): Promise<string> {
    if (!process.env.API_KEY) {
      return "Chave de API não configurada. Adicione a chave Gemini no ambiente.";
    }

    try {
      const prompt = `
        Atue como um vendedor experiente e persuasivo.
        Escreva um argumento de vendas curto (máximo 3 frases) e impactante para o seguinte produto:
        Nome: ${product.name}
        Categoria: ${product.category}
        Preço: R$ ${product.price}
        Descrição técnica: ${product.description}
        
        Foque nos benefícios para o cliente. Use tom profissional mas entusiasmado.
      `;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return response.text || "Não foi possível gerar o argumento de venda.";
    } catch (error) {
      console.error("Erro ao chamar Gemini (Texto):", error);
      return "Erro ao conectar com a IA de vendas.";
    }
  }

  async generateProductImage(product: Product): Promise<string | null> {
    if (!process.env.API_KEY) return null;

    try {
      const prompt = `Professional product photography of ${product.name}, ${product.description}. 
      High quality, 4k, realistic, studio lighting, white background, commercial photography.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [{ text: prompt }]
        },
        config: {
            // responseMimeType não é suportado para geração de imagem neste modelo, o output vem em inlineData
        }
      });

      // O modelo nano banana (gemini-2.5-flash-image) retorna a imagem dentro de parts -> inlineData
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            }
        }
      }
      
      return null;
    } catch (error) {
      console.error("Erro ao chamar Gemini (Imagem):", error);
      return null;
    }
  }
}

export const geminiService = new GeminiService();
