import { createRoot } from 'react-dom/client';
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<main><h1>Codex Task Lens</h1><p>构建基线已就绪；任务监控尚未连接。</p></main>);
