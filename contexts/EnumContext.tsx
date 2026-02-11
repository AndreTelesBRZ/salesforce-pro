import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { EnumOption } from '../types';

export interface EnumContextValue {
  enums: Record<string, EnumOption[]>;
  loading: boolean;
  refreshEnums: () => Promise<void>;
}

const EnumContext = createContext<EnumContextValue>({
  enums: {},
  loading: true,
  refreshEnums: async () => {},
});

export const EnumProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [enums, setEnums] = useState<Record<string, EnumOption[]>>({});
  const [loading, setLoading] = useState(true);

  const loadEnums = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiService.fetchEnums();
      setEnums(data);
    } catch (error) {
      console.error('Falha ao carregar enums', error);
      setEnums({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnums();
  }, [loadEnums]);

  return (
    <EnumContext.Provider value={{ enums, loading, refreshEnums: loadEnums }}>
      {children}
    </EnumContext.Provider>
  );
};

export const useEnums = () => {
  return useContext(EnumContext);
};
