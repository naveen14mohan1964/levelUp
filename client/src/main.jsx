import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import '@fontsource-variable/geist';
import App from './App.jsx';
import { registerPwa } from './lib/pwa.js';
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
import './styles-buddy.css';
import './styles-cards.css';
import './styles-report.css';
import './styles-mastery.css';
import './styles-assignments.css';
import './styles-motion.css';

registerPwa();

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
