import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiService } from '../services/api';
import {
  X, Upload, Star, Trash2, ChevronUp, ChevronDown,
  ArrowLeft, Loader2, Image as ImageIcon
} from 'lucide-react';
import { ProdutoImagem } from '../types';

interface ProductImageGalleryProps {
  productId: string;
  productName?: string;
  onBack: () => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

const ProductImageGallery: React.FC<ProductImageGalleryProps> = ({
  productId,
  productName,
  onBack,
}) => {
  const [imagens, setImagens] = useState<ProdutoImagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGaleria = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiService.getProdutoGaleria(productId);
      setImagens(data.imagens);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar galeria');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadGaleria();
  }, [loadGaleria]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid: File[] = [];
    const pre: string[] = [];

    for (const f of files) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setError(`Formato não suportado: ${f.name}. Use jpg, png ou webp.`);
        continue;
      }
      if (f.size > MAX_SIZE) {
        setError(`Arquivo muito grande: ${f.name}. Máximo 5MB.`);
        continue;
      }
      valid.push(f);
      pre.push(URL.createObjectURL(f));
    }

    setSelectedFiles(prev => [...prev, ...valid]);
    setPreviews(prev => [...prev, ...pre]);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePreview = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of selectedFiles) {
        await apiService.uploadProdutoImagem(productId, file);
      }
      setSelectedFiles([]);
      setPreviews([]);
      await loadGaleria();
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar imagens');
    } finally {
      setUploading(false);
    }
  };

  const handleSetCapa = async (img: ProdutoImagem) => {
    try {
      await apiService.setImagemCapa(img.id);
      await loadGaleria();
    } catch (e: any) {
      setError(e.message || 'Erro ao definir capa');
    }
  };

  const handleReorder = async (img: ProdutoImagem, direction: 'up' | 'down') => {
    const sorted = [...imagens].sort((a, b) => a.ordem - b.ordem);
    const idx = sorted.findIndex(i => i.id === img.id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;

    const temp = sorted[idx].ordem;
    sorted[idx].ordem = sorted[targetIdx].ordem;
    sorted[targetIdx].ordem = temp;

    try {
      await apiService.reordenarImagens([
        { id: sorted[idx].id, ordem: sorted[idx].ordem },
        { id: sorted[targetIdx].id, ordem: sorted[targetIdx].ordem },
      ]);
      await loadGaleria();
    } catch (e: any) {
      setError(e.message || 'Erro ao reordenar');
    }
  };

  const handleDelete = async (img: ProdutoImagem) => {
    if (!confirm(`Remover esta imagem${img.is_capa ? ' (CAPA)' : ''}?`)) return;
    try {
      await apiService.deleteProdutoImagem(img.id);
      await loadGaleria();
    } catch (e: any) {
      setError(e.message || 'Erro ao remover imagem');
    }
  };

  const sorted = [...imagens].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Galeria de Imagens
          </h2>
          {productName && (
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{productName}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
          <X className="w-4 h-4 shrink-0 cursor-pointer" onClick={() => setError('')} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {/* Upload area */}
        <div className="mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
          >
            <Upload className="w-10 h-10 mx-auto mb-2 text-slate-400" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Clique para selecionar imagens
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              JPG, PNG ou WebP — até 5MB cada
            </p>
          </div>

          {previews.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {selectedFiles.length} arquivo(s) selecionado(s)
                </span>
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                >
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uploading ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
                {previews.map((pre, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                    <img src={pre} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removePreview(i)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Grid de imagens cadastradas */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ImageIcon className="w-16 h-16 mx-auto mb-3" />
            <p>Nenhuma imagem cadastrada</p>
          </div>
        ) : (
          <div>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Imagens cadastradas ({sorted.length})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {sorted.map((img, idx) => (
                <div
                  key={img.id}
                  className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-transparent"
                >
                  <img
                    src={img.url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '';
                      (e.target as HTMLImageElement).classList.add('hidden');
                    }}
                  />

                  {img.ordem === 0 && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-bold rounded-full">
                      CAPA
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                    {img.ordem !== 0 && (
                      <button
                        onClick={() => handleSetCapa(img)}
                        title="Marcar como capa"
                        className="p-1.5 bg-white rounded-full hover:bg-yellow-100 transition-colors"
                      >
                        <Star className="w-4 h-4 text-slate-600" />
                      </button>
                    )}
                    {idx > 0 && (
                      <button
                        onClick={() => handleReorder(img, 'up')}
                        title="Subir"
                        className="p-1.5 bg-white rounded-full hover:bg-slate-100 transition-colors"
                      >
                        <ChevronUp className="w-4 h-4 text-slate-600" />
                      </button>
                    )}
                    {idx < sorted.length - 1 && (
                      <button
                        onClick={() => handleReorder(img, 'down')}
                        title="Descer"
                        className="p-1.5 bg-white rounded-full hover:bg-slate-100 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4 text-slate-600" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(img)}
                      title="Excluir"
                      className="p-1.5 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductImageGallery;
