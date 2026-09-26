import { createRoot } from 'react-dom/client';
import { App } from './app.js';
import { takeRuntimeToken } from './local-client.js';
const token = takeRuntimeToken(window.location, window.history);
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App token={token} />);
