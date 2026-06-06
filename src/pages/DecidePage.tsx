import { useMemo, useRef, useState } from 'react';
import { HeartHandshake, RefreshCw, Sparkles } from 'lucide-react';
import { DecisionCard } from '../components/DecisionCard';
import { MoodSelector } from '../components/MoodSelector';
import { distanceLabels, moodOptions, primaryMoodOptions, priceLabels, stripRelationshipMoods } from '../lib/options';
import { makeId } from '../lib/storage';
import { recommendFood } from '../lib/recommend';
import { DecisionHistory, Distance, Feedback, FoodItem, PriceRange, Recommendation } from '../types';

interface DecidePageProps {
  foods: FoodItem[];
  history: DecisionHistory[];
  devMode: boolean;
  onAddHistory: (entry: DecisionHistory) => void;
}

const budgetOptions: PriceRange[] = ['under10', 'under20', 'under50', 'any'];
const distanceOptions: Distance[] = ['near', 'medium', 'delivery', 'far'];

const loadingLines = [
  '正在让胃开会…',
  '正在甩锅给系统…',
  '正在计算今天怎么少后悔…',
  '胃部意见合并中…',
];

const rejudgeLines = ['换一个', '不服，再判一次', '再给我一个答案'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function DecidePage({ foods, history, devMode, onAddHistory }: DecidePageProps) {
  const [selectedMoods, setSelectedMoods] = useState<string[]>(['不知道想吃啥']);
  const [partnerMoods, setPartnerMoods] = useState<string[]>([]);
  const [budget, setBudget] = useState<PriceRange>('under20');
  const [distance, setDistance] = useState<Distance>('near');
  const [coupleMode, setCoupleMode] = useState(false);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [submittedFeedback, setSubmittedFeedback] = useState<Feedback | undefined>();
  const [isDeciding, setIsDeciding] = useState(false);
  const [loadingLine, setLoadingLine] = useState(loadingLines[0]);
  const [rejudgeLabel, setRejudgeLabel] = useState(rejudgeLines[0]);
  const timerRef = useRef<number | undefined>(undefined);

  const canDecide = foods.length > 0;
  const cleanSelectedMoods = useMemo(() => stripRelationshipMoods(selectedMoods), [selectedMoods]);
  const cleanPartnerMoods = useMemo(() => stripRelationshipMoods(partnerMoods), [partnerMoods]);
  const selectedSummary = useMemo(
    () => [...cleanSelectedMoods, ...(coupleMode ? cleanPartnerMoods : [])],
    [cleanPartnerMoods, cleanSelectedMoods, coupleMode]
  );

  const toggleCouple = () => {
    setSelectedMoods(stripRelationshipMoods);
    setPartnerMoods(stripRelationshipMoods);
    setCoupleMode((prev) => !prev);
  };

  const createSkipEntry = (): DecisionHistory | undefined => {
    if (!recommendation || submittedFeedback) return undefined;

    return {
      id: makeId('history'),
      foodId: recommendation.food.id,
      foodName: recommendation.food.name,
      selectedMoods: cleanSelectedMoods,
      partnerMoods: coupleMode ? cleanPartnerMoods : undefined,
      budget,
      distance,
      feedback: 'skipped',
      createdAt: Date.now(),
    };
  };

  const runRecommendation = (sourceHistory = history) => {
    const next = recommendFood(foods, sourceHistory, {
      selectedMoods: cleanSelectedMoods,
      partnerMoods: coupleMode ? cleanPartnerMoods : undefined,
      budget,
      distance,
      coupleMode,
    });
    setRecommendation(next);
    setSubmittedFeedback(undefined);
    setRejudgeLabel(rejudgeLines[Math.floor(Math.random() * rejudgeLines.length)]);
    setIsDeciding(false);
  };

  const decide = () => {
    if (!canDecide || isDeciding) return;
    window.clearTimeout(timerRef.current);

    const skippedEntry = createSkipEntry();
    const nextHistory = skippedEntry ? [skippedEntry, ...history].slice(0, 100) : history;
    if (skippedEntry) onAddHistory(skippedEntry);

    if (prefersReducedMotion()) {
      runRecommendation(nextHistory);
      return;
    }

    setLoadingLine(loadingLines[Math.floor(Math.random() * loadingLines.length)]);
    setIsDeciding(true);
    const delay = 400 + Math.floor(Math.random() * 400);
    timerRef.current = window.setTimeout(() => runRecommendation(nextHistory), delay);
  };

  const handleFeedback = (feedback: Feedback) => {
    if (!recommendation || submittedFeedback) return;
    setSubmittedFeedback(feedback);
    onAddHistory({
      id: makeId('history'),
      foodId: recommendation.food.id,
      foodName: recommendation.food.name,
      selectedMoods: cleanSelectedMoods,
      partnerMoods: coupleMode ? cleanPartnerMoods : undefined,
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
          <p className="eyebrow">今天吃点啥</p>
          <h1>别纠结，交给饭搭子</h1>
        </div>
        <button
          type="button"
          className={`couple-switch ${coupleMode ? 'is-on' : ''}`}
          role="switch"
          aria-checked={coupleMode}
          aria-label="情侣模式"
          onClick={toggleCouple}
        >
          <HeartHandshake size={17} />
          <span>情侣模式</span>
          <span className="switch-track" aria-hidden="true" />
          <input type="checkbox" checked={coupleMode} readOnly tabIndex={-1} />
        </button>
      </header>

      <MoodSelector
        title={coupleMode ? '你现在' : '现在的状态'}
        options={moodOptions}
        primary={primaryMoodOptions}
        selected={cleanSelectedMoods}
        onChange={setSelectedMoods}
      />

      {coupleMode && (
        <MoodSelector
          title="对方现在"
          options={moodOptions}
          primary={primaryMoodOptions}
          selected={cleanPartnerMoods}
          onChange={setPartnerMoods}
        />
      )}

      <section className="section-block section-block--light">
        <div className="section-title-row">
          <h2>预算</h2>
          <span className="hint">{priceLabels[budget]}</span>
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

      <section className="section-block section-block--light">
        <div className="section-title-row">
          <h2>距离</h2>
          <span className="hint">{distanceLabels[distance]}</span>
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

      {recommendation && !isDeciding && (
        <DecisionCard
          recommendation={recommendation}
          submittedFeedback={submittedFeedback}
          devMode={devMode}
          onFeedback={handleFeedback}
        />
      )}

      {!canDecide && (
        <div className="empty-state">
          <span className="empty-emoji">🍽️</span>
          菜品库空了，系统现在只能给你推荐空气。先去「菜品库」加两道吧。
        </div>
      )}

      <div className="sticky-action">
        <div className="decision-context">{selectedSummary.slice(0, 3).join(' · ') || '随缘局，全凭手感'}</div>
        {recommendation ? (
          <button
            className={`primary-button primary-button--large primary-button--rejudge ${isDeciding ? 'is-busy' : ''}`}
            type="button"
            onClick={decide}
            disabled={!canDecide}
          >
            <RefreshCw size={20} className={isDeciding ? 'spin' : ''} />
            {isDeciding ? loadingLine : rejudgeLabel}
          </button>
        ) : (
          <button
            className={`primary-button primary-button--large ${isDeciding ? 'is-busy' : ''}`}
            type="button"
            onClick={decide}
            disabled={!canDecide}
          >
            <Sparkles size={22} />
            {isDeciding ? loadingLine : '帮我决定'}
          </button>
        )}
      </div>
    </div>
  );
}
