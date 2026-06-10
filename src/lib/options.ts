import { Distance, Feedback, FoodType, MealRole, PriceRange, Satiety, Stability, TabKey } from '../types';
import { moodLabel, primaryMoodIds, selectableMoodIds, toMoodId } from './moods';

// 状态选项现在是稳定 id,显示文案见 moods.ts。
export const moodOptions: string[] = [...selectableMoodIds];

// High-frequency states surfaced on the first screen of the Decide page.
export const primaryMoodOptions: string[] = [...primaryMoodIds];

// 仅菜品可用、不能作为「状态」参与推荐的关系类标签。
export const coupleFriendlyTags = ['coupleFriendly'];

export const isRelationshipMood = (mood: string) => toMoodId(mood) === 'coupleFriendly';

export const stripRelationshipMoods = (moods: string[]) => moods.filter((mood) => !isRelationshipMood(mood));

export const displayMoodLabel = (mood: string) => moodLabel(mood);

export const priceLabels: Record<PriceRange, string> = {
  under10: '10以内',
  under20: '20以内',
  under50: '50以内',
  any: '无所谓',
};

export const inferPriceRangeFromEstimatedPrice = (price: number): PriceRange => {
  if (price <= 10) return 'under10';
  if (price <= 20) return 'under20';
  if (price <= 50) return 'under50';
  return 'any';
};

export const distanceLabels: Record<Distance, string> = {
  near: '宿舍楼下',
  medium: '校门口',
  delivery: '外卖',
  far: '愿意走一走',
};

export const foodDistanceLabels: Record<Distance, string> = {
  near: '近',
  medium: '中',
  far: '远',
  delivery: '外卖',
};

export const typeLabels: Record<FoodType, string> = {
  meal: '正餐',
  snack: '小吃',
  drink: '饮料',
  happy: '快乐餐',
  date: '约会餐',
};

export const mealRoleLabels: Record<MealRole, string> = {
  main: '正餐',
  lightMeal: '轻食',
  addon: '加餐',
  drink: '饮料',
};

export const satietyLabels: Record<Satiety, string> = {
  1: '1 很轻',
  2: '2 轻一点',
  3: '3 刚好',
  4: '4 顶饱',
  5: '5 很顶',
};

export const stabilityLabels: Record<Stability, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export const feedbackLabels: Record<Feedback, string> = {
  worth: '值',
  normal: '一般',
  regret: '后悔',
  skipped: '已跳过',
};

export const tabLabels: Record<TabKey, string> = {
  decide: '决定',
  library: '菜品库',
  history: '历史',
  settings: '设置',
};

export const priceOrder: Record<PriceRange, number> = {
  under10: 10,
  under20: 20,
  under50: 50,
  any: 99,
};
