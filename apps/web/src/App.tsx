import { useEffect, useState } from 'react';
import {
  Sun,
  Mic,
  Headphones,
  BookOpen,
  MessageCircle,
  Settings as SettingsIcon,
  ArrowUpRight,
  Download,
  Menu,
  X,
  WifiOff,
  RefreshCw,
  LogIn,
} from 'lucide-react';
import { AppProvider, useApp } from './context';
import { PlayerProvider } from './player';
import { Today } from './views/Today';
import { Capture } from './views/Capture';
import { Listen } from './views/Listen';
import { Memory } from './views/Memory';
import { Adviser } from './views/Adviser';
import { Settings } from './views/Settings';
import { Brand, Button, IconButton } from './components/ui';
import { appMode } from './lib/api';
import { configured, observeAuth, login } from './lib/auth';
import { buildLabel } from './build-info';
const navigation = [
  { id: 'today', label: 'Today', icon: Sun },
  { id: 'capture', label: 'Capture', icon: Mic },
  { id: 'listen', label: 'Listen', icon: Headphones },
  { id: 'memory', label: 'Memory', icon: BookOpen },
  { id: 'adviser', label: 'Adviser', icon: MessageCircle },
];
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function App() {
  const [authenticated, setAuth] = useState(appMode !== 'cloud'),
    [waiting, setWaiting] = useState(appMode === 'cloud' && configured()),
    [error, setError] = useState('');
  useEffect(() => {
    if (appMode !== 'cloud' || !configured()) return;
    return observeAuth((user) => {
      setAuth(!!user);
      setWaiting(false);
    });
  }, []);
  if (!authenticated)
    return (
      <div className="login-page">
        <Brand />
        <div className="login-card">
          <p className="eyebrow">Your private workspace</p>
          <h1>
            Capture. Decide.
            <br />
            <em>Get it done.</em>
          </h1>
          <p>
            Your notes, your tasks, and a daily briefing.
            <br />
            Private to you.
          </p>
          {waiting ? (
            <p>Opening your workspace…</p>
          ) : configured() ? (
            <Button onClick={() => void login().catch((e) => setError(e.message))}>
              <LogIn size={18} />
              Sign in with Google
            </Button>
          ) : (
            <p className="inline-warning">
              Add the Firebase web configuration and API URL to your deployment to open your private
              workspace. See docs/SETUP.md in the project.
            </p>
          )}
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          <p className="small muted">Access is restricted to your configured owner account.</p>
        </div>
      </div>
    );
  return (
    <AppProvider>
      <PlayerProvider>
        <Shell />
      </PlayerProvider>
    </AppProvider>
  );
}
function Shell() {
  const { data, loading, error, reload, setError } = useApp();
  const [route, setRoute] = useState(location.hash.slice(2).split('?')[0] || 'today'),
    [menu, setMenu] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [install, setInstall] = useState<InstallEvent | null>(null);
  useEffect(() => {
    void reload();
    const hash = () => {
      setRoute(location.hash.slice(2).split('?')[0] || 'today');
      setMenu(false);
      window.scrollTo(0, 0);
    };
    const status = () => setOnline(navigator.onLine);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener('hashchange', hash);
    window.addEventListener('online', status);
    window.addEventListener('offline', status);
    window.addEventListener('beforeinstallprompt', prompt);
    return () => {
      window.removeEventListener('hashchange', hash);
      window.removeEventListener('online', status);
      window.removeEventListener('offline', status);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, []);
  const label =
    navigation.find((n) => n.id === route)?.label || (route === 'settings' ? 'Settings' : 'Today');
  const firstName = data?.settings.name || 'you';
  const greeting =
    new Date().getHours() < 12
      ? 'Good morning'
      : new Date().getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={'sidebar ' + (menu ? 'open' : '')}>
        <a href="#/today" className="brand-link" aria-label="Steadier home">
          <Brand />
        </a>
        <p className="brand-caption">YOUR SECOND BRAIN.</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={'#/' + id}
              className={route === id ? 'active' : ''}
              aria-current={route === id ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === 'capture' && <span className="nav-plus">+</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="mini-star">✳</span>
            <p>
              Pick the next action.
              <br />
              Then do it.
            </p>
          </div>
          {install && (
            <button
              className="install-link"
              onClick={async () => {
                await install.prompt();
                await install.userChoice;
                setInstall(null);
              }}
            >
              <Download size={17} />
              Install on this device
            </button>
          )}
          <a href="#/settings" className={'settings-nav ' + (route === 'settings' ? 'active' : '')}>
            <SettingsIcon size={19} />
            Settings
          </a>
          <div className="profile">
            <span className="avatar">{firstName === 'you' ? 'S' : firstName[0].toUpperCase()}</span>
            <div>
              <strong>{firstName === 'you' ? 'Your workspace' : firstName + "'s workspace"}</strong>
              <span>{appMode === 'demo' ? 'Preview workspace' : 'Personal workspace'}</span>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <IconButton
              label="Open navigation"
              className="mobile-menu"
              onClick={() => setMenu(true)}
            >
              <Menu size={22} />
            </IconButton>
            <span className="breadcrumb">
              Workspace <span>/</span> <strong>{label}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <span className="date-label">
              {new Date().toLocaleDateString('en-AU', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </span>
            <span className="private-label">
              <span className="tiny-dot" />
              Private
            </span>
          </div>
        </header>
        <main id="main-content">
          <div className="page-greeting">
            <span>
              {greeting}
              {firstName !== 'you' ? ', ' + firstName : ''}.
            </span>
            <span>Pick one thing and start.</span>
          </div>
          {appMode === 'demo' && (
            <div className="demo-banner">
              <span className="demo-pill">PREVIEW</span>
              <span>Sample data, stored on this device. Nothing is sent to a server.</span>
              <a href="#/settings">
                Connect your own <ArrowUpRight size={14} />
              </a>
            </div>
          )}
          {!online && (
            <div className="offline-banner" role="status">
              <WifiOff size={16} />
              You are offline. Downloaded audio and recordings on this device are available.
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <div>{error}</div>
              <Button variant="ghost" onClick={() => void reload()}>
                <RefreshCw size={14} />
                Retry
              </Button>
              <IconButton label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </IconButton>
            </div>
          )}
          {loading ? (
            <div className="page-loading">
              <div className="skeleton" />
              <div className="skeleton" />
              <p>Loading…</p>
            </div>
          ) : data ? (
            <>
              {route === 'capture' ? (
                <Capture />
              ) : route === 'listen' ? (
                <Listen />
              ) : route === 'memory' ? (
                <Memory />
              ) : route === 'adviser' ? (
                <Adviser />
              ) : route === 'settings' ? (
                <Settings />
              ) : (
                <Today />
              )}
            </>
          ) : (
            <div className="card connection-empty">
              <h2>Can't reach your workspace.</h2>
              <p>
                Check the API address, account configuration and your internet connection, then try
                again.
              </p>
              <Button onClick={() => void reload()}>Try again</Button>
            </div>
          )}
          <footer className="page-footer">
            <span>Private to you. Export or delete your data anytime.</span>
            <span className="build-stamp" title={buildLabel}>
              {buildLabel}
            </span>
            <span>steadier.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map(({ id, label, icon: Icon }) => (
          <a key={id} href={'#/' + id} className={route === id ? 'active' : ''}>
            <Icon size={21} />
            <span>
              {id === 'capture'
                ? 'Capture'
                : id === 'memory'
                  ? 'Memory'
                  : id === 'adviser'
                    ? 'Adviser'
                    : label}
            </span>
          </a>
        ))}
      </nav>
    </div>
  );
}
