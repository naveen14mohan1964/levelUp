import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/inter';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import App from './App.jsx';
import './styles.css';
import './styles-tracking.css';
import './styles-mentor.css';
import './styles-linkedin.css';
import './styles-referrals.css';
import './styles-ai.css';
import './styles-fx.css';
import './styles-nav.css';
import './styles-today.css';
import './styles-map.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* reducedMotion="user": with the OS "reduce motion" setting on, transform animations are skipped (opacity fades stay) */}
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
);
