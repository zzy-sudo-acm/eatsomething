import { BadgeCheck, CircleDollarSign, MapPin, MessageCircle, ShieldAlert } from 'lucide-react';
import { Feedback, Recommendation } from '../types';
import { feedbackLabels, foodDistanceLabels, priceLabels } from '../lib/options';

interface DecisionCardProps {
  recommendation: Recommendation;
  submittedFeedback?: Feedback;
  onFeedback: (feedback: Feedback) => void;
}

const feedbackOrder: Feedback[] = ['worth', 'normal', 'regret'];

export function DecisionCard({ recommendation, submittedFeedback, onFeedback }: DecisionCardProps) {
  const { food, copy } = recommendation;

  return (
    <article className="decision-card">
      <div className="decision-card__topline">
        <span>Tonight</span>
        <span>Score {Math.round(recommendation.score)}</span>
      </div>
      <h2>{copy.title}</h2>
      <div className="decision-food-name">{food.name}</div>

      <div className="meta-strip">
        <span>
          <CircleDollarSign size={16} />
          预计花费 {priceLabels[food.priceRange]}
        </span>
        <span>
          <MapPin size={16} />
          距离 {foodDistanceLabels[food.distance]}
        </span>
        <span>
          <BadgeCheck size={16} />
          稳定性 {food.stability === 'high' ? '高' : food.stability === 'medium' ? '中' : '低'}
        </span>
      </div>

      <div className="card-label">推荐理由</div>
      <p className="decision-reason">{copy.reason}</p>

      <div className="decision-risk">
        <ShieldAlert size={17} />
        <span>风险提示：{copy.risk}</span>
      </div>

      <div className="alternatives">
        <span>备选</span>
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

      {submittedFeedback && <div className="saved-tip">已记录，本次决定正式归档。</div>}
    </article>
  );
}
