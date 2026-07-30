import { useState } from 'react';
import { BadgeCheck, Check, CircleDollarSign, MapPin, MessageCircle, ShieldAlert } from 'lucide-react';
import { Feedback, Recommendation } from '../types';
import { feedbackLabels, foodDistanceLabels, mealRoleLabels } from '../lib/options';

interface DecisionCardProps {
  recommendation: Recommendation;
  submittedFeedback?: Feedback;
  picked?: boolean;
  devMode?: boolean;
  onFeedback: (feedback: Feedback) => void;
  onPick: () => void;
}

type VisibleFeedback = Exclude<Feedback, 'skipped'>;

const feedbackOrder: VisibleFeedback[] = ['worth', 'normal', 'regret'];

const confirmCopy: Record<VisibleFeedback, string[]> = {
  worth: ['已归档，这顿正式进入你的胃部高光时刻。', '收到，系统记下了：这家可以再来。'],
  normal: ['已归档，本次决定正式进入胃部档案。', '记下了，不功不过，下次还能商量。'],
  regret: ['已记入黑历史，下次它再敢出现，系统先替你拦一道。', '系统已记仇，下次会参考你这份胃部证词。'],
};

const pickConfirm = [
  '已归档为「吃过·未评分」——系统会记得你选了它，但不当成好评或差评。',
  '记上了，这顿算「吃过·未评分」，不影响你的好评差评统计。',
  '搞定，先归档为吃过；这次不打分，系统也不替你脑补。',
];

const pickRandomLine = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];

const stabilityText = (stability: string) =>
  stability === 'high' ? '高' : stability === 'medium' ? '中' : '低';

export function DecisionCard({
  recommendation,
  submittedFeedback,
  picked = false,
  devMode = false,
  onFeedback,
  onPick,
}: DecisionCardProps) {
  const { food, copy } = recommendation;
  const isCouple = copy.title.includes('你俩') || copy.punchline.includes('你俩');
  const [showDebug, setShowDebug] = useState(false);
  const [confirmLine, setConfirmLine] = useState('');
  const locked = Boolean(submittedFeedback) || picked;
  const visibleConfirmLine = locked ? confirmLine : '';

  const handleFeedbackClick = (feedback: VisibleFeedback) => {
    if (locked) return;
    setConfirmLine(pickRandomLine(confirmCopy[feedback]));
    onFeedback(feedback);
  };

  const handlePickClick = () => {
    if (locked) return;
    setConfirmLine(pickRandomLine(pickConfirm));
    onPick();
  };

  return (
    <article
      className={`decision-card anim-pop decision-card--tone-${copy.verdictTone} ${
        isCouple ? 'decision-card--couple' : ''
      }`}
    >
      <div className="decision-card__topline">
        <span>今日胃部判决单</span>
        <span className={`verdict-pill tone-${copy.verdictTone}`}>{copy.verdict}</span>
      </div>
      <h2>{copy.title}</h2>
      <div className="decision-food-name">{food.name}</div>

      {(recommendation.plan.drink || recommendation.plan.addon) && (
        <div className="meal-plan-breakdown">
          <div className="meal-plan-row meal-plan-row--main">
            <span className="meal-plan-label">主食</span>
            <span className="meal-plan-name">{recommendation.plan.main.name}</span>
            <span className="meal-plan-price">{recommendation.plan.main.estimatedPrice} 元</span>
          </div>
          {recommendation.plan.drink && (
            <div className="meal-plan-row meal-plan-row--drink">
              <span className="meal-plan-label">搭配</span>
              <span className="meal-plan-name">{recommendation.plan.drink.name}</span>
              <span className="meal-plan-price">{recommendation.plan.drink.estimatedPrice} 元</span>
            </div>
          )}
          {recommendation.plan.addon && (
            <div className="meal-plan-row meal-plan-row--addon">
              <span className="meal-plan-label">加餐</span>
              <span className="meal-plan-name">{recommendation.plan.addon.name}</span>
              <span className="meal-plan-price">{recommendation.plan.addon.estimatedPrice} 元</span>
            </div>
          )}
          <div className="meal-plan-divider" />
          <div className="meal-plan-row meal-plan-row--total">
            <span className="meal-plan-label">预计总价</span>
            <span className="meal-plan-total-price">{recommendation.plan.totalPrice} 元</span>
          </div>
        </div>
      )}

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

      {devMode && (
      <div className="recommend-debug">
        <button
          type="button"
          className="debug-toggle"
          aria-expanded={showDebug}
          onClick={() => setShowDebug((value) => !value)}
        >
          {showDebug ? '收起推荐依据' : '展开推荐依据'}
        </button>
        {showDebug && (
          <div className="debug-panel">
            {recommendation.scoredFoods.slice(0, 8).map((item, index) => (
              <div className="debug-item" key={item.food.id}>
                <div className="debug-item__head">
                  <b>
                    {index + 1}. {item.food.name}
                  </b>
                  <span>{item.score} 分</span>
                </div>
                <div className="debug-meta">
                  {mealRoleLabels[item.food.mealRole]} · 饱腹 {item.food.satiety}/5 · 约 {item.food.estimatedPrice} 元
                </div>
                <p>reasons: {item.reasons.length ? item.reasons.join('、') : '-'}</p>
                <p>warnings: {item.warnings.length ? item.warnings.join('、') : '-'}</p>
                <p>hardBlocked: {String(item.hardBlocked)}</p>
                <p>
                  hardBlockReasons:{' '}
                  {item.hardBlockReasons.length ? item.hardBlockReasons.join('、') : '-'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="feedback-block">
        {!locked && (
          <button type="button" className="primary-button pick-button" onClick={handlePickClick}>
            <Check size={19} />
            就它了，不打分
          </button>
        )}
        <div className="feedback-label">{locked ? '已记录' : '或者吃完顺便打个分（可选）：'}</div>
        <div className="feedback-row" aria-label="反馈">
          {feedbackOrder.map((feedback) => (
            <button
              key={feedback}
              type="button"
              className={`feedback-button ${submittedFeedback === feedback ? 'is-active' : ''}`}
              onClick={() => handleFeedbackClick(feedback)}
              disabled={locked}
            >
              {feedbackLabels[feedback]}
            </button>
          ))}
        </div>
        {visibleConfirmLine && <div className="saved-tip">{visibleConfirmLine}</div>}
      </div>
    </article>
  );
}
