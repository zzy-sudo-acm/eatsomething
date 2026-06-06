import { Pencil, Flame, Trash2 } from 'lucide-react';
import { FoodItem } from '../types';
import { displayMoodLabel, foodDistanceLabels, mealRoleLabels, stabilityLabels } from '../lib/options';

interface FoodListProps {
  foods: FoodItem[];
  onEdit: (food: FoodItem) => void;
  onDelete: (foodId: string) => void;
}

export function FoodList({ foods, onEdit, onDelete }: FoodListProps) {
  return (
    <div className="food-list">
      {foods.map((food) => (
        <article className="food-item" key={food.id}>
          <div className="food-item__main">
            <div>
              <div className="food-item__head">
                <h3>{food.name}</h3>
                {food.spicy && (
                  <span className="spicy-mark" title="辣" aria-label="辣">
                    <Flame size={13} />
                  </span>
                )}
              </div>
              <p>
                约 {food.estimatedPrice} 元 · {mealRoleLabels[food.mealRole]} · 饱腹 {food.satiety}/5 ·{' '}
                {foodDistanceLabels[food.distance]} · 稳定{stabilityLabels[food.stability]}
              </p>
            </div>
            <div className="food-item__actions">
              <button type="button" className="icon-button" onClick={() => onEdit(food)} aria-label={`编辑 ${food.name}`} title="编辑">
                <Pencil size={16} />
              </button>
              <button
                type="button"
                className="icon-button danger"
                onClick={() => onDelete(food.id)}
                aria-label={`删除 ${food.name}`}
                title="删除"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          {food.tags.length > 0 && (
            <div className="food-tags">
              {food.tags.slice(0, 5).map((tag) => (
                <span key={tag}>{displayMoodLabel(tag)}</span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
