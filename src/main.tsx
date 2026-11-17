import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyAssetVars } from './native';
import './styles.css';
import './room.css';

applyAssetVars();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
