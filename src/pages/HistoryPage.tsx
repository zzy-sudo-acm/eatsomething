import { Trophy, RotateCcw, Siren, Utensils } from 'lucide-react';
import { HistoryList } from '../components/HistoryList';
import { DecisionHistory } from '../types';

interface HistoryPageProps {
  history: DecisionHistory[];
}

const topRepeated = (history: DecisionHistory[]) => {
  const recent = history.slice(0, 20);
  const count = new Map<string, number>();
  recent.forEach((item) => count.set(item.foodName, (count.get(item.foodName) ?? 0) + 1));
  return [...count.entries()]
    .filter(([, value]) => value > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, value]) => `${name} x${value}`);
};

export function HistoryPage({ history }: HistoryPageProps) {
  const recentNames = history.slice(0, 4).map((item) => item.foodName);
  const worth = history.find((item) => item.feedback === 'worth');
  const regret = history.find((item) => item.feedback === 'regret');
  const repeated = topRepeated(history);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>历史</h1>
        </div>
      </header>

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
          <b>{repeated.join('、') || '还算克制'}</b>
        </div>
      </section>

      <HistoryList history={history} />
    </div>
  );
}
