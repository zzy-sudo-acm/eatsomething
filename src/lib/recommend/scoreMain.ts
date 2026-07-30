import {
  DecisionHistory,
  DecisionInput,
  FoodItem,
  MealIntent,
  MealPeriod,
  PriceRange,
  ScoredFood,
} from '../../types';
import { distanceLabels, priceLabels, stabilityLabels } from '../options';
import { moodLabel } from '../moods';
import { coupleFriendlyTags, isRelationshipMood } from '../options';
import { feedbackScore, recentPenalty, regretStreak, skipPenalty } from './feedback';
import { getHardBlockReasons, hasDrinkMood, isEligibleAsMain } from './eligibility';
import { getBudgetLimit, wantsUpscale } from './normalizeInput';

const isCoupleFriendlyFood = (food: FoodItem) =>
  food.tags.some((tag) => coupleFriendlyTags.includes(tag));

// ---- budget scoring (main food) ----
// Budget is now primarily a HARD cap — foods over budget are hardBlocked.
// This score applies only to foods within budget.

const budgetScoreForMain = (selected: PriceRange, food: FoodItem, moods: string[]): number => {
  if (selected === 'any') return 0;

  const saving = moods.includes('saveMoney');
  const price = food.estimatedPrice;

  if (selected === 'under10') {
    if (price <= 10) return saving ? 25 : 20;
    return -50; // should not reach here (hardBlocked), kept as safety
  }

  if (selected === 'under20') {
    if (price <= 20) return saving ? 20 : 16;
    return -50;
  }

  // under50
  if (price <= 50) {
    if (saving && price <= 20) return 16;
    return 8;
  }
  return -50;
};

// ---- distance scoring ----

const distanceScore = (selected: DecisionInput['distance'], food: FoodItem): number => {
  if (selected === food.distance) return selected === 'delivery' ? 10 : 8;
  const matrix: Record<DecisionInput['distance'], Partial<Record<FoodItem['distance'], number>>> = {
    near: { medium: 1, delivery: 2, far: -8 },
    medium: { near: 6, far: 1, delivery: 2 },
    delivery: { near: 3, medium: 1, far: -3 },
    far: { near: 4, medium: 5, delivery: 2 },
  };
  return matrix[selected][food.distance] ?? 0;
};

// ---- stability ----

const stabilityScore = (food: FoodItem): number => {
  if (food.stability === 'high') return 8;
  if (food.stability === 'medium') return 4;
  return 0;
};

// ---- main scoring ----

