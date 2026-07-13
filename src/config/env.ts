const ENV = {
  VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
} as const;

export type EnvKey = keyof typeof ENV;

export const readEnv = (key: EnvKey): string => {
  const value = ENV[key];
  return typeof value === 'string' ? value.trim() : '';
};
