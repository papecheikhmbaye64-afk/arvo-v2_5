import { createRoot } from 'react-dom/client';
import App from './App.jsx';
// Polices hébergées avec l'appli (aucune requête vers Google).
import '@fontsource/figtree/latin-400.css';
import '@fontsource/figtree/latin-500.css';
import '@fontsource/figtree/latin-600.css';
import '@fontsource/figtree/latin-700.css';
import '@fontsource/figtree/latin-800.css';
import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/satin.css';
import { dismissSplash } from './lib/splash.js';

createRoot(document.getElementById('root')).render(<App />);
dismissSplash();
