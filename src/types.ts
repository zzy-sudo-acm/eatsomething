export type PriceRange = 'under10' | 'under20' | 'under50' | 'any';
export type Distance = 'near' | 'medium' | 'far' | 'delivery';
export type FoodType = 'meal' | 'snack' | 'drink' | 'happy' | 'date';
export type Stability = 'high' | 'medium' | 'low';
export type Satiety = 1 | 2 | 3 | 4 | 5;
export type MealRole = 'main' | 'lightMeal' | 'addon' | 'drink';
export type Feedback = 'worth' | 'normal' | 'regret';
export type TabKey = 'decide' | 'library' | 'history' | 'settings';

export interface FoodItem {
  id: string;
  name: string;
  priceRange: PriceRange;
  distance: Distance;
  type: FoodType;
  estimatedPrice: number;
  satiety: Satiety;
  mealRole: MealRole;
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
}

export interface ScoredFood {
  food: FoodItem;
  score: number;
  reasons: string[];
  warnings: string[];
  hardBlocked: boolean;
  hardBlockReasons: string[];
}

export interface DecisionCopy {
  title: string;
  verdict: string;
  verdictTone: 'good' | 'ok' | 'risky';
  reason: string;
  risk: string;
  punchline: string;
  alternatives: string[];
}

export interface Recommendation {
  food: FoodItem;
  score: number;
  copy: DecisionCopy;
  scoredFoods: ScoredFood[];
}
