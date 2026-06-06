import { defaultFoods } from '../data/defaultFoods';
import { DecisionHistory, FoodItem, MealRole, Satiety } from '../types';
import { inferPriceRangeFromEstimatedPrice } from './options';

const FOOD_KEY = 'mealmood.foods.v01';
const HISTORY_KEY = 'mealmood.history.v01';
const THEME_KEY = 'mealmood.theme.v01';
const DEV_MODE_KEY = 'mealmood.devMode.v01';

export type ThemeMode = 'day' | 'night';

export const loadTheme = (): ThemeMode =>
  localStorage.getItem(THEME_KEY) === 'night' ? 'night' : 'day';

export const saveTheme = (theme: ThemeMode) => {
  localStorage.setItem(THEME_KEY, theme);
};

export const loadDevMode = (): boolean => localStorage.getItem(DEV_MODE_KEY) === 'on';

export const saveDevMode = (devMode: boolean) => {
  localStorage.setItem(DEV_MODE_KEY, devMode ? 'on' : 'off');
};

const cloneDefaultFoods = (): FoodItem[] =>
  defaultFoods.map((food) => ({
    ...food,
    tags: [...food.tags],
  }));

const satietyValues: Satiety[] = [1, 2, 3, 4, 5];
const mealRoleValues: MealRole[] = ['main', 'lightMeal', 'addon', 'drink'];
const lightMealNames = ['粥', '饭团', '关东煮'];

type FoodDraft = Partial<FoodItem> & Record<string, unknown>;

const isSatiety = (value: unknown): value is Satiety =>
  typeof value === 'number' && satietyValues.includes(value as Satiety);

const isMealRole = (value: unknown): value is MealRole =>
  typeof value === 'string' && mealRoleValues.includes(value as MealRole);

const inferMealRole = (food: FoodDraft): MealRole => {
  const name = typeof food.name === 'string' ? food.name : '';
  if (lightMealNames.some((keyword) => name.includes(keyword))) return 'lightMeal';
  if (food.type === 'drink') return 'drink';
  if (food.type === 'snack') return 'addon';
  return 'main';
};

const inferSatiety = (food: FoodDraft, mealRole: MealRole): Satiety => {
  if (mealRole === 'drink') return 1;
  if (mealRole === 'lightMeal' || mealRole === 'addon') return 2;
  if (food.type === 'happy' || food.type === 'date' || food.type === 'meal') return 4;
  return 3;
};

const inferEstimatedPrice = (food: FoodDraft, mealRole: MealRole) => {
  if (mealRole === 'drink') return 15;
  if (mealRole === 'addon') return food.priceRange === 'under20' ? 15 : 10;
  if (mealRole === 'lightMeal') return food.priceRange === 'under10' ? 8 : 15;
  if (food.priceRange === 'under50') return 30;
  if (food.priceRange === 'under10') return 8;
  return 16;
};

export const normalizeFood = (food: FoodItem): FoodItem => {
  const draft = food as FoodDraft;
  const mealRole = isMealRole(draft.mealRole) ? draft.mealRole : inferMealRole(draft);
  const estimatedPrice =
    typeof draft.estimatedPrice === 'number' && Number.isFinite(draft.estimatedPrice) && draft.estimatedPrice > 0
      ? Math.round(draft.estimatedPrice)
      : inferEstimatedPrice(draft, mealRole);

  return {
    ...food,
    priceRange: inferPriceRangeFromEstimatedPrice(estimatedPrice),
    estimatedPrice,
    satiety: isSatiety(draft.satiety) ? draft.satiety : inferSatiety(draft, mealRole),
    mealRole,
    tags: Array.isArray(draft.tags) ? draft.tags.filter((tag): tag is string => typeof tag === 'string') : [],
  };
};

const normalizeFoods = (foods: FoodItem[]) => foods.map(normalizeFood);

const safeParse = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const loadFoods = (): FoodItem[] => {
  const foods = safeParse<FoodItem[] | null>(localStorage.getItem(FOOD_KEY), null);
  if (foods?.length) {
    const normalized = normalizeFoods(foods);
    if (JSON.stringify(normalized) !== JSON.stringify(foods)) saveFoods(normalized);
    return normalized;
  }
  const defaults = cloneDefaultFoods();
  saveFoods(defaults);
  return defaults;
};

export const saveFoods = (foods: FoodItem[]) => {
  localStorage.setItem(FOOD_KEY, JSON.stringify(normalizeFoods(foods)));
};

export const resetFoods = (): FoodItem[] => {
  const defaults = cloneDefaultFoods();
  saveFoods(defaults);
  return defaults;
};

export const loadHistory = (): DecisionHistory[] =>
  safeParse<DecisionHistory[]>(localStorage.getItem(HISTORY_KEY), []);

export const saveHistory = (history: DecisionHistory[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
};

export const addHistory = (entry: DecisionHistory): DecisionHistory[] => {
  const next = [entry, ...loadHistory()].slice(0, 100);
  saveHistory(next);
  return next;
};

export const clearHistory = () => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([]));
};

export const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
