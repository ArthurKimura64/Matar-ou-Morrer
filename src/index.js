import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/bootstrap6-fixes.css';
import './styles/themes.css';
import './styles/global.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);