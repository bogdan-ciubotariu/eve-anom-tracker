import { useState, useEffect, ChangeEvent, useRef, MouseEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Database from '@tauri-apps/plugin-sql';
import { format } from 'date-fns';
import { Trash2, Menu, X, Crosshair, BarChart2, Settings as SettingsIcon, Minus, ChevronUp, ChevronDown, Activity } from 'lucide-react';
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

const StatCard = ({ label, count, total, color }: { label: string, count: number, total: number, color: 'green' | 'blue' }) => {
  const percentage = total > 0 ? ((count / total) * 100).toFixed(2) : '0.00';
  const colorClass = color === 'green' ? 'text-[#00ff7f]' : 'text-[#00e5ff]';
  const borderColor = color === 'green' ? 'border-[#00ff7f]/20' : 'border-[#00e5ff]/20';
  const bgHover = color === 'green' ? 'hover:bg-[#00ff7f]/5' : 'hover:bg-[#00e5ff]/5';

  return (
    <div className={`bg-[#141414] border ${borderColor} p-4 rounded-lg transition-all duration-200 ${bgHover} group`}>
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 group-hover:text-gray-400 transition-colors">
        {label}
      </div>
      <div className="flex items-baseline justify-between">
        <div className={`text-2xl font-bold ${colorClass}`}>
          {count}
        </div>
        <div className="text-xs font-mono text-gray-500">
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
        <span className="text-[10px] font-bold text-gray-500 tracking-[0.2em] uppercase pointer-events-none">
          EVE ANOMTRACKER
        </span>
      </div>

      {/* Window Controls */}
      <div className="flex h-full shrink-0">
        <button 
          onClick={onToggleCollapse}
          className="h-full px-3 flex items-center justify-center hover:bg-[#f0b419] hover:text-[#0a0a0a] transition-colors text-gray-500"
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

export default function App() {
  const [db, setDb] = useState<Database | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [currentView, setCurrentView] = useState<ViewState>('combat');
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  const siteTypes = settings.customSites
    ? settings.customSites.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_SITE_TYPES;

  const [siteType, setSiteType] = useState(siteTypes[0] || 'Other');
  const [history, setHistory] = useState<AnomLog[]>([]);
  const [fullHistory, setFullHistory] = useState<AnomLog[]>([]);
  const [recentCount, setRecentCount] = useState<number>(0);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
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
      if (isTauri) {
        await invoke('save_settings', { settings: JSON.stringify(newSettings) });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  const applySettings = async (s: AppSettings) => {
    try {
      if (isTauri) {
        let width = s.orientation === 'portrait' ? 360 : 650;
        let height = s.orientation === 'portrait' ? 725 : 450;
        
        if (currentView === 'statistics') {
          width = 800;
          height = 800;
        }
        
        if (isCollapsed) {
          height = 28;
        }

        await invoke('apply_window_settings', { 
          alwaysOnTop: s.alwaysOnTop,
          scale: s.globalScale,
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
      fetchStats(db);
    }
  }, [isCollapsed, currentView]);

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
              };
              this.logs.push(log);
            } else if (query.includes('DELETE FROM anom_logs')) {
              const id = bindValues![0];
              this.logs = this.logs.filter((l: AnomLog) => l.id !== id);
            }
            return { lastInsertId: this.idCounter, rowsAffected: 1 };
          },
          async select<T>(query: string, bindValues?: any[]): Promise<T> {
            const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
            const filtered = this.logs.filter((l: AnomLog) => l.timestamp >= twelveHoursAgo);

            if (query.includes('SUM(CASE WHEN')) {
              const total = this.logs.length;
              const successful = this.logs.filter(l => 
                l.was_ded_escalation === 1 || l.was_occ_mine_escalation === 1 || l.was_cap_stag_escalation === 1 || 
                l.was_shld_starb_escalation === 1 || l.was_attack_site_escalation === 1 || l.was_faction_npc_spawn === 1 || 
                l.was_capital_spawn === 1 || l.was_faction_capital_spawn === 1 || l.was_titan_spawn === 1
              ).length;
              
              return [{
                total,
                successful,
                ded: this.logs.filter(l => l.was_ded_escalation === 1).length,
                occ: this.logs.filter(l => l.was_occ_mine_escalation === 1).length,
                cap_stg: this.logs.filter(l => l.was_cap_stag_escalation === 1).length,
                shld: this.logs.filter(l => l.was_shld_starb_escalation === 1).length,
                atk: this.logs.filter(l => l.was_attack_site_escalation === 1).length,
                fac_sub: this.logs.filter(l => l.was_faction_npc_spawn === 1).length,
                cap: this.logs.filter(l => l.was_capital_spawn === 1).length,
                fac_cap: this.logs.filter(l => l.was_faction_capital_spawn === 1).length,
                titan: this.logs.filter(l => l.was_titan_spawn === 1).length
              }] as unknown as T;
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
        fetchStats(database);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const fetchStats = async (database: any) => {
    try {
      const result = await database.select(`
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
      `);
      
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
          site_type, was_ded_escalation, was_occ_mine_escalation, was_cap_stag_escalation,
          was_shld_starb_escalation, was_attack_site_escalation, was_faction_npc_spawn,
          was_capital_spawn, was_faction_capital_spawn, was_titan_spawn
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
  const appWidth = isStatistics ? 800 : (isLandscape ? 650 : 360);
  const appHeight = isCollapsed ? 28 : (isStatistics ? 800 : (isLandscape ? 450 : 725));

  return (
    <div 
      className="bg-[#0a0a0a] text-gray-300 font-sans flex flex-col overflow-hidden select-none origin-top-left outline-none relative"
      style={{ 
        width: `${appWidth}px`, 
        height: `${appHeight}px`,
        transform: `scale(${settings.globalScale})`, 
        opacity: settings.windowOpacity,
        border: '1px solid #0a0a0a',
        boxSizing: 'border-box',
        boxShadow: 'none'
      }}
    >
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
        {dbError && (
          <div className="bg-red-900/50 text-red-200 p-2 text-xs rounded mb-4 border border-red-500/50">
            DB Error: {dbError}
          </div>
        )}

        {currentView === 'combat' && (
          <div className={`flex-1 flex ${isLandscape ? 'flex-row space-x-6' : 'flex-col'} overflow-hidden`}>
            <div className={isLandscape ? 'w-1/2 flex flex-col' : ''}>
              {!isLandscape && (
                <div className="mb-4">
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
                <>
                  <div className="mb-4">
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
                  <button
                    onClick={logSite}
                    disabled={!db}
                    className="w-full py-3 bg-[#141414] border-2 border-[#f0b419] text-[#f0b419] font-bold text-lg uppercase tracking-widest rounded hover:bg-[#f0b419] hover:text-[#0a0a0a] transition-all duration-200 shadow-[0_0_15px_rgba(240,180,25,0.3)] hover:shadow-[0_0_25px_rgba(240,180,25,0.6)] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                  >
                    Log Site
                  </button>
                </>
              )}
              <div className="flex items-center justify-between mb-3 border-b border-[#f0b419]/30 pb-1">
                <h2 className="text-xs font-semibold text-[#f0b419] uppercase tracking-wider flex items-center">
                  Recent History
                  <span className="text-gray-500 ml-2 font-normal">| {recentCount} SITES</span>
                </h2>
                <button
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="text-xs text-gray-400 hover:text-[#f0b419] transition-colors"
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
                    // Handle SQLite date string
                    const dateObj = new Date(log.timestamp + 'Z'); // Append Z to force UTC parsing if SQLite returns UTC
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
          <div className="flex-1 overflow-y-auto p-6 space-y-8 animate-in fade-in duration-500">
            {/* Header Stats */}
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-[#141414] border border-[#f0b419]/30 p-6 rounded-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <BarChart2 size={48} />
                </div>
                <div className="text-xs font-bold text-[#f0b419] uppercase tracking-[0.2em] mb-2">Total Sites Tracked</div>
                <div className="text-5xl font-black text-white tracking-tighter">
                  {stats.totalSites}
                </div>
              </div>
              <div className="bg-[#141414] border border-[#f0b419]/30 p-6 rounded-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Activity size={48} />
                </div>
                <div className="text-xs font-bold text-[#f0b419] uppercase tracking-[0.2em] mb-2">Overall Success %</div>
                <div className="text-5xl font-black text-white tracking-tighter">
                  {stats.totalSites > 0 ? ((stats.successfulSites / stats.totalSites) * 100).toFixed(2) : '0.00'}%
                </div>
              </div>
            </div>

            {/* Escalations Section */}
            <section>
              <div className="flex items-center space-x-4 mb-4">
                <h3 className="text-sm font-bold text-[#00ff7f] uppercase tracking-[0.3em]">Escalations</h3>
                <div className="flex-1 h-[1px] bg-gradient-to-r from-[#00ff7f]/30 to-transparent"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard label="DED Site" count={stats.escalations.ded} total={stats.totalSites} color="green" />
                <StatCard label="Occupied Mine" count={stats.escalations.occupiedMine} total={stats.totalSites} color="green" />
                <StatCard label="Capital Staging" count={stats.escalations.capitalStaging} total={stats.totalSites} color="green" />
                <StatCard label="Shielded Starbase" count={stats.escalations.shieldedStarbase} total={stats.totalSites} color="green" />
                <StatCard label="Attack Site" count={stats.escalations.attackSite} total={stats.totalSites} color="green" />
              </div>
            </section>

            {/* Special Spawns Section */}
            <section>
              <div className="flex items-center space-x-4 mb-4">
                <h3 className="text-sm font-bold text-[#00e5ff] uppercase tracking-[0.3em]">Special Spawns</h3>
                <div className="flex-1 h-[1px] bg-gradient-to-r from-[#00e5ff]/30 to-transparent"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard label="Faction Subcapital" count={stats.specialSpawns.factionSubcap} total={stats.totalSites} color="blue" />
                <StatCard label="Capital" count={stats.specialSpawns.capital} total={stats.totalSites} color="blue" />
                <StatCard label="Faction Capital" count={stats.specialSpawns.factionCapital} total={stats.totalSites} color="blue" />
                <StatCard label="Titan" count={stats.specialSpawns.titan} total={stats.totalSites} color="blue" />
              </div>
            </section>
          </div>
        )}

        {currentView === 'settings' && (
          <Settings settings={settings} onSettingsChange={saveSettings} />
        )}
      </div>

      {/* Full History Modal */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-[#0a0a0a]/95 backdrop-blur-sm flex flex-col z-40">
          <div className="p-4 border-b border-[#f0b419]/30 flex justify-between items-center bg-[#0a0a0a]">
            <h2 className="text-lg font-bold text-[#f0b419] uppercase tracking-wider">
              Last 12 Hours History
            </h2>
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
