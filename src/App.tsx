import { useState, useEffect, ChangeEvent, useRef, MouseEvent } from 'react';
import systemsData from './data/solar_systems.json';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Database from '@tauri-apps/plugin-sql';
import { format, subDays } from 'date-fns';
import { Trash2, Menu, X, Crosshair, BarChart2, Settings as SettingsIcon, Minus, ChevronUp, ChevronDown, Activity, ExternalLink, HardDrive, Calendar } from 'lucide-react';
import Settings, { AppSettings } from './Settings';

interface AnomLog {
  id: number;
  timestamp: string;
  site_type: string;
  was_ded_escalation: number;
  was_occ_mine_escalation: number;
  was_cap_stag_escalation: number;
  was_shld_starb_escalation: number;
  was_attack_site_escalation: number;
  was_faction_npc_spawn: number;
  was_capital_spawn: number;
  was_faction_capital_spawn: number;
  was_titan_spawn: number;
  location_region?: string;
  location_system?: string;
  location_security?: string;
}

interface DailyStat {
  date: string;
  count: number;
  escalations: number;
  spawns: number;
}

interface StatsData {
  totalSites: number;
  successfulSites: number;
  escalations: {
    ded: number;
    occupiedMine: number;
    capitalStaging: number;
    shieldedStarbase: number;
    attackSite: number;
  };
  specialSpawns: {
    factionSubcap: number;
    capital: number;
    factionCapital: number;
    titan: number;
  };
}

const StatCard = ({ label, count, total, color, highlighted = false, className = "" }: { label: string, count: number, total: number, color: 'green' | 'blue', highlighted?: boolean, className?: string }) => {
  const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
  const colorClass = color === 'green' ? 'text-[#00ff7f]' : 'text-[#00e5ff]';
  const borderColor = highlighted 
    ? (color === 'green' ? 'border-[#00ff7f]/60' : 'border-[#00e5ff]/60')
    : (color === 'green' ? 'border-[#00ff7f]/20' : 'border-[#00e5ff]/20');
  const bgHover = color === 'green' ? 'hover:bg-[#00ff7f]/5' : 'hover:bg-[#00e5ff]/5';
  const bgClass = highlighted 
    ? (color === 'green' ? 'bg-[#00ff7f]/5' : 'bg-[#00e5ff]/5')
    : 'bg-[#141414]';
  const shadowClass = highlighted
    ? (color === 'green' ? 'shadow-[0_0_15px_rgba(0,255,127,0.1)]' : 'shadow-[0_0_15px_rgba(0,229,255,0.1)]')
    : '';

  return (
    <div className={`${bgClass} border ${borderColor} p-4 rounded-lg transition-all duration-200 ${bgHover} ${shadowClass} ${className} group flex flex-col justify-center`}>
      <div className={`text-[10px] font-bold ${highlighted ? 'text-gray-300' : 'text-gray-500'} uppercase tracking-widest mb-1 group-hover:text-gray-400 transition-colors`}>
        {label}
      </div>
      <div className="flex items-baseline justify-between">
        <div className={`${highlighted ? 'text-3xl' : 'text-2xl'} font-bold ${colorClass}`}>
          {count}
        </div>
        <div className={`text-xs font-mono ${highlighted ? 'text-gray-400' : 'text-gray-500'}`}>
          {percentage}%
        </div>
      </div>
    </div>
  );
};

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
  enableSounds: true,
  orientation: 'portrait',
  backupPath: '',
  autoBackupFrequency: 'off',
  preferredSystems: [],
};

type ViewState = 'combat' | 'statistics' | 'settings';

const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window || '__TAURI_IPC__' in window);

