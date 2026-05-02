import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App.tsx';
import '@/index.css';
import { AcademicYearProvider } from '@/shared/context/AcademicYearContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AcademicYearProvider>
      <App />
    </AcademicYearProvider>
  </StrictMode>,
);
