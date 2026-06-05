import { useEffect, useState } from 'react';
import { BottomTabs } from './components/BottomTabs';
import { loadFoods, loadHistory, loadTheme, saveFoods, saveHistory, saveTheme, ThemeMode } from './lib/storage';
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

  const updateFoods = (next: FoodItem[]) => {
    setFoods(next);
    saveFoods(next);
  };

  const updateHistory = (next: DecisionHistory[]) => {
    setHistory(next);
    saveHistory(next);
  };

  const addHistoryEntry = (entry: DecisionHistory) => {
    updateHistory([entry, ...history].slice(0, 100));
  };

  return (
    <div className="app-shell">
      <main>
        {activeTab === 'decide' && <DecidePage foods={foods} history={history} onAddHistory={addHistoryEntry} />}
        {activeTab === 'library' && <LibraryPage foods={foods} onSaveFoods={updateFoods} />}
        {activeTab === 'history' && <HistoryPage history={history} />}
        {activeTab === 'settings' && (
          <SettingsPage
            foods={foods}
            theme={theme}
            onChangeTheme={updateTheme}
            onSaveFoods={updateFoods}
            onSaveHistory={updateHistory}
          />
        )}
      </main>
      <BottomTabs activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}
