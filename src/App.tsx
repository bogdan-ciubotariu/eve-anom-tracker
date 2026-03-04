import { useState, useEffect, ChangeEvent, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Database from '@tauri-apps/plugin-sql';
import { format } from 'date-fns';
import { Trash2, Menu, X, Crosshair, BarChart2, Settings as SettingsIcon } from 'lucide-react';
import Settings, { AppSettings } from './Settings';

interface AnomLog {
  id: number;
  timestamp: string;
  site_type: string;
  was_ded_escalation: number;
  was_capital_escalation: number;
  was_shadow_escalation: number;
  was_officer_escalation: number;
  was_shadow_spawn: number;
  was_dread_spawn: number;
  was_shadow_dread_spawn: number;
  was_titan_spawn: number;
}

const DEFAULT_SITE_TYPES = [
  'Haven',
  'Sanctum',
  'Forsaken Hub',
  'Forsaken Rally Point',
];

const DEFAULT_SETTINGS: AppSettings = {
  alwaysOnTop: false,
  globalScale: 1.0,
  windowOpacity: 1.0,
  customSites: "Haven, Sanctum, Forsaken Hub, Forsaken Rally Point",
  enableSounds: false,
};

type ViewState = 'combat' | 'statistics' | 'settings';

export default function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [currentView, setCurrentView] = useState<ViewState>('combat');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const siteTypes = settings.customSites
    ? settings.customSites.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_SITE_TYPES;

  const [siteType, setSiteType] = useState(siteTypes[0] || 'Other');
  const [history, setHistory] = useState<AnomLog[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [logToDelete, setLogToDelete] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Toggles
  const [toggles, setToggles] = useState({
    was_ded_escalation: false,
    was_capital_escalation: false,
    was_shadow_escalation: false,
    was_officer_escalation: false,
    was_shadow_spawn: false,
    was_dread_spawn: false,
    was_shadow_dread_spawn: false,
    was_titan_spawn: false,
  });

  useEffect(() => {
    // Load persisted site type
    const savedSiteType = localStorage.getItem('anomtracker_site_type');
    if (savedSiteType && siteTypes.includes(savedSiteType)) {
      setSiteType(savedSiteType);
    }

    initDb();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_IPC__' in window;
      if (!isTauri) return;

      const settingsJson = await invoke<string>('load_settings');
      const loadedSettings = JSON.parse(settingsJson);
      
      const newSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
      setSettings(newSettings);
      applySettings(newSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    applySettings(newSettings);
    
    try {
      const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_IPC__' in window;
      if (isTauri) {
        await invoke('save_settings', { settings: JSON.stringify(newSettings) });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const applySettings = async (s: AppSettings) => {
    try {
      const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_IPC__' in window;
      if (isTauri) {
        await invoke('set_always_on_top', { alwaysOnTop: s.alwaysOnTop });
        // Apply opacity via Tauri Window API
        const win = getCurrentWindow();
        await win.setOpacity(s.windowOpacity);
      }
    } catch (error) {
      console.error('Failed to apply settings:', error);
    }
  };

  const playTone = (type: 'log' | 'delete') => {
    if (!settings.enableSounds) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === 'log') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // A6
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.2); // A2
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      console.error('Audio playback failed', e);
    }
  };

  const initDb = async () => {
    try {
      const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_IPC__' in window;
      let database: any;

      if (isTauri) {
        const dbPath = await invoke<string>('get_db_path');
        database = await Database.load(dbPath);
      } else {
        console.warn('Not running in Tauri environment. Using mock database.');
        setDbError('Web Preview Mode: Data will not persist across reloads.');
        
        database = {
          logs: [] as AnomLog[],
          idCounter: 1,
          async execute(query: string, bindValues?: any[]) {
            if (query.includes('INSERT INTO anom_logs')) {
              const log: AnomLog = {
                id: this.idCounter++,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                site_type: bindValues![0],
                was_ded_escalation: bindValues![1],
                was_capital_escalation: bindValues![2],
                was_shadow_escalation: bindValues![3],
                was_officer_escalation: bindValues![4],
                was_shadow_spawn: bindValues![5],
                was_dread_spawn: bindValues![6],
                was_shadow_dread_spawn: bindValues![7],
                was_titan_spawn: bindValues![8],
              };
              this.logs.push(log);
            } else if (query.includes('DELETE FROM anom_logs')) {
              const id = bindValues![0];
              this.logs = this.logs.filter((l: AnomLog) => l.id !== id);
            }
            return { lastInsertId: this.idCounter, rowsAffected: 1 };
          },
          async select<T>(query: string, bindValues?: any[]): Promise<T> {
            if (query.includes('ORDER BY id DESC LIMIT 3')) {
              return [...this.logs].reverse().slice(0, 3) as unknown as T;
            }
            return [] as unknown as T;
          }
        };
      }

      setDb(database);
      fetchHistory(database);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      setDbError(String(error));
    }
  };

  const fetchHistory = async (database: any) => {
    try {
      const result = await database.select(
        'SELECT * FROM anom_logs ORDER BY id DESC LIMIT 3'
      );
      setHistory(result as AnomLog[]);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const handleSiteTypeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSiteType(val);
    localStorage.setItem('anomtracker_site_type', val);
  };

  const toggleState = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const logSite = async () => {
    if (!db) return;

    try {
      await db.execute(
        `INSERT INTO anom_logs (
          site_type, was_ded_escalation, was_capital_escalation, was_shadow_escalation,
          was_officer_escalation, was_shadow_spawn, was_dread_spawn,
          was_shadow_dread_spawn, was_titan_spawn
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          siteType,
          toggles.was_ded_escalation ? 1 : 0,
          toggles.was_capital_escalation ? 1 : 0,
          toggles.was_shadow_escalation ? 1 : 0,
          toggles.was_officer_escalation ? 1 : 0,
          toggles.was_shadow_spawn ? 1 : 0,
          toggles.was_dread_spawn ? 1 : 0,
          toggles.was_shadow_dread_spawn ? 1 : 0,
          toggles.was_titan_spawn ? 1 : 0,
        ]
      );

      // Reset toggles
      setToggles({
        was_ded_escalation: false,
        was_capital_escalation: false,
        was_shadow_escalation: false,
        was_officer_escalation: false,
        was_shadow_spawn: false,
        was_dread_spawn: false,
        was_shadow_dread_spawn: false,
        was_titan_spawn: false,
      });

      fetchHistory(db);
      
      playTone('log');
      showToast('Site successfully logged');
    } catch (error) {
      console.error('Failed to log site:', error);
      showToast('Failed to log site');
    }
  };

  const confirmDelete = async () => {
    if (!db || logToDelete === null) return;

    try {
      await db.execute('DELETE FROM anom_logs WHERE id = $1', [logToDelete]);
      setLogToDelete(null);
      fetchHistory(db);
      
      playTone('delete');
      showToast('Log successfully deleted');
    } catch (error) {
      console.error('Failed to delete log:', error);
      showToast('Failed to delete log');
    }
  };

  const requestDelete = (id: number) => {
    setLogToDelete(id);
  };

  const getActiveIcons = (log: AnomLog) => {
    const icons: { label: string; color: 'gold' | 'blue' | 'green' }[] = [];
    if (log.was_ded_escalation === 1) icons.push({ label: 'DED-ESC', color: 'green' });
    if (log.was_capital_escalation === 1) icons.push({ label: 'CAP-ESC', color: 'green' });
    if (log.was_shadow_escalation === 1) icons.push({ label: 'SHD-ESC', color: 'green' });
    if (log.was_officer_escalation === 1) icons.push({ label: 'OFF-ESC', color: 'green' });
    if (log.was_shadow_spawn === 1) icons.push({ label: 'SHD-NPC', color: 'blue' });
    if (log.was_dread_spawn === 1) icons.push({ label: 'DRD', color: 'blue' });
    if (log.was_shadow_dread_spawn === 1) icons.push({ label: 'SHA-DRD', color: 'blue' });
    if (log.was_titan_spawn === 1) icons.push({ label: 'TTN', color: 'blue' });
    return icons;
  };

  return (
    <div 
      className="min-h-screen bg-[#0a0a0a] text-gray-300 font-sans flex flex-col w-[360px] mx-auto overflow-hidden select-none origin-top"
      style={{ transform: `scale(${settings.globalScale})`, height: `${100 / settings.globalScale}vh` }}
    >
      <header className="p-4 mb-2 border-b border-[#f0b419]/30 pb-2 flex justify-between items-center relative z-20 bg-[#0a0a0a]">
        <h1 className="text-xl font-bold text-[#f0b419] tracking-wider uppercase">
          EVE AnomTracker
        </h1>
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="text-[#f0b419] hover:text-white transition-colors p-1"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Navigation Menu Overlay */}
      {isMenuOpen && (
        <div className="absolute inset-0 top-[60px] bg-[#0a0a0a]/95 backdrop-blur-sm z-50 flex flex-col p-4">
          <div className="flex flex-col space-y-4 mt-4">
            <button 
              onClick={() => { setCurrentView('combat'); setIsMenuOpen(false); }}
              className={`flex items-center p-4 rounded-lg font-bold uppercase tracking-wider transition-all duration-200 ${currentView === 'combat' ? 'text-[#0a0a0a] bg-[#f0b419] shadow-[0_0_15px_rgba(240,180,25,0.4)]' : 'text-gray-400 hover:text-[#f0b419] hover:bg-[#141414] border border-gray-800'}`}
            >
              <Crosshair className="mr-4" size={24} />
              Combat Log
            </button>
            <button 
              onClick={() => { setCurrentView('statistics'); setIsMenuOpen(false); }}
              className={`flex items-center p-4 rounded-lg font-bold uppercase tracking-wider transition-all duration-200 ${currentView === 'statistics' ? 'text-[#0a0a0a] bg-[#f0b419] shadow-[0_0_15px_rgba(240,180,25,0.4)]' : 'text-gray-400 hover:text-[#f0b419] hover:bg-[#141414] border border-gray-800'}`}
            >
              <BarChart2 className="mr-4" size={24} />
              Statistics
            </button>
            <button 
              onClick={() => { setCurrentView('settings'); setIsMenuOpen(false); }}
              className={`flex items-center p-4 rounded-lg font-bold uppercase tracking-wider transition-all duration-200 ${currentView === 'settings' ? 'text-[#0a0a0a] bg-[#f0b419] shadow-[0_0_15px_rgba(240,180,25,0.4)]' : 'text-gray-400 hover:text-[#f0b419] hover:bg-[#141414] border border-gray-800'}`}
            >
              <SettingsIcon className="mr-4" size={24} />
              Settings
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col p-4 overflow-hidden relative">
        {dbError && (
          <div className="bg-red-900/50 text-red-200 p-2 text-xs rounded mb-4 border border-red-500/50">
            DB Error: {dbError}
          </div>
        )}

        {currentView === 'combat' && (
          <>
            <div className="mb-6">
              <label className="block text-xs font-semibold text-[#f0b419] uppercase tracking-wider mb-2">
                Site Info
              </label>
              <select
                value={siteType}
                onChange={handleSiteTypeChange}
                className="w-full bg-[#141414] border border-[#f0b419]/50 text-white p-2 rounded focus:outline-none focus:border-[#f0b419] focus:ring-1 focus:ring-[#f0b419] appearance-none"
              >
                {siteTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-2">
              <label className="block text-xs font-semibold text-[#f0b419] uppercase tracking-wider mb-2">
                Site Outcome
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-8">
              <div className="space-y-3">
                <ToggleButton
                  label="DED ESC"
                  active={toggles.was_ded_escalation}
                  onClick={() => toggleState('was_ded_escalation')}
                  color="green"
                />
                <ToggleButton
                  label="CAP ESC"
                  active={toggles.was_capital_escalation}
                  onClick={() => toggleState('was_capital_escalation')}
                  color="green"
                />
                <ToggleButton
                  label="SHADOW ESC"
                  active={toggles.was_shadow_escalation}
                  onClick={() => toggleState('was_shadow_escalation')}
                  color="green"
                />
                <ToggleButton
                  label="OFFICER ESC"
                  active={toggles.was_officer_escalation}
                  onClick={() => toggleState('was_officer_escalation')}
                  color="green"
                />
              </div>
              <div className="space-y-3">
                <ToggleButton
                  label="SHADOW NPC"
                  active={toggles.was_shadow_spawn}
                  onClick={() => toggleState('was_shadow_spawn')}
                  color="blue"
                />
                <ToggleButton
                  label="DREAD"
                  active={toggles.was_dread_spawn}
                  onClick={() => toggleState('was_dread_spawn')}
                  color="blue"
                />
                <ToggleButton
                  label="SHADOW DREAD"
                  active={toggles.was_shadow_dread_spawn}
                  onClick={() => toggleState('was_shadow_dread_spawn')}
                  color="blue"
                />
                <ToggleButton
                  label="TITAN"
                  active={toggles.was_titan_spawn}
                  onClick={() => toggleState('was_titan_spawn')}
                  color="blue"
                />
              </div>
            </div>

            <button
              onClick={logSite}
              disabled={!db}
              className="w-full py-4 bg-[#141414] border-2 border-[#f0b419] text-[#f0b419] font-bold text-lg uppercase tracking-widest rounded hover:bg-[#f0b419] hover:text-[#0a0a0a] transition-all duration-200 shadow-[0_0_15px_rgba(240,180,25,0.3)] hover:shadow-[0_0_25px_rgba(240,180,25,0.6)] disabled:opacity-50 disabled:cursor-not-allowed mb-8"
            >
              Log Site
            </button>

            <div className="flex-1 overflow-y-auto">
              <h2 className="text-xs font-semibold text-[#f0b419] uppercase tracking-wider mb-3 border-b border-[#f0b419]/30 pb-1">
                Recent History
              </h2>
              <div className="space-y-2">
                {history.length === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-4">
                    No sites logged yet.
                  </p>
                ) : (
                  history.map((log) => {
                    // Handle SQLite date string
                    const dateObj = new Date(log.timestamp + 'Z'); // Append Z to force UTC parsing if SQLite returns UTC
                    const timeStr = isNaN(dateObj.getTime())
                      ? log.timestamp.split(' ')[1] || log.timestamp
                      : format(dateObj, 'HH:mm');
                    
                    const icons = getActiveIcons(log);

                    return (
                      <div
                        key={log.id}
                        className="flex items-center justify-between bg-[#141414] border border-gray-800 p-2 rounded text-xs group"
                      >
                        <div className="flex-1 truncate pr-2">
                          <span className="text-gray-500 mr-2">[{timeStr}]</span>
                          <span className="text-gray-200 font-medium">{log.site_type}</span>
                          {icons.length > 0 && (
                            <span className="ml-2">
                              <span className="text-gray-500 mr-1">-</span>
                              {icons.map((icon, idx) => (
                                <span key={idx}>
                                  <span className={`text-[10px] tracking-wider ${icon.color === 'gold' ? 'text-[#f0b419]' : icon.color === 'green' ? 'text-[#00ff7f]' : 'text-[#00e5ff]'}`}>
                                    {icon.label}
                                  </span>
                                  {idx < icons.length - 1 && <span className="text-gray-600 mx-0.5">,</span>}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => requestDelete(log.id)}
                          className="text-gray-600 hover:text-red-500 transition-colors opacity-50 group-hover:opacity-100 p-1"
                          title="Delete Log"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {currentView === 'statistics' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 border-4 border-[#f0b419]/20 border-t-[#f0b419] rounded-full animate-spin mx-auto"></div>
              <h2 className="text-xl font-bold text-[#f0b419] uppercase tracking-widest">
                Coming Soon
              </h2>
              <p className="text-sm text-gray-500 uppercase tracking-wider">
                Advanced analytics in development
              </p>
            </div>
          </div>
        )}

        {currentView === 'settings' && (
          <Settings settings={settings} onSettingsChange={saveSettings} />
        )}
      </div>

      {/* Confirmation Modal */}
      {logToDelete !== null && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#141414] border border-[#f0b419]/50 rounded-lg p-5 w-full max-w-[300px] shadow-2xl">
            <h3 className="text-[#f0b419] font-bold text-lg mb-2">Delete Log?</h3>
            <p className="text-gray-400 text-sm mb-6">
              Are you sure you want to delete this entry? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setLogToDelete(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 text-sm bg-red-900/50 text-red-200 border border-red-500/50 rounded hover:bg-red-900 hover:text-white transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-[328px] text-center whitespace-nowrap bg-[#141414] border border-[#f0b419]/50 text-[#f0b419] px-4 py-2 rounded shadow-[0_0_10px_rgba(240,180,25,0.2)] text-sm z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
  color = 'gold',
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: 'gold' | 'blue' | 'green';
}) {
  const baseClasses =
    'w-full py-2 px-1 text-xs font-semibold uppercase tracking-wider rounded border transition-all duration-200 text-center cursor-pointer';
  
  const colorClasses =
    color === 'gold'
      ? active
        ? 'bg-[#f0b419]/20 border-[#f0b419] text-[#f0b419] shadow-[0_0_10px_rgba(240,180,25,0.4)]'
        : 'bg-[#141414] border-gray-800 text-gray-500 hover:border-[#f0b419]/50 hover:text-gray-300'
      : color === 'green'
      ? active
        ? 'bg-[#00ff7f]/20 border-[#00ff7f] text-[#00ff7f] shadow-[0_0_10px_rgba(0,255,127,0.4)]'
        : 'bg-[#141414] border-gray-800 text-gray-500 hover:border-[#00ff7f]/50 hover:text-gray-300'
      : active
      ? 'bg-[#00e5ff]/20 border-[#00e5ff] text-[#00e5ff] shadow-[0_0_10px_rgba(0,229,255,0.4)]'
      : 'bg-[#141414] border-gray-800 text-gray-500 hover:border-[#00e5ff]/50 hover:text-gray-300';

  return (
    <div className={`${baseClasses} ${colorClasses}`} onClick={onClick}>
      {label}
    </div>
  );
}
