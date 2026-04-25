import { useEffect, useState } from 'react';
import MusicDashboard from './components/MusicDashboard.jsx';
import Callback from './pages/Callback.jsx';

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (path === '/callback') return <Callback />;
  return <MusicDashboard />;
}
