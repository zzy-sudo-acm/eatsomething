interface MoodSelectorProps {
  title: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

export function MoodSelector({ title, options, selected, onChange }: MoodSelectorProps) {
  const toggle = (mood: string) => {
    if (selected.includes(mood)) {
      onChange(selected.filter((item) => item !== mood));
      return;
    }
    onChange([...selected, mood]);
  };

  return (
    <section className="section-block">
      <div className="section-title-row">
        <h2>{title}</h2>
        <span>{selected.length}</span>
      </div>
      <div className="chip-grid">
        {options.map((mood) => {
          const active = selected.includes(mood);
          return (
            <button
              key={mood}
              type="button"
              className={`chip ${active ? 'is-selected' : ''}`}
              onClick={() => toggle(mood)}
            >
              {mood}
            </button>
          );
        })}
      </div>
    </section>
  );
}
