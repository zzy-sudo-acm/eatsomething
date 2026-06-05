import { defaultFoods } from '../data/defaultFoods';
import { DecisionHistory, FoodItem } from '../types';

const FOOD_KEY = 'mealmood.foods.v01';
const HISTORY_KEY = 'mealmood.history.v01';
const THEME_KEY = 'mealmood.theme.v01';

export type ThemeMode = 'day' | 'night';

export const loadTheme = (): ThemeMode =>
  localStorage.getItem(THEME_KEY) === 'night' ? 'night' : 'day';

export const saveTheme = (theme: ThemeMode) => {
  localStorage.setItem(THEME_KEY, theme);
};

const cloneDefaultFoods = (): FoodItem[] =>
  defaultFoods.map((food) => ({
    ...food,
    tags: [...food.tags],
  }));

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
  if (foods?.length) return foods;
  const defaults = cloneDefaultFoods();
  saveFoods(defaults);
  return defaults;
};

export const saveFoods = (foods: FoodItem[]) => {
  localStorage.setItem(FOOD_KEY, JSON.stringify(foods));
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
