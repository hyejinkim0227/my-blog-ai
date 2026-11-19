import { createRoot } from 'react-dom/client';
import App from './App';
import { Global } from './ui';

createRoot(document.getElementById('root')!).render(<><Global/><App/></>);
