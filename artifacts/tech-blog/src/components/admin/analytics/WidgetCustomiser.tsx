import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  WIDGET_REGISTRY,
  type WidgetId,
  type WidgetVisibility,
  defaultVisibility,
} from "@/lib/analyticsWidgets";
import { RotateCcw } from "lucide-react";

export function WidgetCustomiser({
  visibility,
  onChange,
}: {
  visibility: WidgetVisibility;
  onChange: (v: WidgetVisibility) => void;
}) {
  const toggle = (id: WidgetId, checked: boolean) =>
    onChange({ ...visibility, [id]: checked });

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
          Customise widgets
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(defaultVisibility())}
          className="text-zinc-500 hover:text-white h-7 gap-1.5 text-xs"
        >
          <RotateCcw className="w-3 h-3" />
          Reset to defaults
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-2.5">
        {WIDGET_REGISTRY.map((w) => (
          <label
            key={w.id}
            className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none"
          >
            <Checkbox
              checked={visibility[w.id]}
              onCheckedChange={(c) => toggle(w.id, c === true)}
              className="border-zinc-600 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
            />
            {w.label}
          </label>
        ))}
      </div>
    </div>
  );
}
