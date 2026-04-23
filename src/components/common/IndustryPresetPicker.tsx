import React from 'react'
import { INDUSTRY_TEMPLATE_PRESETS, IndustryPresetId } from '@/types/resume'

interface IndustryPresetPickerProps {
    onApply: (presetId: IndustryPresetId) => void
}

const IndustryPresetPicker: React.FC<IndustryPresetPickerProps> = ({ onApply }) => {
    return (
        <div className="space-y-2">
            {/* <label className="block text-[13px] font-medium text-gray-700">行业模板</label> */}
            <div className="grid grid-cols-1 gap-2">
                {INDUSTRY_TEMPLATE_PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        type="button"
                        onClick={() => onApply(preset.id)}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left transition-all duration-150 hover:border-primary/50 hover:bg-primary/5"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-gray-800">{preset.name}</p>
                                <p className="mt-0.5 truncate text-[11px] text-gray-500">{preset.description}</p>
                            </div>
                            <span
                                className="h-3 w-3 shrink-0 rounded-full border border-white shadow"
                                style={{ backgroundColor: preset.themeColor }}
                                aria-hidden
                            />
                        </div>
                    </button>
                ))}
            </div>
        </div>
    )
}

export default IndustryPresetPicker
