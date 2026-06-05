import { useMemo, useState } from 'react';
import { HeartHandshake, Shuffle } from 'lucide-react';
import { DecisionCard } from '../components/DecisionCard';
import { MoodSelector } from '../components/MoodSelector';
import { distanceLabels, moodOptions, priceLabels } from '../lib/options';
import { makeId } from '../lib/storage';
import { recommendFood } from '../lib/recommend';
import { DecisionHistory, Distance, Feedback, FoodItem, PriceRange, Recommendation } from '../types';

interface DecidePageProps {
  foods: FoodItem[];
  history: DecisionHistory[];
  onAddHistory: (entry: DecisionHistory) => void;
}

const budgetOptions: PriceRange[] = ['under10', 'under20', 'under50', 'any'];
const distanceOptions: Distance[] = ['near', 'medium', 'delivery', 'far'];

export function DecidePage({ foods, history, onAddHistory }: DecidePageProps) {
  const [selectedMoods, setSelectedMoods] = useState<string[]>(['不知道想吃啥']);
  const [partnerMoods, setPartnerMoods] = useState<string[]>([]);
  const [budget, setBudget] = useState<PriceRange>('under20');
  const [distance, setDistance] = useState<Distance>('near');
  const [coupleMode, setCoupleMode] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [submittedFeedback, setSubmittedFeedback] = useState<Feedback | undefined>();

  const canDecide = foods.length > 0;
  const selectedSummary = useMemo(
    () => [...selectedMoods, ...(coupleMode ? partnerMoods : [])],
    [coupleMode, partnerMoods, selectedMoods]
  );

  const decide = () => {
    if (!canDecide) return;
    const next = recommendFood(foods, history, {
      selectedMoods,
      partnerMoods: coupleMode ? partnerMoods : undefined,
      budget,
      distance,
      coupleMode,
    });
    setRecommendation(next);
    setSubmittedFeedback(undefined);
  };

  const handleFeedback = (feedback: Feedback) => {
    if (!recommendation || submittedFeedback) return;
    setSubmittedFeedback(feedback);
    onAddHistory({
      id: makeId('history'),
      foodId: recommendation.food.id,
      foodName: recommendation.food.name,
      selectedMoods,
      partnerMoods: coupleMode ? partnerMoods : undefined,
      budget,
      distance,
      feedback,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="page decide-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">MealMood</p>
          <h1>今天吃点啥</h1>
        </div>
        <label className="couple-switch">
          <HeartHandshake size={18} />
          <span>情侣模式</span>
          <input type="checkbox" checked={coupleMode} onChange={(event) => setCoupleMode(event.target.checked)} />
        </label>
      </header>

      <MoodSelector title={coupleMode ? '我' : '当前状态'} options={moodOptions} selected={selectedMoods} onChange={setSelectedMoods} />

      {coupleMode && (
        <MoodSelector title="她" options={moodOptions} selected={partnerMoods} onChange={setPartnerMoods} />
      )}

      <section className="section-block">
        <div className="section-title-row">
          <h2>预算</h2>
          <span>{priceLabels[budget]}</span>
        </div>
        <div className="segmented-grid">
          {budgetOptions.map((item) => (
            <button
              key={item}
              type="button"
              className={`segment ${budget === item ? 'is-selected' : ''}`}
              onClick={() => setBudget(item)}
            >
              {priceLabels[item]}
            </button>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-title-row">
          <h2>距离</h2>
          <span>{distanceLabels[distance]}</span>
        </div>
        <div className="segmented-grid">
          {distanceOptions.map((item) => (
            <button
              key={item}
              type="button"
              className={`segment ${distance === item ? 'is-selected' : ''}`}
              onClick={() => setDistance(item)}
            >
              {distanceLabels[item]}
            </button>
          ))}
        </div>
      </section>

      {recommendation && (
        <DecisionCard recommendation={recommendation} submittedFeedback={submittedFeedback} onFeedback={handleFeedback} />
      )}

      {!canDecide && <div className="empty-state">菜品库空了，系统现在只能推荐空气。</div>}

      <div className="sticky-action">
        <div className="decision-context">{selectedSummary.slice(0, 3).join(' / ') || '随缘局'}</div>
        <button className="primary-button primary-button--large" type="button" onClick={decide} disabled={!canDecide}>
          <Shuffle size={22} />
          帮我决定
        </button>
      </div>
    </div>
  );
}
