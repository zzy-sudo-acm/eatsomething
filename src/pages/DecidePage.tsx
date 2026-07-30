import { useEffect, useMemo, useRef, useState } from 'react';
import { HeartHandshake, RefreshCw, Sparkles } from 'lucide-react';
import { DecisionCard } from '../components/DecisionCard';
import { MoodSelector } from '../components/MoodSelector';
import { distanceLabels, moodOptions, primaryMoodOptions, priceLabels, stripRelationshipMoods } from '../lib/options';
import { makeId } from '../lib/storage';
import { moodLabel } from '../lib/moods';
import { recommendFood } from '../lib/recommend';
import { DecisionHistory, DecisionInput, Distance, Feedback, FoodItem, MealIntent, PriceRange, Recommendation } from '../types';

interface DecidePageProps {
  foods: FoodItem[];
  history: DecisionHistory[];
  devMode: boolean;
  onAddHistory: (entry: DecisionHistory) => void;
}

const budgetOptions: PriceRange[] = ['under10', 'under20', 'under50', 'any'];
const distanceOptions: Distance[] = ['near', 'medium', 'delivery', 'far'];
const mealIntentOptions: { value: MealIntent; label: string }[] = [
  { value: 'fullMeal', label: '正经吃一顿' },
  { value: 'lightMeal', label: '随便垫一下' },
  { value: 'drink', label: '只想喝点' },
];

const loadingLines = [
  '正在让胃开会…',
  '正在甩锅给系统…',
  '正在计算今天怎么少后悔…',
  '胃部意见合并中…',
  '正在排除你绝对不会吃的…',
  '正在和你的钱包谈判…',
  '系统扫描胃部状态中…',
  '正在传唤候选菜品到庭…',
  '正在核对你的踩雷前科…',
  '证据不足的菜已当庭释放…',
];

const rejudgeLines = ['换一个', '不服，再判一次', '再给我一个答案', '这个不行，下一位', '再抽一次'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const buzz = (ms: number) => {
  if (prefersReducedMotion()) return;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(ms);
  }
};

