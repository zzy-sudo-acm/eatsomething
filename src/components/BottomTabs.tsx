import { BookOpen, History, Settings, Sparkles } from 'lucide-react';
import { TabKey } from '../types';
import { tabLabels } from '../lib/options';

interface BottomTabsProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

const icons = {
  decide: Sparkles,
  library: BookOpen,
  history: History,
  settings: Settings,
};

const tabs: TabKey[] = ['decide', 'library', 'history', 'settings'];

export function BottomTabs({ activeTab, onChange }: BottomTabsProps) {
  return (
    <nav className="bottom-tabs" aria-label="底部导航">
      {tabs.map((tab) => {
        const Icon = icons[tab];
        const active = activeTab === tab;
        return (
          <button
            key={tab}
            className={`tab-button ${active ? 'is-active' : ''}`}
            type="button"
            onClick={() => onChange(tab)}
            aria-label={tabLabels[tab]}
            aria-current={active ? 'page' : undefined}
            title={tabLabels[tab]}
          >
            <Icon size={21} strokeWidth={2.2} />
            <span>{tabLabels[tab]}</span>
          </button>
        );
      })}
    </nav>
  );
}
