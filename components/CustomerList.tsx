
import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { Customer } from '../types';
import { Search, Loader2, UserCircle, MapPin, Phone, Building2, Store, Briefcase, Calendar, DollarSign, Users } from 'lucide-react';

export const CustomerList: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      const data = await apiService.getCustomers();
      setCustomers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (c.fantasyName && c.fantasyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    c.document.includes(searchTerm)
  );

  const formatDate = (dateStr: string) => {
      try {
          if (!dateStr) return '-';
          // Se vier ISO
          const date = new Date(dateStr);
          if (isNaN(date.getTime())) return dateStr; // Retorna original se não for parseável
          return date.toLocaleDateString('pt-BR');
      } catch (e) {
          return dateStr;
      }
  };

  return (
    <div className="p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
           <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
               <Users className="w-6 h-6 text-blue-600" /> Clientes
           </h2>
           <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded-full font-bold">
               {customers.length > 0 ? `${customers.length} cadastrados` : '0 cadastrados'}
           </span>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
        <input
          type="text"
          placeholder="Buscar cliente (Nome, Fantasia, CPF/CNPJ)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex justify-center p-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(customer => (
            <div key={customer.id} className={`bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border flex flex-col gap-3 transition-colors hover:border-blue-200 dark:hover:border-blue-900 ${customer.id === '0' ? 'border-orange-200 bg-orange-50/30 dark:border-orange-900 dark:bg-orange-900/10' : 'border-slate-100 dark:border-slate-700'}`}>
                
                {/* Cabeçalho do Card */}
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-full mt-1 ${customer.id === '0' ? 'bg-orange-100 dark:bg-orange-900/40' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                        {customer.id === '0' ? (
                            <Store className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                        ) : customer.document.length > 14 ? (
                            <Building2 className="w-6 h-6 text-blue-700 dark:text-blue-400" />
                        ) : (
                            <UserCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                            <h3 className="font-bold text-slate-800 dark:text-white truncate pr-2">{customer.name}</h3>
                            <span className={`text-[10px] px-2 py-0.5 rounded ${customer.id === '0' ? 'bg-orange-200 text-orange-800 dark:bg-orange-800 dark:text-orange-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-500'}`}>
                            ID: {customer.id}
                            </span>
                        </div>
                        
                        {customer.fantasyName && customer.fantasyName !== customer.name && (
                            <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-0.5">{customer.fantasyName}</p>
                        )}
                        
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{customer.document}</p>
                        
                        <div className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                            <div className="flex items-start gap-1.5">
                                <MapPin className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" /> 
                                <span className="leading-tight">
                                    {customer.address}
                                    {customer.addressNumber ? `, ${customer.addressNumber}` : ''}
                                    {customer.neighborhood ? ` - ${customer.neighborhood}` : ''}
                                    <br/>
                                    {customer.city ? `${customer.city}` : ''}
                                    {customer.state ? ` / ${customer.state}` : ''}
                                </span>
                            </div>
                            
                            {customer.phone && (
                                <div className="flex items-center gap-1.5 mt-1">
                                    <Phone className="w-3.5 h-3.5 text-green-600 shrink-0" /> 
                                    <span>{customer.phone}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                {/* Rodapé do Card com Dados de Venda */}
                {(customer.sellerName || customer.lastSaleDate) && (
                    <div className="pt-3 mt-1 border-t border-slate-100 dark:border-slate-700 grid grid-cols-2 gap-2 text-xs">
                        {customer.sellerName && (
                            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                                <span className="truncate" title={customer.sellerName}>
                                    Vend: <strong>{customer.sellerName}</strong>
                                </span>
                            </div>
                        )}
                        
                        {customer.lastSaleDate && (
                            <div className="flex flex-col items-end justify-center col-span-1 ml-auto">
                                <div className="flex items-center gap-1.5 text-slate-500">
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span>{formatDate(customer.lastSaleDate)}</span>
                                </div>
                                {(customer.lastSaleValue || 0) > 0 && (
                                    <div className="flex items-center gap-1 font-bold text-green-600 dark:text-green-400 mt-0.5">
                                        <DollarSign className="w-3.5 h-3.5" />
                                        <span>R$ {customer.lastSaleValue?.toFixed(2)}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
          ))}
          {filtered.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                  <UserCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Nenhum cliente encontrado.</p>
              </div>
          )}
        </div>
      )}
    </div>
  );
};