export function DecidePage({ foods, history, devMode, onAddHistory }: DecidePageProps) {
  const [selectedMoods, setSelectedMoods] = useState<string[]>(['noIdea']);
  const [partnerMoods, setPartnerMoods] = useState<string[]>([]);
  const [budget, setBudget] = useState<PriceRange>('under20');
  const [distance, setDistance] = useState<Distance>('near');
  const [coupleMode, setCoupleMode] = useState(false);
  const [mealIntent, setMealIntent] = useState<MealIntent>('fullMeal');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [lastDecisionInput, setLastDecisionInput] = useState<DecisionInput | null>(null);
  const [submittedFeedback, setSubmittedFeedback] = useState<Feedback | undefined>();
  const [pickedNoRating, setPickedNoRating] = useState(false);
  const [isDeciding, setIsDeciding] = useState(false);
  const [loadingLine, setLoadingLine] = useState(loadingLines[0]);
  const [rejudgeLabel, setRejudgeLabel] = useState(rejudgeLines[0]);
  const [flashName, setFlashName] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const flashRef = useRef<number | undefined>(undefined);
  const decisionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearInterval(flashRef.current);
    };
  }, []);

  const canDecide = foods.length > 0;
  const isNoMatch = recommendation?.status === 'noMatch';
  const isLogged = Boolean(submittedFeedback) || pickedNoRating;
  const cleanSelectedMoods = useMemo(() => stripRelationshipMoods(selectedMoods), [selectedMoods]);
  const cleanPartnerMoods = useMemo(() => stripRelationshipMoods(partnerMoods), [partnerMoods]);
  const selectedSummary = useMemo(
    () => [...cleanSelectedMoods, ...(coupleMode ? cleanPartnerMoods : [])],
    [cleanPartnerMoods, cleanSelectedMoods, coupleMode]
  );

  // The input that actually produced the recommendation currently on screen.
  // History / feedback / skipped must use THIS, not the live controls the user
  // may have changed after the recommendation was generated.
  const activeInput: DecisionInput =
    lastDecisionInput ?? {
      selectedMoods: cleanSelectedMoods,
      partnerMoods: coupleMode ? cleanPartnerMoods : undefined,
      budget,
      distance,
      coupleMode,
    };

  useEffect(() => {
    if (recommendation && !isDeciding && decisionRef.current) {
      decisionRef.current.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  }, [recommendation, isDeciding]);

  const toggleCouple = () => {
    setSelectedMoods(stripRelationshipMoods);
    setPartnerMoods(stripRelationshipMoods);
    setCoupleMode((prev) => !prev);
  };

  const createSkipEntry = (): DecisionHistory | undefined => {
    if (!recommendation || isLogged || isNoMatch || !recommendation.plan) return undefined;

    return {
      id: makeId('history'),
      foodId: recommendation.plan.main.id,
      foodName: recommendation.plan.main.name,
      selectedMoods: activeInput.selectedMoods,
      partnerMoods: activeInput.partnerMoods,
      budget: activeInput.budget,
      distance: activeInput.distance,
      feedback: 'skipped',
      createdAt: Date.now(),
      drinkId: recommendation.plan.drink?.id,
      drinkName: recommendation.plan.drink?.name,
      addonId: recommendation.plan.addon?.id,
      addonName: recommendation.plan.addon?.name,
      totalPrice: recommendation.plan.totalPrice,
    };
  };

  const runRecommendation = (sourceHistory = history) => {
    const inputSnapshot: DecisionInput = {
      selectedMoods: cleanSelectedMoods,
      partnerMoods: coupleMode ? cleanPartnerMoods : undefined,
      budget,
      distance,
      coupleMode,
      mealIntent,
    };

    setLastDecisionInput(inputSnapshot);

    window.clearInterval(flashRef.current);
    setFlashName(null);
    const next = recommendFood(foods, sourceHistory, inputSnapshot);
    setRecommendation(next);
    setSubmittedFeedback(undefined);
    setPickedNoRating(false);
    setRejudgeLabel(rejudgeLines[Math.floor(Math.random() * rejudgeLines.length)]);
    setIsDeciding(false);
    buzz(18);
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

    // 候选菜名快速闪动:老虎机式过堂。
    window.clearInterval(flashRef.current);
    if (foods.length > 1) {
      setFlashName(foods[Math.floor(Math.random() * foods.length)].name);
      flashRef.current = window.setInterval(() => {
        setFlashName(foods[Math.floor(Math.random() * foods.length)].name);
      }, 90);
    }

    const delay = 700 + Math.floor(Math.random() * 500);
    timerRef.current = window.setTimeout(() => runRecommendation(nextHistory), delay);
  };

  const baseEntry = (): DecisionHistory => {
    const plan = recommendation!.plan!;
    return {
      id: makeId('history'),
      foodId: plan.main.id,
      foodName: plan.main.name,
      selectedMoods: activeInput.selectedMoods,
      partnerMoods: activeInput.partnerMoods,
      budget: activeInput.budget,
      distance: activeInput.distance,
      createdAt: Date.now(),
      drinkId: plan.drink?.id,
      drinkName: plan.drink?.name,
      addonId: plan.addon?.id,
      addonName: plan.addon?.name,
      totalPrice: plan.totalPrice,
    };
  };

  const handleFeedback = (feedback: Feedback) => {
    if (!recommendation || isLogged || isNoMatch) return;
    setSubmittedFeedback(feedback);
    buzz(12);
    onAddHistory({ ...baseEntry(), feedback });
  };

  const handlePick = () => {
    if (!recommendation || isLogged || isNoMatch) return;
    setPickedNoRating(true);
    buzz(12);
    onAddHistory({ ...baseEntry(), feedback: undefined });
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
          <h2>这顿怎么吃</h2>
        </div>
        <div className="segmented-grid">
          {mealIntentOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`segment ${mealIntent === item.value ? 'is-selected' : ''}`}
              onClick={() => setMealIntent(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

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

      {isDeciding && (
        <div ref={decisionRef}>
          <div className="decision-loading-card" role="status" aria-live="polite" aria-busy="true">
            <div className="decision-card__topline">
              <span>今日胃部判决单</span>
              <span className="verdict-pill tone-ok">判决中</span>
            </div>
            <div className="decision-loading-card__title">
              <RefreshCw size={18} className="spin" />
              <span>{loadingLine}</span>
            </div>
            {flashName && <div className="loading-flash-name">{flashName}</div>}
            <div className="decision-loading-card__lines" aria-hidden="true">
              <span className="loading-line loading-line--wide" />
              <span className="loading-line loading-line--mid" />
              <span className="loading-line loading-line--short" />
            </div>
          </div>
        </div>
      )}

      {recommendation && !isDeciding && (
        <div ref={decisionRef}>
          <DecisionCard
            recommendation={recommendation}
            submittedFeedback={submittedFeedback}
            picked={pickedNoRating}
            devMode={devMode}
            onFeedback={handleFeedback}
            onPick={handlePick}
          />
        </div>
      )}

      {!canDecide && (
        <div className="empty-state">
          <span className="empty-emoji">🍽️</span>
          菜品库空了，系统现在只能给你推荐空气。先去「菜品库」加两道吧。
        </div>
      )}

      <div className="sticky-action">
        <div className="decision-context">
          {selectedSummary.slice(0, 3).map(moodLabel).join(' · ') || '随缘局，全凭手感'}
        </div>
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
            {isDeciding ? <RefreshCw size={22} className="spin" /> : <Sparkles size={22} />}
            {isDeciding ? loadingLine : '帮我决定'}
          </button>
        )}
      </div>
    </div>
  );
}
