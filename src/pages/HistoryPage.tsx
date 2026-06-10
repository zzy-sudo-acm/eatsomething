import { useState } from 'react';
import { Trophy, RotateCcw, Siren, Utensils } from 'lucide-react';
import { HistoryList } from '../components/HistoryList';
import { ReportCard } from '../components/ReportCard';
import { DecisionHistory, FoodItem } from '../types';

interface HistoryPageProps {
  history: DecisionHistory[];
  foods: FoodItem[];
}

type HistoryView = 'records' | 'report';

type HistoryFilter = 'eaten' | 'skipped' | 'all';

const historyFilters: { key: HistoryFilter; label: string }[] = [
  { key: 'eaten', label: '吃过' },
  { key: 'skipped', label: '已跳过' },
  { key: 'all', label: '全部' },
];

const emptyCopy: Record<HistoryFilter, string> = {
  eaten: '还没有吃过的记录。先选一个、吃一口、再回来打个分。',
  skipped: '还没有跳过记录。看来你这次很果断。',
  all: '还没有任何记录。先去做一次决定吧。',
};

const topRepeated = (history: DecisionHistory[]) => {
  const recent = history.filter((item) => item.feedback !== 'skipped').slice(0, 20);
  const count = new Map<string, number>();
  recent.forEach((item) => count.set(item.foodName, (count.get(item.foodName) ?? 0) + 1));
  return [...count.entries()]
    .filter(([, value]) => value > 1)
    .sort((a, b) => b[1] - a[1]);
};

const repeatWarning = (history: DecisionHistory[]) => {
  const repeated = topRepeated(history);
  if (!repeated.length) return '暂无路径依赖';
  const [topName, topCount] = repeated[0];
  if (topCount >= 3) return `你最近有点太相信${topName}了`;
  if (repeated.length >= 2) return '胃部行为出现重复趋势';
  return `${topName} 最近出现了 ${topCount} 次`;
};

export function HistoryPage({ history, foods }: HistoryPageProps) {
  const [filter, setFilter] = useState<HistoryFilter>('eaten');
  const [view, setView] = useState<HistoryView>('records');

  if (!history.length) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">历史</p>
            <h1>你的胃部档案</h1>
          </div>
        </header>
        <div className="empty-state">
          <span className="empty-emoji">📂</span>
          <b>你的胃部档案还很干净。</b>
          <br />
          暂时无案底，系统还没发现你的饮食路径依赖。先去做一次决定吧。
        </div>
      </div>
    );
  }

  const eatenHistory = history.filter((item) => item.feedback !== 'skipped');
  const recentNames = eatenHistory.slice(0, 4).map((item) => item.foodName);
  const worth = history.find((item) => item.feedback === 'worth');
  const regret = history.find((item) => item.feedback === 'regret');

  const skippedCount = history.length - eatenHistory.length;
  const filteredHistory =
    filter === 'eaten'
      ? eatenHistory
      : filter === 'skipped'
        ? history.filter((item) => item.feedback === 'skipped')
        : history;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">历史</p>
          <h1>{view === 'report' ? '胃部判决报告' : '你的胃部档案'}</h1>
        </div>
        <div className="view-switch" role="group" aria-label="视图切换">
          <button
            type="button"
            className={`chip chip--small ${view === 'records' ? 'is-selected' : ''}`}
            aria-pressed={view === 'records'}
            onClick={() => setView('records')}
          >
            档案
          </button>
          <button
            type="button"
            className={`chip chip--small ${view === 'report' ? 'is-selected' : ''}`}
            aria-pressed={view === 'report'}
            onClick={() => setView('report')}
          >
            报告
          </button>
        </div>
      </header>

      {view === 'report' && <ReportCard history={history} foods={foods} />}

      {view === 'records' && (
      <>
      <section className="stats-grid">
        <div className="stat-card">
          <Utensils size={18} />
          <span>最近吃过</span>
          <b>{recentNames.join('、') || '暂无'}</b>
        </div>
        <div className="stat-card">
          <Trophy size={18} />
          <span>最值的一次</span>
          <b>{worth?.foodName ?? '还没夸过谁'}</b>
        </div>
        <div className="stat-card">
          <Siren size={18} />
          <span>最后悔的一次</span>
          <b>{regret?.foodName ?? '暂时无案底'}</b>
        </div>
        <div className="stat-card">
          <RotateCcw size={18} />
          <span>重复预警</span>
          <b>{repeatWarning(history)}</b>
        </div>
      </section>

      <div className="filter-row" role="group" aria-label="历史筛选">
        {historyFilters.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`chip chip--small ${filter === item.key ? 'is-selected' : ''}`}
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            {item.key === 'skipped' && skippedCount > 0 ? ` ${skippedCount}` : ''}
          </button>
        ))}
      </div>

      {filteredHistory.length ? (
        <HistoryList history={filteredHistory} />
      ) : (
        <div className="empty-state">
          <span className="empty-emoji">🍽️</span>
          {emptyCopy[filter]}
        </div>
      )}
      </>
      )}
    </div>
  );
}
