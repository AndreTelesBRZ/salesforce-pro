import { Router } from 'express';
import { genAI, GEMINI_API_KEY } from '../config.js';

export function createAIRoutes(ctx) {
  const router = Router();
  const { verifyToken } = ctx;

  // Generate sales pitch using Gemini
  router.post('/api/ai/pitch', verifyToken, async (req, res) => {
    try {
      if (!GEMINI_API_KEY || !genAI) {
        return res.status(400).json({ message: 'GEMINI_API_KEY não configurada no servidor.' });
      }
      const { product } = req.body || {};
      if (!product || !product.name) {
        return res.status(400).json({ message: 'Produto inválido.' });
      }

      const prompt = `Atue como um vendedor experiente e persuasivo.\n` +
        `Escreva um argumento de vendas curto (máximo 3 frases) e impactante para o seguinte produto:\n` +
        `Nome: ${product.name}\n` +
        `Categoria: ${product.category || ''}\n` +
        `Preço: R$ ${product.price ?? ''}\n` +
        `Descrição técnica: ${product.description || ''}\n` +
        `Foque nos benefícios para o cliente. Use tom profissional mas entusiasmado.`;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const text = response?.text || null;
      if (!text) return res.status(500).json({ message: 'Não foi possível gerar o argumento de vendas.' });
      return res.json({ text });
    } catch (e) {
      console.error('[AI] Erro pitch:', e);
      return res.status(500).json({ message: 'Erro ao gerar argumento de vendas.' });
    }
  });

  // Generate product image using Gemini
  router.post('/api/ai/image', verifyToken, async (req, res) => {
    try {
      if (!GEMINI_API_KEY || !genAI) {
        return res.status(400).json({ message: 'GEMINI_API_KEY não configurada no servidor.' });
      }
      const { product } = req.body || {};
      if (!product || !product.name) {
        return res.status(400).json({ message: 'Produto inválido.' });
      }

      const prompt = `Professional product photography of ${product.name}, ${product.description || ''}. ` +
        `High quality, 4k, realistic, studio lighting, white background, commercial photography.`;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
      });

      let dataUrl = null;
      const candidates = response?.candidates || [];
      if (candidates[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            dataUrl = `data:${mime};base64,${part.inlineData.data}`;
            break;
          }
        }
      }

      if (!dataUrl) return res.status(500).json({ message: 'Não foi possível gerar a imagem.' });
      return res.json({ imageDataUrl: dataUrl });
    } catch (e) {
      console.error('[AI] Erro image:', e);
      return res.status(500).json({ message: 'Erro ao gerar imagem.' });
    }
  });

  return router;
}
