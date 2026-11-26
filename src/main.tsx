import { StrictMode } from 'react';
import { LazyMotion, domAnimation } from 'framer-motion';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './brand-refresh.css';
import './lib/table-scroll-affordance.css';
import { installTableScrollAffordances } from './lib/table-scroll-affordance';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={domAnimation} strict>
      <App />
    </LazyMotion>
  </StrictMode>
);
installTableScrollAffordances();
