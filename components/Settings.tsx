
import React, { useState, useEffect } from 'react';
import { apiService, LogEntry } from '../services/api';
import { getBackendUrlForCurrentHost, isBackendUrlLockedForCurrent, isEdsonHostForCurrent, isLlfixHostForCurrent } from '../services/storeHost';
import { AppConfig, ThemeMode } from '../types';
import { Save, Server, Wifi, CheckCircle2, XCircle, Loader2, LogOut, Sun, Moon, Monitor, Key, Database, Code, Info, Lock, Terminal, Trash2, RefreshCcw, Power, Globe, User, Briefcase, Building } from 'lucide-react';

interface SettingsProps {
  onClose: () => void;
  onLogout?: () => void;
  onThemeChange?: (theme: ThemeMode) => void;
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

const LLFIX_FORCED_BACKEND_URL = 'https://apiforce.llfix.app.br';

export const Settings: React.FC<SettingsProps> = ({ onClose, onLogout, onThemeChange }) => {
  const [config, setConfig] = useState<AppConfig>(apiService.getConfig());
  const [message, setMessage] = useState('');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testErrorMsg, setTestErrorMsg] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const backendUrlLocked = isBackendUrlLockedForCurrent();
  const lockedBackendUrl = getBackendUrlForCurrentHost();
  const resolvedBackendUrl = backendUrlLocked ? lockedBackendUrl : config.backendUrl;
  const isLlfixHost = isLlfixHostForCurrent();
  const isEdsonHost = isEdsonHostForCurrent();
  const showForceLLFix = isLlfixHost && !isEdsonHost;
  const [storeInfo, setStoreInfo] = useState<any | null>(null);

