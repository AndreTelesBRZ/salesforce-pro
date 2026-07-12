import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiService } from '../services/api';
import {
  X, Upload, Trash2, ArrowLeft, Loader2, Search, Image as ImageIcon
} from 'lucide-react';
import { CategoriaImagem } from '../types';

interface CategoryImageManagerProps {
  onBack: () => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

const CategoryImageManager: React.FC<CategoryImageManagerProps> = ({ onBack }) => {
  const [imagens, setImagens] = useState<CategoriaImagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [secaoFilter, setSecaoFilter] = useState('');
  const [grupoFilter, setGrupoFilter] = useState('');
  const [subgrupoFilter, setSubgrupoFilter] = useState('');

  const [newSecao, setNewSecao] = useState('');
  const [newGrupo, setNewGrupo] = useState('');
  const [newSubgrupo, setNewSubgrupo] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreview, setNewPreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImagens = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (secaoFilter) params.secao = secaoFilter;
      if (grupoFilter) params.grupo = grupoFilter;
      if (subgrupoFilter) params.subgrupo = subgrupoFilter;
      const data = await apiService.getCategoriaImagens(params);
      setImagens(data);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar imagens');
    } finally {
      setLoading(false);
    }
  }, [secaoFilter, grupoFilter, subgrupoFilter]);

  useEffect(() => {
    loadImagens();
  }, [loadImagens]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(`Formato não suportado: ${file.name}. Use jpg, png ou webp.`);
      return;
    }
    if (file.size > MAX_SIZE) {
      setError(`Arquivo muito grande: ${file.name}. Máximo 5MB.`);
      return;
    }
    setNewFile(file);
    setNewPreview(URL.createObjectURL(file));
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!newFile || !newSecao || !newGrupo || !newSubgrupo) {
      setError('Preencha seção, grupo e subgrupo e selecione um arquivo.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      await apiService.uploadCategoriaImagem(newSecao, newGrupo, newSubgrupo, newFile);
      setNewFile(null);
      setNewPreview('');
      setNewSecao('');
      setNewGrupo('');
      setNewSubgrupo('');
      await loadImagens();
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar imagem');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (img: CategoriaImagem) => {
    if (!confirm(`Remover imagem da categoria ${img.secao}-${img.grupo}-${img.subgrupo}?`)) return;
    try {
      await apiService.deleteCategoriaImagem(img.id);
      await loadImagens();
    } catch (e: any) {
      setError(e.message || 'Erro ao remover imagem');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Imagens por Categoria
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Gerencie imagens padrão por seção, grupo e subgrupo
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
          <X className="w-4 h-4 shrink-0 cursor-pointer" onClick={() => setError('')} />
          <span>{error}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Upload form */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">
            Nova imagem de categoria
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Seção</label>
              <input
                value={newSecao}
                onChange={e => setNewSecao(e.target.value)}
                placeholder="Ex: 01"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Grupo</label>
              <input
                value={newGrupo}
                onChange={e => setNewGrupo(e.target.value)}
                placeholder="Ex: 001"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Subgrupo</label>
              <input
                value={newSubgrupo}
                onChange={e => setNewSubgrupo(e.target.value)}
                placeholder="Ex: 001"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
              />
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-500 hover:border-blue-400 transition-colors"
            >
              {newFile ? newFile.name : 'Selecionar imagem'}
            </button>
            {newPreview && (
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                <img src={newPreview} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            {newFile && newSecao && newGrupo && newSubgrupo && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                {uploading ? 'Enviando...' : 'Enviar'}
              </button>
            )}
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-3">
          <input
            value={secaoFilter}
            onChange={e => setSecaoFilter(e.target.value)}
            placeholder="Filtrar seção"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
          />
          <input
            value={grupoFilter}
            onChange={e => setGrupoFilter(e.target.value)}
            placeholder="Filtrar grupo"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
          />
          <input
            value={subgrupoFilter}
            onChange={e => setSubgrupoFilter(e.target.value)}
            placeholder="Filtrar subgrupo"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700"
          />
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : imagens.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <ImageIcon className="w-16 h-16 mx-auto mb-3" />
            <p>Nenhuma imagem de categoria cadastrada</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {imagens.map(img => (
              <div key={img.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="aspect-video bg-slate-100 dark:bg-slate-700">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span className="font-mono">{img.secao}-{img.grupo}-{img.subgrupo}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(img)}
                    className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CategoryImageManager;
