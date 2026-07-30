import { Clock3 } from 'lucide-react';
import { DecisionHistory } from '../types';
import { displayMoodLabel, distanceLabels, feedbackLabels, priceLabels } from '../lib/options';

interface HistoryListProps {
  history: DecisionHistory[];
}

const formatTime = (time: number) =>
  new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time);

export function HistoryList({ history }: HistoryListProps) {
  if (!history.length) {
    return <div className="empty-state">还没有历史。先让系统背一次锅。</div>;
  }

  return (
    <div className="history-list">
      {history.map((item) => (
        <article className="history-item" key={item.id}>
          <div className="history-time">
            <Clock3 size={15} />
            {formatTime(item.createdAt)}
          </div>
          <div className="history-name">
            {item.foodName}
            {(item.drinkName || item.addonName) && (
              <span className="history-combo">
                {[item.drinkName, item.addonName].filter(Boolean).join(' + ')}
                {item.totalPrice != null && ` · ${item.totalPrice}元`}
              </span>
            )}
          </div>
          <div className="history-meta">
            <span>{priceLabels[item.budget]}</span>
            <span>{distanceLabels[item.distance]}</span>
            <span
              className={
                item.feedback === 'worth'
                  ? 'fb-worth'
                  : item.feedback === 'regret'
                    ? 'fb-regret'
                    : item.feedback === 'skipped'
                      ? 'fb-skipped'
                      : undefined
              }
            >
              {item.feedback ? feedbackLabels[item.feedback] : '未反馈'}
            </span>
          </div>
          <p>
            {[...item.selectedMoods, ...(item.partnerMoods ?? [])].slice(0, 5).map(displayMoodLabel).join(' / ') ||
              '随缘局'}
          </p>
        </article>
      ))}
    </div>
  );
}
