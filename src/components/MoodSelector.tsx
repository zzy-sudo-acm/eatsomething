import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface MoodSelectorProps {
  title: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** High-frequency moods shown on the first screen. The rest fold into "更多状态". */
  primary?: string[];
}

export function MoodSelector({ title, options, selected, onChange, primary }: MoodSelectorProps) {
  const primaryList = primary ?? options;
  const moreList = primary ? options.filter((mood) => !primary.includes(mood)) : [];
  const hasSelectedInMore = moreList.some((mood) => selected.includes(mood));
  const [showMore, setShowMore] = useState(hasSelectedInMore);
  const open = showMore || hasSelectedInMore;

  const toggle = (mood: string) => {
    if (selected.includes(mood)) {
      onChange(selected.filter((item) => item !== mood));
      return;
    }
    onChange([...selected, mood]);
  };

  const renderChip = (mood: string) => {
    const active = selected.includes(mood);
    return (
      <button
        key={mood}
        type="button"
        className={`chip ${active ? 'is-selected' : ''}`}
        aria-pressed={active}
        onClick={() => toggle(mood)}
      >
        {mood}
      </button>
    );
  };

  return (
    <section className="section-block">
      <div className="section-title-row">
        <h2>{title}</h2>
        <span className="hint">已选 <b>{selected.length}</b></span>
      </div>
      <div className="chip-grid">{primaryList.map(renderChip)}</div>

      {moreList.length > 0 && (
        <>
          {open && <div className="chip-grid mood-more">{moreList.map(renderChip)}</div>}
          <button
            type="button"
            className={`more-toggle ${open ? 'is-open' : ''}`}
            aria-expanded={open}
            onClick={() => setShowMore((value) => !value)}
          >
            {open ? '收起' : `更多状态（${moreList.length}）`}
            <ChevronDown size={16} />
          </button>
        </>
      )}
    </section>
  );
}
