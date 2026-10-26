import { useId } from 'react';

interface Option<T> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number | boolean> {
  label: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (value: T) => void;
}

export function Segmented<T extends string | number | boolean>({ label, value, options, onChange }: SegmentedProps<T>) {
  const name = useId();
  return (
    <fieldset className="choice-field">
      <legend>{label}</legend>
      <div className="choice">
        {options.map((o) => (
          <label key={String(o.value)}>
            <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
