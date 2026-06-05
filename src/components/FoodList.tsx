import { Edit3, Flame, Trash2 } from 'lucide-react';
import { FoodItem } from '../types';
import { foodDistanceLabels, priceLabels, stabilityLabels, typeLabels } from '../lib/options';

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
              <h3>{food.name}</h3>
              <p>
                {priceLabels[food.priceRange]} · {foodDistanceLabels[food.distance]} · {typeLabels[food.type]} · 稳定性
                {stabilityLabels[food.stability]}
              </p>
            </div>
            {food.spicy && (
              <span className="spicy-mark" title="辣">
                <Flame size={16} />
              </span>
            )}
          </div>
          <div className="food-tags">
            {food.tags.slice(0, 5).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="food-actions">
            <button type="button" onClick={() => onEdit(food)} aria-label={`编辑 ${food.name}`} title="编辑">
              <Edit3 size={18} />
            </button>
            <button type="button" onClick={() => onDelete(food.id)} aria-label={`删除 ${food.name}`} title="删除">
              <Trash2 size={18} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
