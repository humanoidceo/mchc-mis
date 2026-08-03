export type LabPanelComponent = {
  id: number
  name: string
  display_name: string
  normal_range_from: string
  normal_range_to: string
  unit: string
}

export function LabPanelComponents({
  components,
  selectedIds,
  onChange,
}: {
  components: LabPanelComponent[]
  selectedIds: number[]
  onChange: (selectedIds: number[]) => void
}) {
  if (!components.length) return null

  return (
    <fieldset className="rounded border border-sky-100 bg-white p-3">
      <legend className="px-1 text-xs font-semibold text-sky-700">Select sub-tests</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {components.map((component) => {
          const checked = selectedIds.includes(component.id)
          return (
            <label key={component.id} className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
              <input
                className="mt-1 h-4 w-4 accent-sky-600"
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? selectedIds.filter((id) => id !== component.id) : [...selectedIds, component.id])}
              />
              <span>
                {component.display_name || component.name}
                {(component.normal_range_from || component.normal_range_to || component.unit) ? (
                  <span className="block text-xs text-zinc-500">
                    {component.normal_range_from || '-'} to {component.normal_range_to || '-'} {component.unit}
                  </span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
