import { useEffect, useState } from 'react';
import { BottomTabs } from './components/BottomTabs';
import {
  addHistory,
  loadDevMode,
  loadFoods,
  loadHistory,
  loadTheme,
  normalizeFoods,
  saveDevMode,
  saveFoods,
  saveHistory,
  saveTheme,
  ThemeMode,
} from './lib/storage';
import { DecidePage } from './pages/DecidePage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { SettingsPage } from './pages/SettingsPage';
import { DecisionHistory, FoodItem, TabKey } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('decide');
  const [foods, setFoods] = useState<FoodItem[]>(() => loadFoods());
  const [history, setHistory] = useState<DecisionHistory[]>(() => loadHistory());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [devMode, setDevMode] = useState<boolean>(() => loadDevMode());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'night' ? '#181410' : '#faf1dd');
  }, [theme]);

  const updateTheme = (next: ThemeMode) => {
    setTheme(next);
    saveTheme(next);
  };

  const updateDevMode = (next: boolean) => {
    setDevMode(next);
    saveDevMode(next);
  };

  const updateFoods = (next: FoodItem[]) => {
    const normalized = normalizeFoods(next);
    setFoods(normalized);
    saveFoods(normalized);
  };

  const updateHistory = (next: DecisionHistory[]) => {
    setHistory(next);
    saveHistory(next);
  };

  const addHistoryEntry = (entry: DecisionHistory) => {
    setHistory(addHistory(entry));
  };

  return (
    <div className="app-shell">
      <main>
        {activeTab === 'decide' && (
          <DecidePage foods={foods} history={history} devMode={devMode} onAddHistory={addHistoryEntry} />
        )}
        {activeTab === 'library' && <LibraryPage foods={foods} onSaveFoods={updateFoods} />}
        {activeTab === 'history' && <HistoryPage history={history} />}
        {activeTab === 'settings' && (
          <SettingsPage
            foods={foods}
            theme={theme}
            devMode={devMode}
            onChangeTheme={updateTheme}
            onChangeDevMode={updateDevMode}
            onSaveFoods={updateFoods}
            onSaveHistory={updateHistory}
          />
        )}
      </main>
      <BottomTabs activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
