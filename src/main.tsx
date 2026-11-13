import { createRoot } from 'react-dom/client';
import { initTheme } from './theme';
import './i18n';
import App from './App.tsx';
import './index.css';

initTheme();
createRoot(document.getElementById('root')!).render(<App />);