const Titlebar = ({ isCollapsed, onToggleCollapse }: { isCollapsed: boolean, onToggleCollapse: () => void }) => {
  const appWindow = isTauri ? getCurrentWindow() : null;

  const handleMouseDown = (e: MouseEvent) => {
    // Only start dragging on left click and if we're not clicking a button
    if (isTauri && e.button === 0) {
      // Use the explicit startDragging API for better reliability
      appWindow?.startDragging();
    }
  };

  return (
    <div 
      className="h-[28px] bg-[#050505] flex items-center border-b border-[#333] select-none shrink-0 overflow-hidden"
    >
      {/* Dedicated Drag Area with Title */}
      <div 
        data-tauri-drag-region
        onMouseDown={handleMouseDown}
        className="flex-1 h-full cursor-default flex items-center px-3"
      >
        <span className="text-[10px] font-bold text-[#f0b419] tracking-[0.2em] uppercase pointer-events-none">
          EVE ANOMTRACKER
        </span>
      </div>

      {/* Window Controls */}
      <div className="flex h-full shrink-0">
        <button 
          onClick={onToggleCollapse}
          className={`h-full px-3 flex items-center justify-center transition-colors ${
            isCollapsed 
              ? "bg-[#f0b419] text-[#0a0a0a]" 
              : "text-gray-500 hover:bg-[#f0b419] hover:text-[#0a0a0a]"
          }`}
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button 
          onClick={() => isTauri && appWindow?.minimize()}
          className="h-full px-3 flex items-center justify-center hover:bg-[#f0b419] hover:text-[#0a0a0a] transition-colors text-gray-500"
        >
          <Minus size={14} />
        </button>
        <button 
          onClick={() => isTauri && appWindow?.close()}
          className="h-full px-3 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors text-gray-500"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const Splash = () => {
  const handleMouseDown = (e: MouseEvent) => {
    if (isTauri && e.button === 0) {
      getCurrentWindow()?.startDragging();
    }
  };

  return (
    <div 
      className="absolute inset-0 bg-[radial-gradient(circle,#1a1a1a_0%,#050505_100%)] flex flex-col items-center justify-center overflow-hidden z-[9999]"
      onMouseDown={handleMouseDown}
      data-tauri-drag-region
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="w-full h-full bg-[url('/app-icon.jpg')] bg-contain bg-no-repeat bg-center"></div>
      </div>
      <div className="absolute bottom-3 right-3 text-right z-20 pointer-events-none">
        <div className="text-[#f0b419] text-[10px] font-black tracking-[0.2em] uppercase mb-1 drop-shadow-[0_0_10px_rgba(0,0,0,0.8)]">Loading...</div>
        <div className="flex justify-end gap-1">
          <div className="w-1 h-1 bg-[#f0b419] rounded-full shadow-[0_0_5px_rgba(240,180,25,0.5)] animate-[pulse_1.5s_infinite_ease-in-out]"></div>
          <div className="w-1 h-1 bg-[#f0b419] rounded-full shadow-[0_0_5px_rgba(240,180,25,0.5)] animate-[pulse_1.5s_infinite_ease-in-out] [animation-delay:0.2s]"></div>
          <div className="w-1 h-1 bg-[#f0b419] rounded-full shadow-[0_0_5px_rgba(240,180,25,0.5)] animate-[pulse_1.5s_infinite_ease-in-out] [animation-delay:0.4s]"></div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#f0b419]/10 z-20 pointer-events-none">
        <div className="animate-[progress_3s_linear_forwards] h-full bg-[#f0b419] shadow-[0_0_10px_#f0b419]"></div>
      </div>
    </div>
  );
};

export default function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [currentView, setCurrentView] = useState<ViewState>('combat');
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const siteTypes = settings.customSites
    ? settings.customSites.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_SITE_TYPES;

  const [siteType, setSiteType] = useState(siteTypes[0] || 'Other');
  const [selectedSystem, setSelectedSystem] = useState<string>('');
  const [history, setHistory] = useState<AnomLog[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [fullHistory, setFullHistory] = useState<AnomLog[]>([]);
  const [recentCount, setRecentCount] = useState<number>(0);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isTrackedSitesModalOpen, setIsTrackedSitesModalOpen] = useState(false);
  const [trackedSites, setTrackedSites] = useState<AnomLog[]>([]);
  const [trackedSitesPage, setTrackedSitesPage] = useState(0);
  const [hasMoreTrackedSites, setHasMoreTrackedSites] = useState(true);
  const [isLoadingTrackedSites, setIsLoadingTrackedSites] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [statsFilter, setStatsFilter] = useState<string>('All');
  const [dateRangeType, setDateRangeType] = useState<'All' | 'Today' | 'Yesterday' | 'Week' | 'Month' | 'Custom'>('All');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [logToDelete, setLogToDelete] = useState<number | null>(null);
  const [isAutoBackupModalOpen, setIsAutoBackupModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [systemDateFormat, setSystemDateFormat] = useState<string>('yyyy-MM-dd');

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Format a yyyy-MM-dd string using the actual OS date format from Windows registry
  const formatLocalDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    // Replace Windows format tokens with actual values
    return systemDateFormat
      .replaceAll('yyyy', year)
      .replaceAll('yy', year.slice(2))
      .replaceAll('MM', month.padStart(2, '0'))
      .replaceAll('M', String(parseInt(month, 10)))
      .replaceAll('dd', day.padStart(2, '0'))
      .replaceAll('d', String(parseInt(day, 10)));
  };

  // Toggles
  const [toggles, setToggles] = useState({
    was_ded_escalation: false,
    was_occ_mine_escalation: false,
    was_cap_stag_escalation: false,
    was_shld_starb_escalation: false,
    was_attack_site_escalation: false,
    was_faction_npc_spawn: false,
    was_capital_spawn: false,
    was_faction_capital_spawn: false,
    was_titan_spawn: false,
  });

  useEffect(() => {
    // Attempt to match system locale for date formatting
    try {
      const systemLocale = new Intl.DateTimeFormat().resolvedOptions().locale;
      document.documentElement.lang = systemLocale;
    } catch (e) {
      document.documentElement.lang = navigator.language;
    }

    // Fetch real OS date format from Rust (reads Windows registry)
    if (isTauri) {
      invoke<string>('get_system_date_format').then(fmt => {
        console.log('System Date Format:', fmt);
        if (fmt) setSystemDateFormat(fmt);
      }).catch((err) => {
        console.error('Failed to get system date format:', err);
      });
    }

    // Load persisted site type and system
    const savedSiteType = localStorage.getItem('anomtracker_site_type');
    if (savedSiteType && siteTypes.includes(savedSiteType)) {
      setSiteType(savedSiteType);
    }

    const initialize = async () => {
      const startTime = Date.now();
      const MIN_SPLASH_TIME = 3000;

      try {
        if (isTauri) {
          try {
            await getCurrentWindow().show();
          } catch (e) {
            console.error('Failed to show window initially:', e);
          }
        }

        // Load solar systems data
        if (!systemsData || !Array.isArray(systemsData)) {
          console.error('Failed to load solar systems: Invalid system data');
          showToast('System data failed to load. Please check installation.');
        }

        // Run initialization in parallel
        await Promise.all([
          initDb(),
          loadSettings()
        ]);
        setIsSettingsLoaded(true);

        // Calculate remaining time for splash screen
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, MIN_SPLASH_TIME - elapsedTime);

        setTimeout(() => {
          setIsAppReady(true);
        }, remainingTime);
      } catch (error) {
        console.error('Initialization failed:', error);
        setIsAppReady(true);
      }
    };

    initialize();
  }, []);

  const loadSettings = async () => {
    try {
      if (!isTauri) {
        setIsSettingsLoaded(true);
        return;
      }

      const settingsJson = await invoke<string>('load_settings');
      const loadedSettings = JSON.parse(settingsJson);
      
      const newSettings = { ...DEFAULT_SETTINGS, ...loadedSettings };
      setSettings(newSettings);
      applySettings(newSettings);
      
      // Check for auto-backup after settings are loaded
      if (isTauri) {
        checkAutoBackup(newSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setIsSettingsLoaded(true);
    }
  };

  const saveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    applySettings(newSettings);
    
    try {
      if (isTauri) {
        await invoke('save_settings', { settings: JSON.stringify(newSettings) });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const getDateRange = (type: string, customStart: string, customEnd: string) => {
    const now = new Date();
    const today = format(now, 'yyyy-MM-dd');
    
    switch (type) {
      case 'Today':
        return { start: today, end: today };
      case 'Yesterday': {
        const yesterday = format(subDays(now, 1), 'yyyy-MM-dd');
        return { start: yesterday, end: yesterday };
      }
      case 'Week':
        return { start: format(subDays(now, 7), 'yyyy-MM-dd'), end: today };
      case 'Month':
        return { start: format(subDays(now, 30), 'yyyy-MM-dd'), end: today };
      case 'Custom':
        return { start: customStart || null, end: customEnd || null };
      case 'All':
      default:
        return { start: null, end: null };
    }
  };

  const applySettings = async (s: AppSettings) => {
    try {
      if (isTauri) {
        let width = s.orientation === 'portrait' ? 360 : 700;
        let height = s.orientation === 'portrait' ? 725 : 450;
        
        if (currentView === 'statistics') {
          width = 800;
          height = 825;
        }
        
        if (isCollapsed) {
          height = 28;
        }

        await invoke('apply_window_settings', { 
          alwaysOnTop: s.alwaysOnTop,
          scale: (currentView === 'statistics' || currentView === 'settings') ? 1.0 : s.globalScale,
          width,
          height
        });
      }
    } catch (error) {
      console.error('Failed to apply settings:', error);
    }
  };

  useEffect(() => {
    applySettings(settings);
    if (db && currentView === 'statistics') {
      fetchStats(db, statsFilter);
    }
  }, [isCollapsed, currentView, statsFilter, dateRangeType, customStartDate, customEndDate]);

  useEffect(() => {
    if (!isSettingsLoaded) return;
    if (settings.preferredSystems.length > 0) {
      const savedSystem = localStorage.getItem('anomtracker_selected_system');
      if (savedSystem && settings.preferredSystems.includes(savedSystem)) {
        setSelectedSystem(savedSystem);
      }
    } else {
      setSelectedSystem('');
      localStorage.removeItem('anomtracker_selected_system');
    }
  }, [settings.preferredSystems, isSettingsLoaded]);

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

  const checkAutoBackup = async (currentSettings: AppSettings) => {
    if (currentSettings.autoBackupFrequency === 'off' || !currentSettings.backupPath) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // "YYYY-MM-DD"
    
    if (currentSettings.lastAutoBackup === todayStr) return; // Already backed up today

    const lastBackupStr = currentSettings.lastAutoBackup || '1970-01-01';
    const lastBackupDate = new Date(lastBackupStr);
    const nowDate = new Date(todayStr);
    
    const diffMs = nowDate.getTime() - lastBackupDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let shouldBackup = false;
    if (currentSettings.autoBackupFrequency === 'daily' && diffDays >= 1) shouldBackup = true;
    if (currentSettings.autoBackupFrequency === 'weekly' && diffDays >= 7) shouldBackup = true;
    if (currentSettings.autoBackupFrequency === 'monthly' && diffDays >= 30) shouldBackup = true;

    if (shouldBackup) {
      try {
        const dataDir = await invoke<string>('get_data_dir');
        const timestamp = now.toISOString().replace(/[:T]/g, '-').split('.')[0];
        const zipName = `${timestamp}_EVE_AnomTracker_AutoBackup.zip`;
        const backupDest = await invoke<string>('join_paths', { base: currentSettings.backupPath, sub: zipName });

        const dbFile = await invoke<string>('join_paths', { base: dataDir, sub: 'anomtracker.db' });
        const settingsFile = await invoke<string>('join_paths', { base: dataDir, sub: 'settings.json' });
        
        await invoke('create_backup_zip', { 
          srcFiles: [dbFile, settingsFile], 
          destZip: backupDest 
        });

        // Update last backup date
        const updatedSettings = { ...currentSettings, lastAutoBackup: todayStr };
        await saveSettings(updatedSettings);
        
        setIsAutoBackupModalOpen(true);
      } catch (error) {
        console.error('Auto-backup failed:', error);
      }
    }
  };

  const initDb = async () => {
    try {
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
                was_occ_mine_escalation: bindValues![2],
                was_cap_stag_escalation: bindValues![3],
                was_shld_starb_escalation: bindValues![4],
                was_attack_site_escalation: bindValues![5],
                was_faction_npc_spawn: bindValues![6],
                was_capital_spawn: bindValues![7],
                was_faction_capital_spawn: bindValues![8],
                was_titan_spawn: bindValues![9],
                location_region: bindValues![10],
                location_system: bindValues![11],
                location_security: bindValues![12],
              };
              this.logs.push(log);
            } else if (query.includes('DELETE FROM anom_logs')) {
              const id = bindValues![0];
              this.logs = this.logs.filter((l: AnomLog) => l.id !== id);
            }
            return { lastInsertId: this.idCounter, rowsAffected: 1 };
          },
          async select<T>(query: string, bindValues?: any[]): Promise<T> {
            // Helper to get local date from UTC timestamp string
            const getLocalDate = (ts: string) => {
              const d = new Date(ts + 'Z');
              return format(d, 'yyyy-MM-dd');
            };

            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
            const filtered = this.logs.filter((l: AnomLog) => l.timestamp >= twelveHoursAgo);

            if (query.includes('SUM(CASE WHEN')) {
              let logsToUse = [...this.logs];
              let currentParamIdx = 0;

              if (query.includes('WHERE site_type = ?')) {
                const filterVal = bindValues![currentParamIdx++];
                logsToUse = logsToUse.filter(l => l.site_type === filterVal);
              }

              if (query.includes("date(timestamp, 'localtime') >= ?")) {
                const startVal = bindValues![currentParamIdx++];
                logsToUse = logsToUse.filter(l => getLocalDate(l.timestamp) >= startVal);
              }

              if (query.includes("date(timestamp, 'localtime') <= ?")) {
                const endVal = bindValues![currentParamIdx++];
                logsToUse = logsToUse.filter(l => getLocalDate(l.timestamp) <= endVal);
              }

              const total = logsToUse.length;
              const successful = logsToUse.filter(l => 
                l.was_ded_escalation === 1 || l.was_occ_mine_escalation === 1 || l.was_cap_stag_escalation === 1 || 
                l.was_shld_starb_escalation === 1 || l.was_attack_site_escalation === 1 || l.was_faction_npc_spawn === 1 || 
                l.was_capital_spawn === 1 || l.was_faction_capital_spawn === 1 || l.was_titan_spawn === 1
              ).length;
              
              return [{
                total,
                successful,
                ded: logsToUse.filter(l => l.was_ded_escalation === 1).length,
                occ: logsToUse.filter(l => l.was_occ_mine_escalation === 1).length,
                cap_stg: logsToUse.filter(l => l.was_cap_stag_escalation === 1).length,
                shld: logsToUse.filter(l => l.was_shld_starb_escalation === 1).length,
                atk: logsToUse.filter(l => l.was_attack_site_escalation === 1).length,
                fac_sub: logsToUse.filter(l => l.was_faction_npc_spawn === 1).length,
                cap: logsToUse.filter(l => l.was_capital_spawn === 1).length,
                fac_cap: logsToUse.filter(l => l.was_faction_capital_spawn === 1).length,
                titan: logsToUse.filter(l => l.was_titan_spawn === 1).length
              }] as unknown as T;
            }

            if (query.includes('LIMIT ? OFFSET ?')) {
              let logsToUse = [...this.logs].reverse();
              let currentParamIdx = 0;

              if (query.includes('WHERE site_type = ?')) {
                const filterVal = bindValues![currentParamIdx++];
                logsToUse = logsToUse.filter(l => l.site_type === filterVal);
              }

              if (query.includes("date(timestamp, 'localtime') >= ?")) {
                const startVal = bindValues![currentParamIdx++];
                logsToUse = logsToUse.filter(l => getLocalDate(l.timestamp) >= startVal);
              }

              if (query.includes("date(timestamp, 'localtime') <= ?")) {
                const endVal = bindValues![currentParamIdx++];
                logsToUse = logsToUse.filter(l => getLocalDate(l.timestamp) <= endVal);
              }

              const limit = bindValues![currentParamIdx++];
              const offset = bindValues![currentParamIdx++];
              return logsToUse.slice(offset, offset + limit) as unknown as T;
            }

            if (query.includes('ORDER BY id DESC LIMIT 3')) {
              if (query.includes("datetime('now', '-12 hours')")) {
                return [...filtered].reverse().slice(0, 3) as unknown as T;
              }
              return [...this.logs].reverse().slice(0, 3) as unknown as T;
            }
            if (query.includes("datetime('now', '-12 hours')")) {
              if (query.includes('COUNT(*)')) {
                return [{ count: filtered.length }] as unknown as T;
              }
              return [...filtered].reverse() as unknown as T;
            }
            if (query.includes("GROUP BY date(timestamp, 'localtime')")) {
              return [] as unknown as T;
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
        "SELECT * FROM anom_logs WHERE timestamp >= datetime('now', '-12 hours') ORDER BY id DESC LIMIT 3"
      );
      setHistory(result as AnomLog[]);

      const countResult = await database.select(
        "SELECT COUNT(*) as count FROM anom_logs WHERE timestamp >= datetime('now', '-12 hours')"
      );
      setRecentCount((countResult as any[])[0]?.count || 0);

      const fullResult = await database.select(
        "SELECT * FROM anom_logs WHERE timestamp >= datetime('now', '-12 hours') ORDER BY id DESC"
      );
      setFullHistory(fullResult as AnomLog[]);
      
      if (currentView === 'statistics') {
        fetchStats(database, statsFilter);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const fetchStats = async (database: any, filter: string = 'All') => {
    try {
      let dailyQuery = `
        SELECT 
          date(timestamp, 'localtime') as date, 
          COUNT(*) as count,
          SUM(CASE WHEN was_ded_escalation=1 OR was_occ_mine_escalation=1 OR was_cap_stag_escalation=1 OR was_shld_starb_escalation=1 OR was_attack_site_escalation=1 THEN 1 ELSE 0 END) as escalations,
          SUM(CASE WHEN was_faction_npc_spawn=1 OR was_capital_spawn=1 OR was_faction_capital_spawn=1 OR was_titan_spawn=1 THEN 1 ELSE 0 END) as spawns
        FROM anom_logs 
        WHERE timestamp >= date('now', 'localtime', '-30 days')
      `;
      const dailyParams: any[] = [];
      
      if (filter !== 'All') {
        dailyQuery += " AND site_type = ?";
        dailyParams.push(filter);
      }
      dailyQuery += " GROUP BY date(timestamp, 'localtime') ORDER BY date ASC";
      
      const dailyResult = await database.select(dailyQuery, dailyParams);
      setDailyStats(dailyResult as DailyStat[]);

      let query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN was_ded_escalation=1 OR was_occ_mine_escalation=1 OR was_cap_stag_escalation=1 OR was_shld_starb_escalation=1 OR was_attack_site_escalation=1 OR was_faction_npc_spawn=1 OR was_capital_spawn=1 OR was_faction_capital_spawn=1 OR was_titan_spawn=1 THEN 1 ELSE 0 END) as successful,
          SUM(was_ded_escalation) as ded,
          SUM(was_occ_mine_escalation) as occ,
          SUM(was_cap_stag_escalation) as cap_stg,
          SUM(was_shld_starb_escalation) as shld,
          SUM(was_attack_site_escalation) as atk,
          SUM(was_faction_npc_spawn) as fac_sub,
          SUM(was_capital_spawn) as cap,
          SUM(was_faction_capital_spawn) as fac_cap,
          SUM(was_titan_spawn) as titan
        FROM anom_logs
      `;
      
      const params: any[] = [];
      const conditions: string[] = [];
      
      if (filter !== 'All') {
        conditions.push("site_type = ?");
        params.push(filter);
      }

      const dateRange = getDateRange(dateRangeType, customStartDate, customEndDate);
      if (dateRange.start) {
        conditions.push("date(timestamp, 'localtime') >= ?");
        params.push(dateRange.start);
      }
      if (dateRange.end) {
        conditions.push("date(timestamp, 'localtime') <= ?");
        params.push(dateRange.end);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      const result = await database.select(query, params);
      
      const row = (result as any[])[0];
      if (!row || row.total === 0) {
        setStats({
          totalSites: 0,
          successfulSites: 0,
          escalations: { ded: 0, occupiedMine: 0, capitalStaging: 0, shieldedStarbase: 0, attackSite: 0 },
          specialSpawns: { factionSubcap: 0, capital: 0, factionCapital: 0, titan: 0 }
        });
        return;
      }

      setStats({
        totalSites: row.total,
        successfulSites: row.successful || 0,
        escalations: {
          ded: row.ded || 0,
          occupiedMine: row.occ || 0,
          capitalStaging: row.cap_stg || 0,
          shieldedStarbase: row.shld || 0,
          attackSite: row.atk || 0,
        },
        specialSpawns: {
          factionSubcap: row.fac_sub || 0,
          capital: row.cap || 0,
          factionCapital: row.fac_cap || 0,
          titan: row.titan || 0,
        }
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const fetchTrackedSites = async (reset: boolean = false) => {
    if (!db || isLoadingTrackedSites) return;
    if (!reset && !hasMoreTrackedSites) return;

    setIsLoadingTrackedSites(true);
    const page = reset ? 0 : trackedSitesPage;
    const limit = 100;
    const offset = page * limit;

    try {
      let query = "SELECT * FROM anom_logs";
      const params: any[] = [];
      const conditions: string[] = [];

      if (statsFilter !== 'All') {
        conditions.push("site_type = ?");
        params.push(statsFilter);
      }

      const dateRange = getDateRange(dateRangeType, customStartDate, customEndDate);
      if (dateRange.start) {
        conditions.push("date(timestamp, 'localtime') >= ?");
        params.push(dateRange.start);
      }
      if (dateRange.end) {
        conditions.push("date(timestamp, 'localtime') <= ?");
        params.push(dateRange.end);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }

      query += " ORDER BY id DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const result = await db.select(query, params);
      const newLogs = result as AnomLog[];

      if (reset) {
        setTrackedSites(newLogs);
        setTrackedSitesPage(1);
      } else {
        setTrackedSites(prev => [...prev, ...newLogs]);
        setTrackedSitesPage(page + 1);
      }

      setHasMoreTrackedSites(newLogs.length === limit);
    } catch (error) {
      console.error('Failed to fetch tracked sites:', error);
    } finally {
      setIsLoadingTrackedSites(false);
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
      const systemData = systemsData.find(s => s.solarSystemName.toLowerCase() === selectedSystem.toLowerCase());
      
      await db.execute(
        `INSERT INTO anom_logs (
          site_type, was_ded_escalation, was_occ_mine_escalation, was_cap_stag_escalation,
          was_shld_starb_escalation, was_attack_site_escalation, was_faction_npc_spawn,
          was_capital_spawn, was_faction_capital_spawn, was_titan_spawn,
          location_region, location_system, location_security
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          siteType,
          toggles.was_ded_escalation ? 1 : 0,
          toggles.was_occ_mine_escalation ? 1 : 0,
          toggles.was_cap_stag_escalation ? 1 : 0,
          toggles.was_shld_starb_escalation ? 1 : 0,
          toggles.was_attack_site_escalation ? 1 : 0,
          toggles.was_faction_npc_spawn ? 1 : 0,
          toggles.was_capital_spawn ? 1 : 0,
          toggles.was_faction_capital_spawn ? 1 : 0,
          toggles.was_titan_spawn ? 1 : 0,
          systemData?.regionName || null,
          selectedSystem || null,
          systemData?.security !== undefined ? systemData.security.toString() : null
        ]
      );

      // Reset toggles
      setToggles({
        was_ded_escalation: false,
        was_occ_mine_escalation: false,
        was_cap_stag_escalation: false,
        was_shld_starb_escalation: false,
        was_attack_site_escalation: false,
        was_faction_npc_spawn: false,
        was_capital_spawn: false,
        was_faction_capital_spawn: false,
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
      setTrackedSites(prev => prev.filter(log => log.id !== logToDelete));
      
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
    if (log.was_ded_escalation === 1) icons.push({ label: 'DED-SITE', color: 'green' });
    if (log.was_occ_mine_escalation === 1) icons.push({ label: 'OCC-MINE', color: 'green' });
    if (log.was_cap_stag_escalation === 1) icons.push({ label: 'CAP-STG', color: 'green' });
    if (log.was_shld_starb_escalation === 1) icons.push({ label: 'SHLD-STRB', color: 'green' });
    if (log.was_attack_site_escalation === 1) icons.push({ label: 'ATTK-SITE', color: 'green' });
    if (log.was_faction_npc_spawn === 1) icons.push({ label: 'FAC-SUB', color: 'blue' });
    if (log.was_capital_spawn === 1) icons.push({ label: 'CAP', color: 'blue' });
    if (log.was_faction_capital_spawn === 1) icons.push({ label: 'FAC-CAP', color: 'blue' });
    if (log.was_titan_spawn === 1) icons.push({ label: 'TITAN', color: 'blue' });
    return icons;
  };

  const isLandscape = settings.orientation === 'landscape';
  const isStatistics = currentView === 'statistics';
  const isSettings = currentView === 'settings';
  const appWidth = isStatistics ? 800 : (isLandscape ? 700 : 360);
  const appHeight = isCollapsed ? 28 : (isStatistics ? 825 : (isLandscape ? 450 : 725));

  return (
    <div 
      className="bg-[#0a0a0a] text-gray-300 font-sans flex flex-col overflow-hidden select-none origin-top-left outline-none relative"
      style={{ 
        width: `${appWidth}px`, 
        height: `${appHeight}px`,
        transform: `scale(${(isStatistics || isSettings) ? 1 : settings.globalScale})`, 
        opacity: (isStatistics || isSettings) ? 1.0 : settings.windowOpacity,
        border: '1px solid #0a0a0a',
        boxSizing: 'border-box',
        boxShadow: 'none'
      }}
    >
      {isAppReady ? (
        <>
          <Titlebar isCollapsed={isCollapsed} onToggleCollapse={() => setIsCollapsed(!isCollapsed)} />
          <header className="px-4 py-2 border-b border-[#f0b419]/10 flex justify-between items-center relative z-20 bg-[#0a0a0a]">
            <div className="flex space-x-6">
              <button 
                onClick={() => setCurrentView('combat')}
                className={`text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${currentView === 'combat' ? 'text-[#f0b419]' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Combat Log
              </button>
              <button 
                onClick={() => setCurrentView('statistics')}
                className={`text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${currentView === 'statistics' ? 'text-[#f0b419]' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Statistics
              </button>
            </div>
            <button 
              onClick={() => setCurrentView('settings')}
              className={`transition-colors p-1 ${currentView === 'settings' ? 'text-[#f0b419]' : 'text-gray-500 hover:text-[#f0b419]'}`}
              title="Settings"
            >
              <SettingsIcon size={18} />
            </button>
          </header>

          <div className="flex-1 flex flex-col p-4 overflow-hidden relative">
            {currentView === 'combat' && (
              <div className={`flex-1 flex ${isLandscape ? 'flex-row space-x-6' : 'flex-col'} overflow-hidden`}>
                <div className={isLandscape ? 'w-1/2 flex flex-col' : ''}>
                  {!isLandscape && (
                    <div className="mb-4">
                      {settings.preferredSystems.length > 0 ? (
                        <div className="flex space-x-3">
                          <div className="w-[40%]">
                            <label className="block text-xs font-semibold text-[#f0b419] uppercase tracking-wider mb-2">
                              System
                            </label>
                            <select
                              value={selectedSystem}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSelectedSystem(val);
                                localStorage.setItem('anomtracker_selected_system', val);
                              }}
                              className="w-full bg-[#141414] border border-[#f0b419]/50 text-white p-2 rounded focus:outline-none focus:border-[#f0b419] focus:ring-1 focus:ring-[#f0b419] appearance-none"
                            >
                              <option value="">Select...</option>
                              {settings.preferredSystems.map((sys) => (
                                <option key={sys} value={sys}>
                                  {sys}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="w-[60%]">
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
                        </div>
                      ) : (
                        <div>
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
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-[#00ff7f]/70 uppercase tracking-widest mb-1 border-b border-[#00ff7f]/20 pb-1">Escalations</div>
                      <ToggleButton
                        label="DED Site"
                        active={toggles.was_ded_escalation}
                        onClick={() => toggleState('was_ded_escalation')}
                        color="green"
                      />
                      <ToggleButton
                        label="Occupied Mine"
                        active={toggles.was_occ_mine_escalation}
                        onClick={() => toggleState('was_occ_mine_escalation')}
                        color="green"
                      />
                      <ToggleButton
                        label="Capital Staging"
                        active={toggles.was_cap_stag_escalation}
                        onClick={() => toggleState('was_cap_stag_escalation')}
                        color="green"
                      />
                      <ToggleButton
                        label="Shielded Starbase"
                        active={toggles.was_shld_starb_escalation}
                        onClick={() => toggleState('was_shld_starb_escalation')}
                        color="green"
                      />
                      <ToggleButton
                        label="Attack Site"
                        active={toggles.was_attack_site_escalation}
                        onClick={() => toggleState('was_attack_site_escalation')}
                        color="green"
                      />
                    </div>
                    <div className="space-y-3">
                      <div className="text-[10px] font-bold text-[#00e5ff]/70 uppercase tracking-widest mb-1 border-b border-[#00e5ff]/20 pb-1">Special Spawns</div>
                      <ToggleButton
                        label="Faction Subcapital"
                        active={toggles.was_faction_npc_spawn}
                        onClick={() => toggleState('was_faction_npc_spawn')}
                        color="blue"
                      />
                      <ToggleButton
                        label="Capital"
                        active={toggles.was_capital_spawn}
                        onClick={() => toggleState('was_capital_spawn')}
                        color="blue"
                      />
                      <ToggleButton
                        label="Faction Capital"
                        active={toggles.was_faction_capital_spawn}
                        onClick={() => toggleState('was_faction_capital_spawn')}
                        color="blue"
                      />
                      <ToggleButton
                        label="Titan"
                        active={toggles.was_titan_spawn}
                        onClick={() => toggleState('was_titan_spawn')}
                        color="blue"
                      />
                    </div>
                  </div>

                  {!isLandscape && (
                    <button
                      onClick={logSite}
                      disabled={!db}
                      className="w-full py-3 bg-[#141414] border-2 border-[#f0b419] text-[#f0b419] font-bold text-lg uppercase tracking-widest rounded hover:bg-[#f0b419] hover:text-[#0a0a0a] transition-all duration-200 shadow-[0_0_15px_rgba(240,180,25,0.3)] hover:shadow-[0_0_25px_rgba(240,180,25,0.6)] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                    >
                      Log Site
                    </button>
                  )}
                </div>

                <div className={`flex-1 flex flex-col overflow-hidden ${isLandscape ? 'border-l border-gray-800 pl-4' : ''}`}>
                  {isLandscape && (
                    <div className="space-y-4 mb-4">
                      {settings.preferredSystems.length > 0 ? (
                        <div className="flex space-x-3">
                          <div className="w-[40%]">
                            <label className="block text-xs font-semibold text-[#f0b419] uppercase tracking-wider mb-2">
                              System
                            </label>
                            <select
                              value={selectedSystem}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSelectedSystem(val);
                                localStorage.setItem('anomtracker_selected_system', val);
                              }}
                              className="w-full bg-[#141414] border border-[#f0b419]/50 text-white p-2 rounded focus:outline-none focus:border-[#f0b419] focus:ring-1 focus:ring-[#f0b419] appearance-none"
                            >
                              <option value="">Select...</option>
                              {settings.preferredSystems.map((sys) => (
                                <option key={sys} value={sys}>
                                  {sys}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="w-[60%]">
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
                        </div>
                      ) : (
                        <div>
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
                      )}
                      <button
                        onClick={logSite}
                        disabled={!db}
                        className="w-full py-3 bg-[#141414] border-2 border-[#f0b419] text-[#f0b419] font-bold text-lg uppercase tracking-widest rounded hover:bg-[#f0b419] hover:text-[#0a0a0a] transition-all duration-200 shadow-[0_0_15px_rgba(240,180,25,0.3)] hover:shadow-[0_0_25px_rgba(240,180,25,0.6)] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                      >
                        Log Site
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3 border-b border-[#f0b419]/30 pb-1">
                    <h2 className="text-xs font-semibold text-[#f0b419] uppercase tracking-wider flex items-center">
                      Recent History
                      <span className="text-gray-500 ml-2 font-normal">| {recentCount} SITES</span>
                    </h2>
                    <button
                      onClick={() => setIsHistoryModalOpen(true)}
                      className="text-xs text-gray-400 hover:text-[#f0b419] transition-colors cursor-pointer"
                    >
                      View
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2">
                    {history.length === 0 ? (
                      <p className="text-xs text-gray-500 italic text-center py-4">
                        No sites logged yet.
                      </p>
                    ) : (
                      history.map((log) => {
                        const dateObj = new Date(log.timestamp + 'Z');
                        const timeStr = isNaN(dateObj.getTime())
                          ? log.timestamp.split(' ')[1] || log.timestamp
                          : format(dateObj, 'HH:mm:ss');
                        
                        const icons = getActiveIcons(log);

                        return (
                          <div
                            key={log.id}
                            className="flex items-center justify-between bg-[#141414] border border-gray-800 p-2 rounded text-xs group"
                          >
                            <div className="flex-1 truncate pr-2">
                              <span className="text-gray-500 mr-2">[{timeStr}]</span>
                              <span className="text-gray-200 font-medium">
                                {log.location_system ? `${log.location_system} - ` : ''}{log.site_type}
                              </span>
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
                              className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                              title="Delete log"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentView === 'statistics' && stats && (
              <div className="flex-1 overflow-y-auto pt-[5px] px-6 pb-2 space-y-6 animate-in fade-in duration-500">
                {/* Filter Header */}
                <div className="flex items-center justify-end mb-2 space-x-6">
                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Site:</span>
                    <select
                      value={statsFilter}
                      onChange={(e) => setStatsFilter(e.target.value)}
                      className="bg-[#141414] border border-[#f0b419]/30 text-[#f0b419] text-xs p-2 rounded focus:outline-none focus:border-[#f0b419] min-w-[150px]"
                    >
                      <option value="All">All Sites</option>
                      {siteTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Date:</span>
                    <select
                      value={dateRangeType}
                      onChange={(e) => setDateRangeType(e.target.value as any)}
                      className="bg-[#141414] border border-[#f0b419]/30 text-[#f0b419] text-xs p-2 rounded focus:outline-none focus:border-[#f0b419] min-w-[120px]"
                    >
                      <option value="All">All Time</option>
                      <option value="Today">Today</option>
                       <option value="Yesterday">Yesterday</option>
                       <option value="Week">Last Week</option>
                       <option value="Month">Last Month</option>
                       <option value="Custom">Custom Range</option>
                     </select>
                   </div>
 
                   {dateRangeType === 'Custom' && (
                     <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-2 duration-300">
                       <div className="relative group">
                         <input
                           type="date"
                           value={customStartDate}
                           onChange={(e) => setCustomStartDate(e.target.value)}
                           className="absolute inset-0 opacity-0 cursor-pointer z-10"
                         />
                         <div className="bg-[#141414] border border-[#f0b419]/30 text-[#f0b419] text-[10px] p-1.5 rounded w-[89px] flex justify-between items-center group-hover:border-[#f0b419] transition-colors">
                           <span>{customStartDate ? formatLocalDate(customStartDate) : 'From...'}</span>
                           <Calendar size={10} className="opacity-50" />
                         </div>
                       </div>
                       <span className="text-gray-500 text-[10px]">to</span>
                       <div className="relative group">
                         <input
                           type="date"
                           value={customEndDate}
                           onChange={(e) => setCustomEndDate(e.target.value)}
                           className="absolute inset-0 opacity-0 cursor-pointer z-10"
                         />
                         <div className="bg-[#141414] border border-[#f0b419]/30 text-[#f0b419] text-[10px] p-1.5 rounded w-[89px] flex justify-between items-center group-hover:border-[#f0b419] transition-colors">
                           <span>{customEndDate ? formatLocalDate(customEndDate) : 'To...'}</span>
                           <Calendar size={10} className="opacity-50" />
                         </div>
                       </div>
                     </div>
                   )}
                 </div>

                {/* Header Stats */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-[#141414] border border-[#f0b419]/30 p-5 rounded-xl relative overflow-hidden group flex flex-col justify-between min-h-[135px]">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                      <BarChart2 size={48} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-[#f0b419] uppercase tracking-[0.2em] mb-2">Total Sites Tracked</div>
                      <div className="text-5xl font-black text-white tracking-tighter">
                        {stats.totalSites}
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button 
                        onClick={() => {
                          setIsTrackedSitesModalOpen(true);
                          fetchTrackedSites(true);
                        }}
                        className="text-[10px] font-bold text-[#f0b419] hover:text-white transition-colors uppercase tracking-widest flex items-center space-x-1 p-2 -mr-2 -mb-2 cursor-pointer"
                      >
                        <span>View</span>
                        <ExternalLink size={10} />
                      </button>
                    </div>
                  </div>
                  <div className="bg-[#141414] border border-[#f0b419]/30 p-5 rounded-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Activity size={48} />
                    </div>
                    <div className="text-xs font-bold text-[#f0b419] uppercase tracking-[0.2em] mb-2">Special Outcome %</div>
                    <div className="text-5xl font-black text-white tracking-tighter">
                      {stats.totalSites > 0 ? ((stats.successfulSites / stats.totalSites) * 100).toFixed(1) : '0.0'}%
                    </div>
                  </div>
                </div>

                {/* Escalations Section */}
                <section>
                  {(() => {
                    const totalEsc = stats.escalations.ded + stats.escalations.occupiedMine + stats.escalations.capitalStaging + stats.escalations.shieldedStarbase + stats.escalations.attackSite;
                    const escPerc = stats.totalSites > 0 ? ((totalEsc / stats.totalSites) * 100).toFixed(1) : '0.0';
                    return (
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="flex items-baseline space-x-2">
                          <h3 className="text-sm font-bold text-[#00ff7f] uppercase tracking-[0.3em]">Escalations</h3>
                          <span className="text-[10px] font-mono text-[#00ff7f]/60 uppercase tracking-widest">
                            | {totalEsc} Total ({escPerc}%)
                          </span>
                        </div>
                        <div className="flex-1 h-[1px] bg-gradient-to-r from-[#00ff7f]/30 to-transparent"></div>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-3 gap-4">
                    <StatCard label="DED Site" count={stats.escalations.ded} total={stats.totalSites} color="green" />
                    <StatCard label="Occupied Mine" count={stats.escalations.occupiedMine} total={stats.totalSites} color="green" />
                    <StatCard label="Attack Site" count={stats.escalations.attackSite} total={stats.totalSites} color="green" highlighted={true} className="row-span-2" />
                    <StatCard label="Capital Staging" count={stats.escalations.capitalStaging} total={stats.totalSites} color="green" />
                    <StatCard label="Shielded Starbase" count={stats.escalations.shieldedStarbase} total={stats.totalSites} color="green" />
                  </div>
                </section>

                {/* Special Spawns Section */}
                <section>
                  {(() => {
                    const totalSpawns = stats.specialSpawns.factionSubcap + stats.specialSpawns.capital + stats.specialSpawns.factionCapital + stats.specialSpawns.titan;
                    const spawnPerc = stats.totalSites > 0 ? ((totalSpawns / stats.totalSites) * 100).toFixed(1) : '0.0';
                    return (
                      <div className="flex items-center space-x-4 mb-4">
                        <div className="flex items-baseline space-x-2">
                          <h3 className="text-sm font-bold text-[#00e5ff] uppercase tracking-[0.3em]">Special Spawns</h3>
                          <span className="text-[10px] font-mono text-[#00e5ff]/60 uppercase tracking-widest">
                            | {totalSpawns} Total ({spawnPerc}%)
                          </span>
                        </div>
                        <div className="flex-1 h-[1px] bg-gradient-to-r from-[#00e5ff]/30 to-transparent"></div>
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-4 gap-4">
                    <StatCard label="Faction Subcapital" count={stats.specialSpawns.factionSubcap} total={stats.totalSites} color="blue" />
                    <StatCard label="Capital" count={stats.specialSpawns.capital} total={stats.totalSites} color="blue" />
                    <StatCard label="Faction Capital" count={stats.specialSpawns.factionCapital} total={stats.totalSites} color="blue" />
                    <StatCard label="Titan" count={stats.specialSpawns.titan} total={stats.totalSites} color="blue" />
                  </div>
                </section>

                {/* 30 Day Activity Chart */}
                <section>
                  <div className="flex items-center w-full mb-3">
                    <h3 className="text-[9px] font-bold text-[#f0b419] uppercase tracking-[0.3em] pr-3 whitespace-nowrap opacity-80">Last 30 Days Activity</h3>
                    <div className="flex-1 h-[1px] bg-gradient-to-r from-[#f0b419]/50 to-transparent"></div>
                  </div>
                  <div className="bg-transparent px-1">
                    <div className="h-[80px] flex items-end space-x-1">
                      {(() => {
                        const days = Array.from({ length: 30 }).map((_, i) => {
                           const d = new Date();
                           d.setDate(d.getDate() - (29 - i));
                           return format(d, 'yyyy-MM-dd');
                        });
                        const maxCount = Math.max(...dailyStats.map(d => d.count), 1);
                        
                         return days.map((dayStr, index) => {
                           const stat = dailyStats.find(s => s.date === dayStr);
                           const count = stat ? stat.count : 0;
                           const maxCountVal = Math.max(...dailyStats.map(d => d.count), 1);
                           const heightPerc = (count / maxCountVal) * 100;
                           
                           const isLeftEdge = index === 0;
                           const isRightEdge = index === 29;
                           
                           return (
                             <div 
                               key={dayStr} 
                               className="flex-1 flex flex-col justify-end items-center group relative h-full cursor-pointer"
                               onClick={() => {
                                 setDateRangeType('Custom');
                                 setCustomStartDate(dayStr);
                                 setCustomEndDate(dayStr);
                               }}
                             >
                               <div className={`absolute -top-16 ${isLeftEdge ? 'left-0' : isRightEdge ? 'right-0' : 'left-1/2 -translate-x-1/2'} bg-[#1a1a1a] border border-[#f0b419]/50 text-[#f0b419] text-[10px] px-3 py-2 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap z-20 pointer-events-none shadow-2xl transition-all duration-300 transform group-hover:-translate-y-1 flex flex-col ${isLeftEdge ? 'items-start' : isRightEdge ? 'items-end' : 'items-center'} min-w-[120px]`}>
                                <span className="font-bold border-b border-[#f0b419]/30 pb-1 mb-1 w-full text-center">{format(new Date(dayStr), 'EEEE, MMM dd')}</span>
                                <div className="flex flex-col w-full space-y-0.5">
                                  <div className="flex justify-between items-center space-x-4">
                                    <span className="text-gray-400 text-[9px]">Total Sites:</span>
                                    <span className="font-bold">{count}</span>
                                  </div>
                                  <div className="flex justify-between items-center space-x-4 text-[#00ff7f]">
                                    <span className="opacity-70 text-[9px]">Escalations:</span>
                                    <span className="font-bold">{stat?.escalations || 0}</span>
                                  </div>
                                  <div className="flex justify-between items-center space-x-4 text-[#00e5ff]">
                                    <span className="opacity-70 text-[9px]">Special Spawns:</span>
                                    <span className="font-bold">{stat?.spawns || 0}</span>
                                  </div>
                                </div>
                              </div>
                              {count > 0 && (
                                <div className="text-[9px] font-bold text-[#f0b419]/70 group-hover:text-[#f0b419] mb-1 transition-colors z-10">
                                  {count}
                                </div>
                              )}
                              <div 
                                className={`w-full transition-all duration-300 rounded-t-[2px] ${count > 0 ? 'bg-[#f0b419]/60 group-hover:bg-[#f0b419] shadow-[0_0_8px_rgba(240,180,25,0.4)]' : 'bg-[#f0b419]/10'}`}
                                style={{ height: count > 0 ? `${Math.max(heightPerc, 8)}%` : '2px' }}
                              ></div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {currentView === 'settings' && (
              <Settings settings={settings} onSettingsChange={saveSettings} showToast={showToast} />
            )}

            {dbError && (
              <div className="bg-red-900/50 text-red-200 p-2 text-xs rounded mt-4 border border-red-500/50">
                DB Error: {dbError}
              </div>
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

      {/* Tracked Sites Modal */}
      {isTrackedSitesModalOpen && (
        <div className="fixed inset-0 bg-[#0a0a0a]/95 backdrop-blur-sm flex flex-col z-40">
          <div className="p-4 border-b border-[#f0b419]/30 flex justify-between items-center bg-[#0a0a0a]">
            <div className="flex items-baseline space-x-3">
              <h2 className="text-lg font-bold text-[#f0b419] uppercase tracking-wider">
                Tracked Sites
              </h2>
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                | Filter: {statsFilter}
              </span>
            </div>
            <button
              onClick={() => setIsTrackedSitesModalOpen(false)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>
          <div 
            className="flex-1 overflow-y-auto p-4 space-y-2"
            onScroll={(e) => {
              const target = e.currentTarget;
              if (target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
                fetchTrackedSites();
              }
            }}
          >
            {trackedSites.length === 0 && !isLoadingTrackedSites ? (
              <p className="text-sm text-gray-500 italic text-center py-8">
                No sites tracked yet.
              </p>
            ) : (
              <>
                {trackedSites.map((log) => {
                  const dateObj = new Date(log.timestamp + 'Z');
                  const timeStr = isNaN(dateObj.getTime())
                    ? log.timestamp
                    : format(dateObj, 'MMM dd HH:mm:ss');
                  
                  const icons = getActiveIcons(log);

                  return (
                    <div
                      key={log.id}
                      className="flex items-center justify-between bg-[#141414] border border-gray-800 p-2 rounded text-xs group"
                    >
                      <div className="flex-1 truncate pr-2">
                        <span className="text-gray-500 mr-2">[{timeStr}]</span>
                        <span className="text-gray-200 font-medium">
                          {log.location_system ? `${log.location_system} - ` : ''}{log.site_type}
                        </span>
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
                        className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                        title="Delete log"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                {isLoadingTrackedSites && (
                  <div className="text-center py-4">
                    <div className="inline-block w-4 h-4 border-2 border-[#f0b419] border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* History Modal (Last 12h) */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-[#0a0a0a]/95 backdrop-blur-sm flex flex-col z-40">
          <div className="p-4 border-b border-[#f0b419]/30 flex justify-between items-center bg-[#0a0a0a]">
            <div className="flex items-baseline space-x-3">
              <h2 className="text-lg font-bold text-[#f0b419] uppercase tracking-wider">
                Recent History
              </h2>
              <span className="text-xs font-mono text-gray-500 uppercase tracking-widest">
                | Last 12 Hours
              </span>
            </div>
            <button
              onClick={() => setIsHistoryModalOpen(false)}
              className="text-gray-400 hover:text-white transition-colors p-1"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {fullHistory.length === 0 ? (
              <p className="text-sm text-gray-500 italic text-center py-8">
                No sites logged in the last 12 hours.
              </p>
            ) : (
              fullHistory.map((log) => {
                const dateObj = new Date(log.timestamp + 'Z');
                const timeStr = isNaN(dateObj.getTime())
                  ? log.timestamp
                  : format(dateObj, 'HH:mm:ss');
                
                const icons = getActiveIcons(log);

                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between bg-[#141414] border border-gray-800 p-2 rounded text-xs group"
                  >
                    <div className="flex-1 truncate pr-2">
                      <span className="text-gray-500 mr-2">[{timeStr}]</span>
                      <span className="text-gray-200 font-medium">
                        {log.location_system ? `${log.location_system} - ` : ''}{log.site_type}
                      </span>
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
                      className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 p-1"
                      title="Delete log"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      </>
      ) : (
        <Splash />
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
