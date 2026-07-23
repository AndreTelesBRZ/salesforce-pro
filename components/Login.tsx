
import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../services/api';
import { getBackendUrlForCurrentHost } from '../services/storeHost';
import { getTenantDiagnostics } from '../src/config/tenantConfig';
import { Lock, User, LogIn, Settings as SettingsIcon, Loader2, Store, AlertCircle, Mail, UserPlus, ArrowLeft, Terminal, RefreshCw, Globe, Power, KeyRound, Send, Zap } from 'lucide-react';
import { APP_VERSION_LABEL } from '../src/version';

declare global {
  interface Window {
    google?: any;
  }
}

interface LoginProps {
  onLoginSuccess: () => void;
  onOpenSettings: () => void;
  storeInfo?: any | null;
}

type LoginMode = 'password' | 'reset_request' | 'reset_confirm';

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onOpenSettings, storeInfo }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>('password');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // Registration States
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Code Login States
  const [codeEmail, setCodeEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [hasDeviceToken, setHasDeviceToken] = useState(false);
  
  // Lê ID da configuração
  const config = apiService.getConfig();
  const tenantDiagnostics = getTenantDiagnostics(typeof window !== 'undefined' ? window.location.hostname : '');

  useEffect(() => {
    if (config.connectionValidated && config.apiToken && (config.backendUrl || getBackendUrlForCurrentHost())) {
        setHasDeviceToken(true);
        return;
    }
    setHasDeviceToken(false);
  }, [config]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await apiService.login(username, password);
    
    setLoading(false);
    
    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.message || 'Falha no acesso. Verifique suas credenciais.');
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError('');
      setSuccessMsg('');
      
      const result = await apiService.requestPasswordReset(codeEmail);
      setLoading(false);

      if (result.success) {
          setSuccessMsg(result.message || 'Se houver um e-mail cadastrado, enviaremos um código.');
          setLoginMode('reset_confirm');
      } else {
          setError(result.message || 'Erro ao enviar código.');
      }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setError('');
      
      if (newPassword !== newPasswordConfirm) {
          setLoading(false);
          setError('As senhas não coincidem.');
          return;
      }
      const result = await apiService.confirmPasswordReset(codeEmail, accessCode, newPassword);
      setLoading(false);
      
      if (result.success) {
          setSuccessMsg(result.message || 'Senha alterada com sucesso. Faça login.');
          setPassword('');
          setAccessCode('');
          setNewPassword('');
          setNewPasswordConfirm('');
          setLoginMode('password');
      } else {
          setError(result.message || 'Código inválido.');
      }
  };

  const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setSuccessMsg('');

      if (password !== confirmPassword) {
          setError('As senhas não coincidem.');
          return;
      }

      setLoading(true);
      
      const result = await apiService.register(name, username, password);
      
      setLoading(false);

      if (result.success) {
          setSuccessMsg('Conta criada com sucesso! Faça login para continuar.');
          setTimeout(() => {
              setIsRegistering(false);
              setPassword('');
              setConfirmPassword('');
          }, 2000);
      } else {
          setError(result.message || 'Erro ao criar conta.');
      }
  };

  const handleForceLocal = async () => {
      if (!confirm('Isso irá resetar as configurações de conexão para o modo local e recarregar o app. Continuar?')) return;
      
      setLoading(true);
      await apiService.resetToLocalMode();
      setLoading(false);
      setError('');
      window.location.reload();
  };
  
  const handleReload = () => {
      window.location.reload();
  };

  const getHeaderColor = () => {
      if (hasDeviceToken) return 'from-green-700 to-green-900';
      if (isRegistering) return 'from-orange-600 to-orange-800';
      if (loginMode !== 'password') return 'from-purple-700 to-purple-900';
      return 'from-blue-800 to-blue-900';
  };

  const getHeaderIcon = () => {
      if (hasDeviceToken) return <Zap className="w-10 h-10 text-green-400" />;
      if (isRegistering) return <UserPlus className="w-10 h-10 text-orange-600" />;
      if (loginMode !== 'password') return <KeyRound className="w-10 h-10 text-purple-700" />;
      return <Store className="w-10 h-10 text-blue-800" />;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-blue-50 dark:bg-slate-950 p-4 transition-colors">
      
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-blue-100 dark:border-slate-700 transition-all">
        {/* Cabeçalho Visual */}
        <div className={`bg-gradient-to-br ${getHeaderColor()} p-10 text-center relative transition-colors duration-500`}>
          <div className="absolute top-4 right-4 flex gap-2">
              <button 
                onClick={handleReload}
                className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                title="Recarregar Aplicação"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button 
                onClick={onOpenSettings}
                className="text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
                title="Configurações de Conexão"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
          </div>

          {(isRegistering || loginMode !== 'password') && (
             <button 
               onClick={() => {
                   setIsRegistering(false);
                   setLoginMode('password');
                   setError('');
                   setSuccessMsg('');
               }}
               className="absolute top-4 left-4 text-white/70 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
             >
                <ArrowLeft className="w-5 h-5" />
             </button>
          )}
          
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg mb-4">
            {getHeaderIcon()}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">SalesForce Pro</h1>
          <p className="text-white/80 mt-2 text-sm font-medium">
              {hasDeviceToken ? 'Conexão Técnica Validada' : 
               isRegistering ? 'Crie sua conta profissional' : 
               'Sistema Integrado de Força de Vendas'}
          </p>
        </div>

        {/* Formulário */}
        <div className="p-8 pt-6">
          {storeInfo && !isRegistering && loginMode === 'password' && (
            <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Loja configurada</p>
              <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-white">
                {storeInfo.trade_name || storeInfo.legal_name || 'Loja vinculada'}
              </p>
              <p className="mt-1 text-xs text-slate-500">{storeInfo.legal_name || 'Razão social não informada'}</p>
              {storeInfo.document ? <p className="mt-1 text-xs text-slate-500">CNPJ: {storeInfo.document}</p> : null}
              {storeInfo.address ? <p className="mt-1 text-xs text-slate-500">{storeInfo.address}</p> : null}
              {(storeInfo.store_code || storeInfo.codigo) ? (
                <p className="mt-1 text-xs text-slate-500">Loja: {storeInfo.store_code || storeInfo.codigo}</p>
              ) : null}
            </div>
          )}

          {hasDeviceToken && !isRegistering && (
             <div className="mb-6 pb-6 border-b border-slate-100 dark:border-slate-700 bg-green-50 dark:bg-green-900/20 p-4 rounded-xl border">
                <p className="text-sm font-semibold text-green-800 dark:text-green-200 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Conexão técnica pronta
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-2">
                    O token de integração valida apenas a comunicação com a loja. O acesso ao sistema continua exigindo usuário e senha.
                </p>
             </div>
          )}
          
          {/* MODO REGISTRO */}
          {isRegistering && (
             <form onSubmit={handleRegister} className="space-y-5 animate-in fade-in slide-in-from-right-4">
                <div className="animate-in slide-in-from-left-4 fade-in">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 ml-1">Nome Completo</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <User className="h-5 w-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            required
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="app-input block w-full pl-10 pr-3 py-3"
                            placeholder="Seu nome"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 ml-1">Email / Usuário</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="app-input block w-full pl-10 pr-3 py-3"
                            placeholder="seu@email.com"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 ml-1">Senha</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                        </div>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="app-input block w-full pl-10 pr-3 py-3"
                            placeholder="********"
                        />
                    </div>
                </div>
             </form>
          )}

          {/* MODO LOGIN SENHA */}
          {!isRegistering && loginMode === 'password' && (
              <form onSubmit={handleLogin} className="space-y-5 animate-in fade-in">
                  
                  {/* Mensagem de Login Padrão só aparece se não tiver token, ou abaixo dele */}
                  <div className="text-center mb-4">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          {hasDeviceToken ? 'Faça login com usuário' : 'Credenciais de Acesso'}
                      </span>
                  </div>

                  {!tenantDiagnostics.domainMapped && (
                        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 mb-2 flex gap-3 items-center">
                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                            <div className="text-xs text-red-700 dark:text-red-200">
                                {tenantDiagnostics.error}
                            </div>
                        </div>
                  )}

                  {tenantDiagnostics.domainMapped && !apiService.getConfig().backendUrl && (
                        <div className="bg-slate-100 dark:bg-slate-700/50 p-3 rounded-lg border border-slate-200 dark:border-slate-600 mb-2 flex gap-3 items-center">
                            <Terminal className="w-5 h-5 text-slate-500 shrink-0" />
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono">
                                <span className="font-bold">Modo Local Detectado</span>
                                <div className="mt-1">
                                    O acesso local exige um usuário real cadastrado no backend local.
                                </div>
                            </div>
                        </div>
                    )}
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 ml-1">Usuário / Email</label>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                        </div>
                        <input
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="app-input block w-full pl-10 pr-3 py-3"
                            placeholder="admin"
                        />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2 ml-1">
                         <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Senha</label>
                         <button 
                            type="button" 
                            onClick={() => {
                                setCodeEmail(username);
                                setError('');
                                setSuccessMsg('');
                                setLoginMode('reset_request');
                            }}
                            className="text-xs text-purple-600 hover:text-purple-800 font-semibold"
                         >
                            Esqueci a senha
                         </button>
                    </div>
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
                        </div>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="app-input block w-full pl-10 pr-3 py-3"
                            placeholder="********"
                        />
                    </div>
                  </div>
              </form>
          )}

          {!isRegistering && loginMode === 'reset_request' && (
              <form onSubmit={handleSendCode} className="space-y-5 animate-in fade-in">
                  <div className="text-center mb-4">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Recuperar senha
                      </span>
                      <p className="mt-2 text-sm text-slate-500">
                          Informe seu usuário ou e-mail cadastrado.
                      </p>
                  </div>
                  <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 ml-1">
                          Usuário / E-mail
                      </label>
                      <input
                          type="text"
                          required
                          autoFocus
                          value={codeEmail}
                          onChange={(e) => setCodeEmail(e.target.value)}
                          className="app-input block w-full px-3 py-3"
                          placeholder="admin"
                      />
                  </div>
              </form>
          )}

          {!isRegistering && loginMode === 'reset_confirm' && (
              <form onSubmit={handleVerifyCode} className="space-y-5 animate-in fade-in">
                  <div className="text-center mb-4">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                          Código de recuperação
                      </span>
                  </div>
                  <input
                      type="text"
                      required
                      inputMode="numeric"
                      maxLength={6}
                      value={accessCode}
                      onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, ''))}
                      className="app-input block w-full px-3 py-3 text-center tracking-[0.5em]"
                      placeholder="000000"
                      aria-label="Código de recuperação"
                  />
                  <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="app-input block w-full px-3 py-3"
                      placeholder="Nova senha (mínimo 8 caracteres)"
                      aria-label="Nova senha"
                  />
                  <input
                      type="password"
                      required
                      minLength={8}
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      className="app-input block w-full px-3 py-3"
                      placeholder="Confirme a nova senha"
                      aria-label="Confirme a nova senha"
                  />
              </form>
          )}

          {/* FEEDBACK MENSAGENS */}
          <div className="mt-4">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 text-sm p-4 rounded-xl flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
                {/* Botão de Resgate Apenas no login normal */}
                {loginMode === 'password' && !isRegistering && (
                    <button 
                        type="button"
                        onClick={handleForceLocal}
                        className="mt-2 text-xs font-bold text-red-700 underline hover:text-red-900 self-start flex items-center gap-1"
                    >
                        <Power className="w-3 h-3" />
                        Forçar Modo Local (Resetar)
                    </button>
                )}
              </div>
            )}

            {successMsg && (
              <div className="bg-green-50 border border-green-100 text-green-700 text-sm p-4 rounded-xl flex items-start gap-3 animate-in fade-in">
                <Store className="w-5 h-5 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}
          </div>

          <button
              onClick={
                  isRegistering ? handleRegister : 
                  loginMode === 'reset_request' ? handleSendCode :
                  loginMode === 'reset_confirm' ? handleVerifyCode :
                  handleLogin
              }
              disabled={loading}
              className={`w-full flex justify-center items-center gap-2 py-4 px-4 font-bold rounded-xl shadow-lg transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-4 ${
                  isRegistering ? 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-900/30' : 
                  'bg-orange-600 hover:bg-orange-700 text-white shadow-orange-600/30'
              }`}
          >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 
               isRegistering ? <UserPlus className="w-5 h-5" /> : 
               loginMode === 'reset_request' ? <Send className="w-5 h-5" /> :
               loginMode === 'reset_confirm' ? <KeyRound className="w-5 h-5" /> :
               <LogIn className="w-5 h-5" />}
              
              {loading ? 'Processando...' : 
               isRegistering ? 'Criar Minha Conta' : 
               loginMode === 'reset_request' ? 'Enviar código' :
               loginMode === 'reset_confirm' ? 'Alterar senha' :
               'Entrar no Sistema'}
          </button>
            
          {/* BOTÃO DE LOGIN SECUNDÁRIO */}
          {!isRegistering && loginMode === 'password' && (
                <div className="mt-4">
                     {/* Divider */}
                    <div className="relative flex py-2 items-center">
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-600"></div>
                        <span className="flex-shrink-0 mx-4 text-slate-400 text-xs">Ou entre com</span>
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-600"></div>
                    </div>

                    <div className="w-full py-2 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-lg text-xs font-bold flex items-center justify-center gap-2 mb-2">
                        <KeyRound className="w-4 h-4" />
                        Login por código indisponível neste ambiente
                    </div>
                </div>
           )}

          {!isRegistering && loginMode === 'password' && (
             <button 
                onClick={() => setIsRegistering(true)}
                className="w-full mt-4 text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors"
             >
                Primeiro acesso? <span className="underline">Criar conta</span>
             </button>
          )}
        </div>
        
        <div className="bg-slate-50 dark:bg-slate-900 p-4 text-center border-t border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-400">
             {APP_VERSION_LABEL}
          </p>
        </div>
      </div>
    </div>
  );
};
