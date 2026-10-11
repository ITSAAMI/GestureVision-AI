import { lazy, Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Header } from './app/Header';
import { Sidebar } from './app/Sidebar';
import { StatusBar } from './app/StatusBar';
import { Spinner, Toaster } from './components/ui/Feedback';
import { visionEngine } from './features/vision/engine';
import Overview from './pages/Overview';

const LiveDetection = lazy(() => import('./pages/LiveDetection'));
const ParticleStudio = lazy(() => import('./pages/ParticleStudio'));
const GestureLab = lazy(() => import('./pages/GestureLab'));
const FaceRegistry = lazy(() => import('./pages/FaceRegistry'));
const VideoAnalysis = lazy(() => import('./pages/VideoAnalysis'));
const Sessions = lazy(() => import('./pages/Sessions'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
          <Suspense
            fallback={
              <div className="grid h-full place-items-center">
                <Spinner className="size-5" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
        <StatusBar />
      </div>
      {/* Off-screen video that feeds the vision engine; pages render their own visible copies. */}
      <video ref={visionEngine.attachVideo} muted playsInline className="pointer-events-none fixed top-0 left-0 size-px opacity-0" aria-hidden />
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="live" element={<LiveDetection />} />
          <Route path="particles" element={<ParticleStudio />} />
          <Route path="gestures" element={<GestureLab />} />
          <Route path="faces" element={<FaceRegistry />} />
          <Route path="video" element={<VideoAnalysis />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="system" element={<SystemHealth />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