  // Auto-teste
  useEffect(() => {
    refreshLogs();
    const delay = setTimeout(() => {
        if (config.apiToken && config.backendUrl && !config.useMockData) {
           handleTestConnection();
        }
    }, 1500);
    return () => clearTimeout(delay);
  }, [config.apiToken, config.useMockData, resolvedBackendUrl]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiService.fetchWithAuth('/api/store/public');
        if (!active) return;
        if (res.ok) {
          setStoreInfo(await res.json());
          return;
        }
      } catch {
        // noop
      }
      setStoreInfo(null);
    })();
    return () => { active = false; };
  }, []);

  // Carrega dados da loja ao abrir
  const refreshLogs = () => {
      setLogs([...apiService.getLogs()]);
  };

  const handleClearLogs = () => {
      apiService.clearLogs();
      refreshLogs();
  };

  const handleSave = () => {
    const configToSave = backendUrlLocked
      ? { ...config, backendUrl: lockedBackendUrl }
      : config;
    setConfig(configToSave);
    apiService.saveConfig(configToSave);
    if (onThemeChange) onThemeChange(config.theme);
    setMessage('Configurações salvas!');
    setTimeout(() => {
        setMessage('');
        window.location.reload(); // Recarrega para aplicar novos defaults de API
    }, 1000);
  };

  const handleRestart = () => {
    if (confirm('Deseja reiniciar a aplicação? Dados não salvos no servidor podem ser perdidos.')) {
        window.location.reload();
    }
  };

  const handleTestConnection = async () => {
    if (config.useMockData) {
        setTestStatus('success');
        return;
    }
    setTestStatus('testing');
    setTestErrorMsg('');
    
    // Salva temp
    const configToTest = backendUrlLocked
      ? { ...config, backendUrl: lockedBackendUrl }
      : config;
    apiService.saveConfig(configToTest);
    
    const result = await apiService.testConnection(resolvedBackendUrl);
    setTestStatus(result.success ? 'success' : 'error');
    if (!result.success) setTestErrorMsg(result.message);
    
    refreshLogs(); // Atualiza logs após teste
    
    if (result.success) setTimeout(() => setTestStatus('idle'), 3000);
  };

  return (
    <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-md max-w-md mx-auto mt-10 pb-20">
      <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-800 dark:text-white">
            <Server className="w-6 h-6 text-blue-800 dark:text-blue-400" />
            Configuração
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">
            <XCircle className="w-6 h-6 text-slate-400" />
          </button>
      </div>

      <div className="space-y-5">
        
        {/* URL */}
        <div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
            <Database className="w-4 h-4 text-orange-600" />
            Endereço do Servidor (FastAPI/Django)
          </label>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={resolvedBackendUrl}
              onChange={(e) => setConfig({ ...config, backendUrl: e.target.value })}
              disabled={config.useMockData || backendUrlLocked}
              placeholder={backendUrlLocked ? lockedBackendUrl : "https://apiforce.edsondosparafusos.app.br"}
              className="flex-1 p-3 border rounded-md dark:bg-slate-900 dark:text-white dark:border-slate-700"
            />
            <button
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className="px-3 border rounded-md hover:bg-slate-50 dark:hover:bg-slate-700 dark:border-slate-600"
            >
                {testStatus === 'testing' ? <Loader2 className="w-5 h-5 animate-spin" /> : 
                 testStatus === 'success' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> :
                 testStatus === 'error' ? <XCircle className="w-5 h-5 text-red-500" /> :
                 <Wifi className="w-5 h-5" />}
            </button>
            {showForceLLFix && (
              <button
                type="button"
                disabled={config.useMockData || backendUrlLocked || resolvedBackendUrl === LLFIX_FORCED_BACKEND_URL}
                onClick={() => {
                  setConfig(prev => ({ ...prev, backendUrl: LLFIX_FORCED_BACKEND_URL }));
                }}
                className="px-3 border rounded-md text-sm font-medium bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-600 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50"
              >
                Usar apiforce.llfix.app.br
              </button>
            )}
          </div>
          {showForceLLFix && (
            <p className="text-[10px] text-slate-500 mt-2">
              Força comunicação direta com o ERP LLFIX mesmo fora do domínio oficial.
            </p>
          )}
        </div>
        
        {/* Token */}
        <div>
             <label className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <span className="flex items-center gap-2"><Key className="w-4 h-4" /> Token de Integração</span>
             </label>
             <div className="relative">
                 <input
                   type={showToken ? "text" : "password"}
                   value={config.apiToken}
                   onChange={(e) => setConfig({ ...config, apiToken: e.target.value })}
                   disabled={config.useMockData}
                   className="w-full p-3 pr-10 border rounded-md dark:bg-slate-900 dark:text-white dark:border-slate-700"
                 />
                 <button 
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                 >
                    {showToken ? 'Ocultar' : 'Ver'}
                 </button>
             </div>
             <p className="text-[10px] text-slate-500 mt-2">
                O token de integração ou seu login vinculará automaticamente sua carteira de clientes.
             </p>
        </div>

        {/* Status */}
        {testStatus === 'error' && (
            <div className="text-xs bg-red-50 text-red-600 p-3 rounded border border-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                <strong>Erro:</strong> {testErrorMsg}
            </div>
        )}

        {/* Mock Data Toggle */}

        {/* Always fetch customers toggle */}
        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-4 rounded-md border dark:border-slate-700">
          <span className="text-sm font-medium">Sempre buscar clientes do servidor</span>
          <input
            type="checkbox"
            checked={!!config.alwaysFetchCustomers}
            onChange={(e) => setConfig({ ...config, alwaysFetchCustomers: e.target.checked })}
            className="w-5 h-5 accent-blue-600"
          />
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-md border dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
            <Building className="w-4 h-4 text-blue-600" />
            Dados da Loja (ERP)
          </div>
          {storeInfo ? (
            <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-3">
                {storeInfo.logo_url ? (
                  <img src={storeInfo.logo_url} alt="Logotipo" className="h-12 w-12 object-contain rounded border border-slate-200" />
                ) : (
                  <Building className="w-8 h-8 text-slate-500" />
                )}
                <div>
                  <p className="font-semibold text-slate-800 dark:text-white">
                    {storeInfo.trade_name || storeInfo.legal_name || 'SalesForce Pro'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Loja {storeInfo.id ? String(storeInfo.id).padStart(2, '0') : '—'}
                    {isEdsonHost ? ' • 00001 (Edson)' : isLlfixHost ? ' • 00003 (LLFIX)' : ''}
                  </p>
                </div>
              </div>
              <p>Razão social: <span className="font-medium">{storeInfo.legal_name || 'N/A'}</span></p>
              <p>CNPJ/CPF: <span className="font-medium">{storeInfo.document || 'N/A'}</span></p>
              <p>Endereço:&nbsp;
                <span className="font-medium">
                  {storeInfo.street || '—'} {storeInfo.number || ''}
                  {storeInfo.neighborhood ? `, ${storeInfo.neighborhood}` : ''}
                  {storeInfo.city ? ` • ${storeInfo.city}` : ''} {storeInfo.state ? `/${storeInfo.state}` : ''}
                  {storeInfo.zip ? ` • CEP ${storeInfo.zip}` : ''}
                </span>
              </p>
              <p>Contato:&nbsp;<span className="font-medium">{storeInfo.phone || '—'} / {storeInfo.email || '—'}</span></p>
              <p className="text-xs text-slate-500">
                Atualizado diretamente pela API do ERP para cada loja protegida.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Os dados da loja são carregados automaticamente da API do ERP e podem ser conferidos em /api/store/public.
            </p>
          )}
        </div>

        {message && <div className="p-3 bg-green-100 text-green-700 rounded-md text-sm text-center">{message}</div>}

        <button
          onClick={handleSave}
          className="w-full flex justify-center items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-md shadow-lg"
        >
          <Save className="w-5 h-5" /> Salvar Conexão
        </button>

        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            {onLogout && (
            <button onClick={onLogout} className="w-full flex justify-center items-center gap-2 py-3 text-red-500 hover:bg-red-50 dark:hover:bg-slate-900 rounded-md transition-colors">
                <LogOut className="w-5 h-5" /> Sair da Conta
            </button>
            )}
            
            <button onClick={handleRestart} className="w-full flex justify-center items-center gap-2 py-3 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors">
                <RefreshCcw className="w-4 h-4" /> Reiniciar Sistema
            </button>
        </div>
        
        {/* LOG VIEWER */}
        <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
            <button 
                onClick={() => { setShowLogs(!showLogs); refreshLogs(); }}
                className="w-full flex items-center justify-between p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white mb-2"
            >
                <div className="flex items-center gap-2 font-mono text-sm">
                    <Terminal className="w-4 h-4" /> 
                    Logs de Sistema (Debug)
                </div>
                <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full">{logs.length}</span>
            </button>
            
            {showLogs && (
                <div className="bg-slate-950 rounded-lg p-2 font-mono text-xs overflow-hidden border border-slate-800">
                    <div className="flex justify-between items-center mb-2 px-2 pb-2 border-b border-slate-800">
                         <span className="text-slate-400">Console Output</span>
                         <div className="flex gap-2">
                             <button onClick={refreshLogs} title="Atualizar">
                                <RefreshCcw className="w-3 h-3 text-blue-400" />
                             </button>
                             <button onClick={handleClearLogs} title="Limpar">
                                <Trash2 className="w-3 h-3 text-red-400" />
                             </button>
                         </div>
                    </div>
                    <div className="h-48 overflow-y-auto space-y-1 p-2">
                        {logs.length === 0 && <span className="text-slate-600 italic">Nenhum log registrado.</span>}
                        {logs.map((log, idx) => (
                            <div key={idx} className="flex gap-2">
                                <span className="text-slate-500 shrink-0">[{log.timestamp}]</span>
                                <span className={`${
                                    log.type === 'error' ? 'text-red-400 font-bold' : 
                                    log.type === 'success' ? 'text-green-400' : 
                                    log.type === 'warning' ? 'text-orange-400' : 'text-slate-300'
                                } break-all`}>
                                    {log.message}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};
