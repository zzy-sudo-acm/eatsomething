export type PriceRange = 'under10' | 'under20' | 'under50' | 'any';
export type Distance = 'near' | 'medium' | 'far' | 'delivery';
export type FoodType = 'meal' | 'snack' | 'drink' | 'happy' | 'date';
export type Stability = 'high' | 'medium' | 'low';
export type Satiety = 1 | 2 | 3 | 4 | 5;
export type MealRole = 'main' | 'lightMeal' | 'addon' | 'drink';
export type Feedback = 'worth' | 'normal' | 'regret' | 'skipped';
export type TabKey = 'decide' | 'library' | 'history' | 'settings';

/** How formal / complete this meal feels. 炒饭=1 … 火锅=5. */
export type OccasionLevel = 1 | 2 | 3 | 4 | 5;

/** What kind of meal the user wants. */
export type MealIntent = 'fullMeal' | 'lightMeal' | 'drink';

/** Auto-detected time-of-day bucket. */
export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'lateNight' | 'other';

export interface FoodItem {
  id: string;
  name: string;
  priceRange: PriceRange;
  distance: Distance;
  type: FoodType;
  estimatedPrice: number;
  satiety: Satiety;
  mealRole: MealRole;
  /** How formal/complete this food feels as a meal. 1=quick-fix, 5=banquet-grade. */
  occasionLevel: OccasionLevel;
  tags: string[];
  spicy: boolean;
  stability: Stability;
  createdAt: number;
  updatedAt: number;
}

export interface DecisionHistory {
  id: string;
  foodId: string;
  foodName: string;
  selectedMoods: string[];
  partnerMoods?: string[];
  budget: PriceRange;
  distance: Distance;
  feedback?: Feedback;
  createdAt: number;
}

export interface DecisionInput {
  selectedMoods: string[];
  partnerMoods?: string[];
  budget: PriceRange;
  distance: Distance;
  coupleMode: boolean;
  /** Explicit override for meal intent. Falls back to auto-detect from time-of-day. */
  mealIntent?: MealIntent;
}

export interface ScoredFood {
  food: FoodItem;
  score: number;
  reasons: string[];
  warnings: string[];
  hardBlocked: boolean;
  hardBlockReasons: string[];
}

export interface MealPlan {
  main: FoodItem;
  drink?: FoodItem;
  addon?: FoodItem;
  totalPrice: number;
  reasons: string[];
}

export interface DecisionCopy {
  title: string;
  verdict: string;
  verdictTone: 'good' | 'ok' | 'risky';
  reason: string;
  risk: string;
  punchline: string;
  /** Legacy: flat list of food names for the "alternatives" chip row. */
  alternatives: string[];
}

export interface Recommendation {
  /** The full meal plan (main + optional drink/addon). */
  plan: MealPlan;
  /** Alternative meal plans (up to 2). */
  alternatives: MealPlan[];
  /** Legacy compat: points to plan.main. */
  food: FoodItem;
  score: number;
  copy: DecisionCopy;
  scoredFoods: ScoredFood[];
}
