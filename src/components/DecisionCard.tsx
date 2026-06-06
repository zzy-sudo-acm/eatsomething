import { useMemo } from 'react';
import { BadgeCheck, CircleDollarSign, MapPin, MessageCircle, ShieldAlert } from 'lucide-react';
import { Feedback, Recommendation } from '../types';
import { feedbackLabels, foodDistanceLabels, mealRoleLabels } from '../lib/options';

interface DecisionCardProps {
  recommendation: Recommendation;
  submittedFeedback?: Feedback;
  onFeedback: (feedback: Feedback) => void;
}

const feedbackOrder: Feedback[] = ['worth', 'normal', 'regret'];

const confirmCopy: Record<Feedback, string[]> = {
  worth: ['已归档，这顿正式进入你的胃部高光时刻。', '收到，系统记下了：这家可以再来。'],
  normal: ['已归档，本次决定正式进入胃部档案。', '记下了，不功不过，下次还能商量。'],
  regret: ['系统已记仇，下次会参考你这份胃部证词。', '已归档，下次它出现时系统会先犹豫一下。'],
};

const stabilityText = (stability: string) =>
  stability === 'high' ? '高' : stability === 'medium' ? '中' : '低';

export function DecisionCard({ recommendation, submittedFeedback, onFeedback }: DecisionCardProps) {
  const { food, copy } = recommendation;
  const isCouple = copy.title.includes('你俩') || copy.punchline.includes('你俩');

  const confirmLine = useMemo(() => {
    if (!submittedFeedback) return '';
    const lines = confirmCopy[submittedFeedback];
    return lines[Math.floor(Math.random() * lines.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedFeedback]);

  return (
    <article className={`decision-card anim-pop ${isCouple ? 'decision-card--couple' : ''}`}>
      <div className="decision-card__topline">
        <span>今日胃部判决单</span>
        <span className={`verdict-pill tone-${copy.verdictTone}`}>{copy.verdict}</span>
      </div>
      <h2>{copy.title}</h2>
      <div className="decision-food-name">{food.name}</div>

      <div className="meta-strip">
        <span>
          <CircleDollarSign size={15} />
          约 {food.estimatedPrice} 元
        </span>
        <span>
          <MapPin size={15} />
          {foodDistanceLabels[food.distance]}
        </span>
        <span>
          <BadgeCheck size={15} />
          {mealRoleLabels[food.mealRole]} · 饱腹 {food.satiety}/5
        </span>
        <span>
          <BadgeCheck size={15} />
          稳定性 {stabilityText(food.stability)}
        </span>
      </div>

      <div className="card-label">为什么是它</div>
      <p className="decision-reason">{copy.reason}</p>

      <div className="decision-risk">
        <ShieldAlert size={17} />
        <span>{copy.risk}</span>
      </div>

      <div className="alternatives">
        <span>不满意还可以：</span>
        {copy.alternatives.length ? (
          copy.alternatives.map((name) => <b key={name}>{name}</b>)
        ) : (
          <b>没有备选，命运很专一</b>
        )}
      </div>

      <div className="punchline">
        <MessageCircle size={17} />
        <span>{copy.punchline}</span>
      </div>

      <div className="feedback-block">
        <div className="feedback-label">吃完了？给系统一句胃部证词：</div>
        <div className="feedback-row" aria-label="反馈">
          {feedbackOrder.map((feedback) => (
            <button
              key={feedback}
              type="button"
              className={`feedback-button ${submittedFeedback === feedback ? 'is-active' : ''}`}
              onClick={() => onFeedback(feedback)}
              disabled={Boolean(submittedFeedback)}
            >
              {feedbackLabels[feedback]}
            </button>
          ))}
        </div>
        {submittedFeedback && <div className="saved-tip">{confirmLine}</div>}
      </div>
    </article>
  );
}
