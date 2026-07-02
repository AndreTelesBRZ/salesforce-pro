const ENV = {
  VITE_APP_INTEGRATION_TOKEN_LLFIX: import.meta.env.VITE_APP_INTEGRATION_TOKEN_LLFIX,
  VITE_APP_INTEGRATION_TOKEN_EDSON: import.meta.env.VITE_APP_INTEGRATION_TOKEN_EDSON,
  VITE_APP_INTEGRATION_TOKEN: import.meta.env.VITE_APP_INTEGRATION_TOKEN,
  VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
  VITE_ALLOW_LOCAL_EDSON: import.meta.env.VITE_ALLOW_LOCAL_EDSON,
} as const;

export type EnvKey = keyof typeof ENV;

export const readEnv = (key: EnvKey): string => {
  const value = ENV[key];
  return typeof value === 'string' ? value.trim() : '';
};
