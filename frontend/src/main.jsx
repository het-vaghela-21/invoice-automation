import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#fefdf9',
            color: '#0f2c1f',
            border: '1px solid #ede9e0',
            borderRadius: '0.75rem',
            fontSize: '0.875rem',
            fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
            boxShadow: '0 8px 24px -4px rgba(9, 24, 16, 0.12)',
          },
          success: { iconTheme: { primary: '#a5611e', secondary: '#fefdf9' } },
          error: { iconTheme: { primary: '#dc2626', secondary: '#fefdf9' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
