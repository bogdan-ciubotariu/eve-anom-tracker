import { ChangeEvent, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, Save, Loader2 } from 'lucide-react';

export interface AppSettings {
  alwaysOnTop: boolean;
  globalScale: number;
  windowOpacity: number;
  customSites: string;
  enableSounds: boolean;
  orientation: 'portrait' | 'landscape';
  backupPath?: string;
}

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (newSettings: AppSettings) => void;
  showToast: (message: string) => void;
}

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_IPC__' in window);

export default function Settings({ settings, onSettingsChange, showToast }: SettingsProps) {
  const [isBackingUp, setIsBackingUp] = useState(false);

  const handleChange = (key: keyof AppSettings, value: any) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handleBrowse = async () => {
    if (!isTauri) {
      showToast('Backup is only available in the desktop application');
      return;
    }

    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Backup Destination'
      });
      
      if (selected) {
        handleChange('backupPath', selected);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
      showToast('Failed to select directory');
    }
  };

  const handleBackup = async () => {
    if (!isTauri) {
      showToast('Backup is only available in the desktop application');
      return;
    }

    if (!settings.backupPath) {
      showToast('Please select a backup path first');
      return;
    }

    setIsBackingUp(true);
    try {
      const dataDir = await invoke<string>('get_data_dir');
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:T]/g, '-').split('.')[0];
      const zipName = `${timestamp}_EVE_AnomTracker_Backup.zip`;
      const backupDest = await invoke<string>('join_paths', { base: settings.backupPath, sub: zipName });

      const dbFile = await invoke<string>('join_paths', { base: dataDir, sub: 'anomtracker.db' });
      const settingsFile = await invoke<string>('join_paths', { base: dataDir, sub: 'settings.json' });
      
      await invoke('create_backup_zip', { 
        srcFiles: [dbFile, settingsFile], 
        destZip: backupDest 
      });

      showToast('Backup Successful (ZIP created)');
    } catch (error) {
      console.error('Backup failed:', error);
      showToast(`Backup Error: ${error}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-6">
      <h2 className="text-sm font-semibold text-[#f0b419] uppercase tracking-wider mb-4 border-b border-[#f0b419]/30 pb-2">
        Window Controls
      </h2>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-300 uppercase tracking-wider">
            Orientation
          </label>
          <div className="flex space-x-2">
            <button
              onClick={() => handleChange('orientation', 'portrait')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${settings.orientation === 'portrait' ? 'bg-[#f0b419] text-[#0a0a0a]' : 'bg-[#141414] text-gray-400 border border-gray-800 hover:text-[#f0b419]'}`}
            >
              Portrait
            </button>
            <button
              onClick={() => handleChange('orientation', 'landscape')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded transition-colors ${settings.orientation === 'landscape' ? 'bg-[#f0b419] text-[#0a0a0a]' : 'bg-[#141414] text-gray-400 border border-gray-800 hover:text-[#f0b419]'}`}
            >
              Landscape
            </button>
          </div>
        </div>

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
      <label className="flex items-center justify-between cursor-pointer group mb-8">
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

      <h2 className="text-sm font-semibold text-[#f0b419] uppercase tracking-wider mt-8 mb-4 border-b border-[#f0b419]/30 pb-2">
        Data Backup
      </h2>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-300 uppercase tracking-wider">
            Backup Destination
          </label>
          <div className="flex space-x-2">
            <div className="flex-1 bg-[#141414] border border-[#f0b419]/30 rounded p-2 text-[10px] text-gray-400 truncate">
              {settings.backupPath || 'No path selected'}
            </div>
            <button
              onClick={handleBrowse}
              className="bg-[#141414] border border-[#f0b419]/50 text-[#f0b419] p-2 rounded hover:bg-[#f0b419]/10 transition-colors"
              title="Browse"
            >
              <Folder size={14} />
            </button>
          </div>
        </div>
        
        <button
          onClick={handleBackup}
          disabled={isBackingUp}
          className="w-full py-3 bg-[#f0b419]/10 border border-[#f0b419] text-[#f0b419] font-bold text-xs uppercase tracking-[0.2em] rounded hover:bg-[#f0b419] hover:text-[#0a0a0a] transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isBackingUp ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Backing up...</span>
            </>
          ) : (
            <>
              <Save size={16} />
              <span>Backup Data Now</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
