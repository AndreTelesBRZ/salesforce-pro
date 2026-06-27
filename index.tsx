import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './global.css';
import { APP_VERSION_INFO } from './src/version';

if (import.meta.env.DEV) {
  console.info(
    `[${APP_VERSION_INFO.name}] v${APP_VERSION_INFO.version} build ${APP_VERSION_INFO.build} ${APP_VERSION_INFO.commit || ''}`.trim()
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
