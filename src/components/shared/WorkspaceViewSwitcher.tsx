import { Select } from '../ui/Input';
import type { AreaDef } from '../../lib/workspaceHierarchy';

interface Props<View extends string> {
  id: string;
  label: string;
  areas: readonly AreaDef[];
  value: View;
  onChange: (view: View) => void;
}

export function WorkspaceViewSwitcher<View extends string>({ id, label, areas, value, onChange }: Props<View>) {
  return (
    <section id={id} data-tour-actions className="rounded-xl border border-border bg-surface px-3 py-2" aria-label={label}>
      <Select label={label} id={`${id}-view`} value={value} onChange={event => onChange(event.target.value as View)} className="sm:max-w-md">
        {areas.map(area => <optgroup key={area.id} label={area.title}>
          {area.views.map(view => <option key={view.id} value={view.id}>{view.label}</option>)}
        </optgroup>)}
      </Select>
    </section>
  );
}