export const scoreMainFood = (
  food: FoodItem,
  input: DecisionInput,
  moods: string[],
  period: MealPeriod,
  intent: MealIntent,
  history: DecisionHistory[],
  now: number,
  hasDrinkInCatalog: boolean = true
): ScoredFood => {
  let score = 10;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const budgetLimit = getBudgetLimit(input.budget);

  // --- Mood matching ---
  const matchedMoods = moods.filter((mood) => food.tags.includes(mood));
  if (matchedMoods.length) {
    score += matchedMoods.length * 8;
    reasons.push(`匹配 ${matchedMoods.map(moodLabel).join('、')}`);
  }

  // --- Budget ---
  const budget = budgetScoreForMain(input.budget, food, moods);
  score += budget;
  if (budget > 0) reasons.push(`消费档位 ${priceLabels[input.budget]}`);
  if (budget < 0) {
    warnings.push(
      food.estimatedPrice > 50 && input.budget === 'under50'
        ? '超出预算上限'
        : '预算档位不太合适'
    );
  }

  // --- Distance ---
  const dist = distanceScore(input.distance, food);
  score += dist;
  if (dist > 0) reasons.push(`距离 ${distanceLabels[input.distance]}`);
  else if (dist < -4) warnings.push('距离不太顺手');

  // --- Stability ---
  const stable = stabilityScore(food);
  score += stable;
  if (food.stability === 'high') reasons.push('稳定性高');

  // --- Spicy ---
  if (moods.includes('noSpicy') && food.spicy) {
    score -= 24;
    warnings.push('你说不想吃辣');
  }

  // --- noRisk / low stability ---
  if (moods.includes('noRisk') && food.stability === 'low') {
    score -= 15;
    warnings.push('稳定性低');
  }

  // --- Starving ---
  if (moods.includes('starving')) {
    if (food.mealRole === 'main' && food.satiety >= 4) {
      score += 30;
      reasons.push('顶饱正餐');
    } else if (food.mealRole === 'main' && food.satiety === 3) {
      score += 8;
      reasons.push('至少能当正餐');
    }
    if (food.satiety <= 2) {
      score -= 18;
      warnings.push('饿疯了不够顶');
    }
    if (food.stability === 'high') {
      score += 5;
      reasons.push('饿的时候先吃稳的');
    }
  }

  // --- Reward / afterExam ---
  if (moods.includes('reward')) {
    if (food.type === 'happy' || food.type === 'date') {
      score += 16;
      reasons.push('奖励感更足');
    }
    if (food.occasionLevel >= 3) {
      score += 14;
      reasons.push('今天值得吃好点');
    }
    if (food.estimatedPrice < 15) {
      score -= 10;
      warnings.push('太省不够奖励');
    }
  }

  if (moods.includes('afterExam')) {
    if (food.occasionLevel >= 3) {
      score += 12;
      reasons.push('考完了怎么也得像样吃一顿');
    }
    if (food.type === 'happy' || food.type === 'date') {
      score += 10;
      reasons.push('考后庆祝');
    }
  }

  // --- Couple mode ---
  if (input.coupleMode) {
    if (isCoupleFriendlyFood(food)) {
      score += 8;
      reasons.push('适合两个人');
    }
    if (food.type === 'date') {
      score += 12;
      reasons.push('约会餐');
    }
    if (food.type === 'happy') {
      score += 8;
      reasons.push('共享快乐餐');
    }
  }

  // --- noIdea ---
  if (moods.includes('noIdea')) {
    if (food.mealRole === 'main' && food.stability === 'high') {
      score += 10;
      reasons.push('不知道时选高稳定正餐');
    } else if (food.mealRole === 'main') {
      score += 6;
      reasons.push('不知道时先按正餐来');
    }
    if (food.stability === 'low') {
      score -= 12;
      warnings.push('不知道时不适合冒险');
    }
  }

  // --- eatLight (as a mood, even when intent is fullMeal) ---
  if (moods.includes('eatLight')) {
    if (food.mealRole === 'lightMeal') {
      score += 12;
      reasons.push('吃轻一点更合适');
    }
    if (food.satiety >= 4) {
      score -= 8;
      warnings.push('可能太顶饱');
    }
    if (!food.spicy) score += 4;
    if (food.stability === 'high') score += 5;
    if (food.distance === 'near') score += 5;
  }

  // --- lazy / noQueue — fast food bias ---
  if (moods.includes('lazy')) {
    if (food.tags.includes('lazy') || food.distance === 'delivery') {
      score += 6;
      reasons.push('懒人友好');
    }
  }
  if (moods.includes('noQueue')) {
    if (food.tags.includes('noQueue')) {
      score += 8;
      reasons.push('不用排队');
    }
  }

  // --- Occasion level upscale ---
  const upscale = wantsUpscale(moods, period, input.coupleMode);
  if (upscale && input.budget !== 'under10') {
    if (food.occasionLevel >= 4) {
      score += 12;
      reasons.push('场景适合吃好一点');
    } else if (food.occasionLevel >= 3) {
      score += 6;
      reasons.push('这顿可以像样点');
    }
    if (food.occasionLevel <= 1 && food.mealRole === 'main') {
      score -= 5;
      warnings.push('这场景可能太随便了');
    }
  }

  // --- Dinner + fullMeal: prefer proper meals ---
  if (period === 'dinner' && intent === 'fullMeal') {
    if (food.occasionLevel >= 3) {
      score += 4;
    }
  }

  // --- History feedback ---
  const recent = recentPenalty(history, food.id, now);
  score += recent;
  if (recent < 0) warnings.push('最近吃过');

  const feedback = feedbackScore(history, food.id, now);
  score += feedback;
  if (feedback >= 8) reasons.push('历史口碑很稳');
  else if (feedback > 0) reasons.push('历史反馈不错');
  if (feedback < 0) warnings.push('历史后悔偏多');

  if (feedback >= 8 && (moods.includes('noRisk') || moods.includes('noIdea'))) {
    score += 6;
    reasons.push('拿不准时先吃口碑');
  }

  const streak = regretStreak(history, food.id);
  if (streak >= 2) {
    score -= 15;
    warnings.push('连着后悔两次，先让它冷静一下');
  }

  const skipped = skipPenalty(history, food.id, now);
  score += skipped;
  if (skipped < 0) warnings.push('刚刚跳过');

  // --- Couple + multi-mood match ---
  if (input.coupleMode && matchedMoods.length >= 2) {
    score += 4;
    reasons.push('适合折中');
  }

  // --- Hard block (includes budget hard cap now) ---
  const eligibility = isEligibleAsMain(food, intent, input, moods, budgetLimit, hasDrinkInCatalog);
  const hardBlockReasons = eligibility.eligible
    ? getHardBlockReasons(food, input, moods, intent, budgetLimit)
    : [...getHardBlockReasons(food, input, moods, intent, budgetLimit), eligibility.reason ?? '不符合主食条件'];

  if (hardBlockReasons.length) warnings.push(...hardBlockReasons);

  return {
    food,
    score,
    reasons,
    warnings,
    hardBlocked: !eligibility.eligible || hardBlockReasons.length > 0,
    hardBlockReasons,
  };
};
