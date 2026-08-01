import { createRoot } from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { wagmiConfig } from './lib/wagmi';

import App from './App';

import './index.css';

createRoot(document.getElementById('root')!).render(
  <WagmiProvider config={wagmiConfig}>
    <App />
  </WagmiProvider>
);
