import { BUILD_INFO } from './buildInfo';

export const APP_VERSION_INFO = {
  name: 'SalesForce Pro',
  version: BUILD_INFO.version,
  build: BUILD_INFO.build,
  environment: import.meta.env.MODE,
  commit: BUILD_INFO.commit || import.meta.env.VITE_APP_COMMIT || '',
  buildDate: BUILD_INFO.buildDate || import.meta.env.VITE_APP_BUILD_DATE || '',
} as const;

export const APP_VERSION_LABEL = `v${APP_VERSION_INFO.version} • build ${APP_VERSION_INFO.build}`;
