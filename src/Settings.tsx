import { ChangeEvent } from 'react';

export interface AppSettings {
  alwaysOnTop: boolean;
  globalScale: number;
  windowOpacity: number;
  customSites: string;
  enableSounds: boolean;
}

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
}

export default function Settings({ settings, onSettingsChange }: SettingsProps) {
  const handleChange = (key: keyof AppSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-6">
      <h2 className="text-sm font-semibold text-[#f0b419] uppercase tracking-wider mb-4 border-b border-[#f0b419]/30 pb-2">
        Window Controls
      </h2>

      <div className="space-y-4">
        <label className="flex items-center justify-between cursor-pointer group">
          <span className="text-xs font-medium text-gray-300 uppercase tracking-wider group-hover:text-[#f0b419] transition-colors">
            Always on Top
          </span>
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={settings.alwaysOnTop}
              onChange={(e) => handleChange('alwaysOnTop', e.target.checked)}
            />
            <div className={`block w-10 h-6 rounded-full transition-colors ${settings.alwaysOnTop ? 'bg-[#f0b419]' : 'bg-gray-800'}`}></div>
            <div className={`absolute left-1 top-1 bg-[#0a0a0a] w-4 h-4 rounded-full transition-transform ${settings.alwaysOnTop ? 'transform translate-x-4' : ''}`}></div>
          </div>
        </label>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-xs font-medium text-gray-300 uppercase tracking-wider">
              Global Scale
            </label>
            <span className="text-xs text-[#f0b419]">{settings.globalScale.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.05"
            value={settings.globalScale}
            onChange={(e) => handleChange('globalScale', parseFloat(e.target.value))}
            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#f0b419]"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-xs font-medium text-gray-300 uppercase tracking-wider">
              Window Opacity
            </label>
            <span className="text-xs text-[#f0b419]">{Math.round(settings.windowOpacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.25"
            max="1.0"
            step="0.05"
            value={settings.windowOpacity}
            onChange={(e) => handleChange('windowOpacity', parseFloat(e.target.value))}
            className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#f0b419]"
          />
        </div>
      </div>

      <h2 className="text-sm font-semibold text-[#f0b419] uppercase tracking-wider mt-8 mb-4 border-b border-[#f0b419]/30 pb-2">
        Custom Site List
      </h2>
      <div className="space-y-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wide">
          Comma-separated list of anomaly sites
        </p>
        <textarea
          value={settings.customSites}
          onChange={(e) => handleChange('customSites', e.target.value)}
          className="w-full h-24 bg-[#141414] border border-[#f0b419]/50 text-white p-2 rounded text-xs focus:outline-none focus:border-[#f0b419] focus:ring-1 focus:ring-[#f0b419] resize-none"
          placeholder="Haven, Sanctum, Forsaken Hub..."
        />
      </div>

      <h2 className="text-sm font-semibold text-[#f0b419] uppercase tracking-wider mt-8 mb-4 border-b border-[#f0b419]/30 pb-2">
        Sound Settings
      </h2>
      <label className="flex items-center justify-between cursor-pointer group">
        <span className="text-xs font-medium text-gray-300 uppercase tracking-wider group-hover:text-[#f0b419] transition-colors">
          Enable UI Sounds
        </span>
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={settings.enableSounds}
            onChange={(e) => handleChange('enableSounds', e.target.checked)}
          />
          <div className={`block w-10 h-6 rounded-full transition-colors ${settings.enableSounds ? 'bg-[#f0b419]' : 'bg-gray-800'}`}></div>
          <div className={`absolute left-1 top-1 bg-[#0a0a0a] w-4 h-4 rounded-full transition-transform ${settings.enableSounds ? 'transform translate-x-4' : ''}`}></div>
        </div>
      </label>
    </div>
  );
}
