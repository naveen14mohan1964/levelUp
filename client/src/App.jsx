import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AREAS } from './areas.js';
import { GameProvider } from './game.jsx';
import Sidebar from './components/Sidebar.jsx';
import LevelComplete from './components/LevelComplete.jsx';
import Home from './pages/Home.jsx';
import DsaLayout from './pages/DsaLayout.jsx';
import Today from './pages/Today.jsx';
import Plan from './pages/Plan.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import Workout from './pages/Workout.jsx';
import Meals from './pages/Meals.jsx';
import Progress from './pages/Progress.jsx';
import AI from './pages/AI.jsx';
import Learn from './pages/Learn.jsx';
import Problems from './pages/Problems.jsx';
import Review from './pages/Review.jsx';
import Settings from './pages/Settings.jsx';
import Mentor from './pages/Mentor.jsx';
import LinkedIn from './pages/LinkedIn.jsx';
import DesignPreview from './pages/DesignPreview.jsx';

// The first path segment decides the accent colour (see [data-area] in styles.css).
function useArea() {
  const seg = useLocation().pathname.split('/')[1];
  return AREAS.some((a) => a.key === seg) ? seg : 'home';
}

export default function App() {
  const area = useArea();
  return (
    <GameProvider>
    <div className="shell" data-area={area}>
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dsa" element={<DsaLayout />}>
            <Route index element={<Today />} />
            <Route path="day/:date" element={<Today />} />
            <Route path="problems" element={<Problems />} />
            <Route path="review" element={<Review />} />
            <Route path="plan" element={<Plan />} />
          </Route>
          <Route path="/settings" element={<Settings />} />
          <Route path="/mentor" element={<Mentor />} />
          <Route path="/linkedin/*" element={<LinkedIn />} />
          <Route path="/react/*" element={<ProjectPage area="react" />} />
          <Route path="/dotnet/*" element={<ProjectPage area="dotnet" />} />
          <Route path="/node/*" element={<ProjectPage area="node" />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/workout/day/:date" element={<Workout />} />
          <Route path="/meals" element={<Meals />} />
          <Route path="/meals/day/:date" element={<Meals />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/progress/day/:date" element={<Progress />} />
          <Route path="/ai" element={<AI />} />
          <Route path="/lld" element={<Learn key="lld" track="lld" />} />
          <Route path="/hld" element={<Learn key="hld" track="hld" />} />
          <Route path="/design" element={<DesignPreview />} />
          {/* Step 1 URLs */}
          <Route path="/plan" element={<Navigate to="/dsa/plan" replace />} />
          <Route path="/day/:date" element={<Navigate to="/dsa" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <LevelComplete />
    </div>
    </GameProvider>
  );
}
