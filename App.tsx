
import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Correctly import Firebase modular SDK functions from the main entry point.
import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  updateDoc
} from 'firebase/firestore';
// Import types as 'import type' to avoid issues with some TypeScript compiler configurations.
import type { Firestore } from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged
} from 'firebase/auth';
import type { User, Auth } from 'firebase/auth';
import { 
  Users, 
  Trophy, 
  TrendingUp, 
  UserPlus, 
  ChevronRight, 
  ChevronLeft,
  Search,
  Award,
  AlertCircle,
  Loader2,
  Cloud,
  CloudOff,
  Sparkles,
  Download,
  Save
} from 'lucide-react';
import { 
  INITIAL_STUDENTS, 
  SC_TARGET, 
  TOTAL_WEEKS, 
  MEETING_GOAL, 
  WEEK_DATES 
} from './constants';
import { Student, ProcessedStudent } from './types';
import { getAIInsights } from './services/geminiService';

// --- Firebase Initialization Helper ---
const getFirebaseConfig = () => {
  const config = (window as any).__firebase_config 
    ? JSON.parse((window as any).__firebase_config) 
    : null;
  
  // Only return config if it doesn't look like placeholder data
  if (config && config.apiKey && config.apiKey !== "DEMO_KEY") {
    return config;
  }
  return null;
};

const fConfig = getFirebaseConfig();
let db: Firestore | null = null;
let auth: Auth | null = null;

if (fConfig) {
  try {
    // Correctly check if Firebase is already initialized to prevent errors in hot-reload environments.
    const app = !getApps().length ? initializeApp(fConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (e) {
    console.error("Firebase Init Error:", e);
  }
}

const appId = (window as any).__app_id || 'q1-sprint-v1';
const LOCAL_STORAGE_KEY = `q1_sprint_data_${appId}`;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCloudMode, setIsCloudMode] = useState(!!db);
  const [aiInsights, setAiInsights] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState(false);

  // 1. Initialize Authentication (Cloud Mode Only)
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Synchronization (Hybrid Mode)
  useEffect(() => {
    // CLOUD MODE: Listen to Firestore
    if (db) {
      const statsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'stats');
      const unsubscribe = onSnapshot(statsCollection, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
        if (data.length === 0) {
          // Initialize if empty
          INITIAL_STUDENTS.forEach(async (student) => {
            if (db) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stats', student.id), {
                name: student.name,
                manager: student.manager,
                totalSC: 0,
                weeklyData: Array.from({ length: TOTAL_WEEKS }, () => ({
                  meetings: 0,
                  effectiveMeetings: 0,
                  hasNewClient: false,
                }))
              });
            }
          });
        } else {
          const sortedData = INITIAL_STUDENTS.map(initial => {
            const found = data.find(d => d.id === initial.id);
            return found || { ...initial, totalSC: 0, weeklyData: [] };
          }) as Student[];
          setStats(sortedData);
        }
        setLoading(false);
        setIsCloudMode(true);
      }, (err) => {
        console.warn("Firestore access restricted, switching to Local Mode:", err);
        setIsCloudMode(false);
        loadLocalData();
      });
      return () => unsubscribe();
    } else {
      // LOCAL MODE: Use Local Storage
      loadLocalData();
    }
  }, [user]);

  const loadLocalData = () => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      setStats(JSON.parse(saved));
    } else {
      const initial = INITIAL_STUDENTS.map(s => ({
        ...s,
        totalSC: 0,
        weeklyData: Array.from({ length: TOTAL_WEEKS }, () => ({
          meetings: 0,
          effectiveMeetings: 0,
          hasNewClient: false,
        }))
      }));
      setStats(initial);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initial));
    }
    setLoading(false);
    setIsCloudMode(false);
  };

  const updateStat = useCallback(async (id: string, field: string, value: any) => {
    const updatedStats = stats.map(s => {
      if (s.id !== id) return s;
      const newS = { ...s };
      if (field === 'totalSC') {
        newS.totalSC = Math.max(0, Number(value)) || 0;
      } else {
        const newWeekly = [...(newS.weeklyData || [])];
        const targetWeekData = { ...newWeekly[currentWeek - 1] };
        if (field === 'hasNewClient') {
          targetWeekData.hasNewClient = value;
        } else {
          (targetWeekData as any)[field] = Math.max(0, Number(value)) || 0;
        }
        newWeekly[currentWeek - 1] = targetWeekData;
        newS.weeklyData = newWeekly;
      }
      return newS;
    });

    setStats(updatedStats);

    // Persist to correct backend
    if (isCloudMode && db) {
      try {
        const studentDoc = doc(db, 'artifacts', appId, 'public', 'data', 'stats', id);
        const student = updatedStats.find(s => s.id === id);
        if (student) {
          await updateDoc(studentDoc, { 
            totalSC: student.totalSC, 
            weeklyData: student.weeklyData 
          });
        }
      } catch (e) {
        console.error("Cloud update failed, syncing to local:", e);
      }
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedStats));
  }, [stats, currentWeek, isCloudMode]);

  const processedStats = useMemo<ProcessedStudent[]>(() => {
    return stats.map(student => {
      const cumulativeEffective = student.weeklyData?.reduce((sum, w) => sum + (Number(w.effectiveMeetings) || 0), 0) || 0;
      return {
        ...student,
        cumulativeEffective,
        isAchiever: (student.totalSC || 0) >= SC_TARGET
      };
    });
  }, [stats]);

  const filteredStats = useMemo(() => {
    return processedStats.filter(s => 
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.manager?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [processedStats, searchTerm]);

  const fetchAIInsights = async () => {
    setLoadingAI(true);
    const insights = await getAIInsights(processedStats, currentWeek);
    setAiInsights(insights || '');
    setLoadingAI(false);
  };

  const exportCSV = () => {
    const headers = ["Name", "Manager", "Total SC", "Effective Meetings", "Goal Met"];
    const rows = processedStats.map(s => [
      s.name,
      s.manager,
      s.totalSC,
      s.cumulativeEffective,
      s.isAchiever ? "YES" : "NO"
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Q1_Sprint_Report_Week_${currentWeek}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-slate-600 font-semibold animate-pulse">正在加載進度...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-slate-900">
      {/* App Header */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black text-slate-800 tracking-tight">Q1 8.8萬 衝刺培育計劃</h1>
              {isCloudMode ? (
                <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-100 uppercase tracking-wider">
                  <Cloud size={12} /> Live Sync
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-100 uppercase tracking-wider">
                  <Save size={12} /> Local Save
                </div>
              )}
            </div>
            <p className="text-slate-500 text-sm font-medium">8週累積指標：20 次有效面談 | 目標 SC: $88,000</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button 
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-all font-bold shadow-sm text-xs"
            >
              <Download size={16} /> 導出報表
            </button>
            
            <div className="flex items-center gap-1 bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
              <button 
                onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
                className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-blue-600"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="px-4 text-center min-w-[140px]">
                <span className="block text-[10px] text-slate-400 font-black uppercase tracking-widest">WEEK {currentWeek}</span>
                <span className="text-sm font-bold text-blue-600 block leading-tight">{WEEK_DATES[currentWeek - 1]}</span>
              </div>
              <button 
                onClick={() => setCurrentWeek(Math.min(TOTAL_WEEKS, currentWeek + 1))}
                className="p-2 hover:bg-slate-50 rounded-xl transition-all text-slate-400 hover:text-blue-600"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Summary Grid */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4">
            <div className="bg-blue-50 p-3 rounded-2xl text-blue-600"><Users size={24} /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">參賽人數</p>
              <p className="text-2xl font-black text-slate-800">{INITIAL_STUDENTS.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4">
            <div className="bg-amber-50 p-3 rounded-2xl text-amber-600"><Trophy size={24} /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">SC 達標</p>
              <p className="text-2xl font-black text-amber-600">{processedStats.filter(s => s.isAchiever).length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-50 p-3 rounded-2xl text-emerald-600"><TrendingUp size={24} /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">全隊累積 SC</p>
              <p className="text-2xl font-black text-emerald-600">${processedStats.reduce((sum, s) => sum + (s.totalSC || 0), 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center gap-4">
            <div className="bg-violet-50 p-3 rounded-2xl text-violet-600"><Sparkles size={24} /></div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">AI 訓練洞察</p>
              <button 
                onClick={fetchAIInsights}
                disabled={loadingAI}
                className="text-xs font-bold text-violet-600 hover:underline disabled:opacity-50"
              >
                {loadingAI ? '分析中...' : '生成報告'}
              </button>
            </div>
          </div>
          {aiInsights && (
            <div className="absolute inset-0 bg-violet-600 p-4 flex items-center justify-center translate-y-full group-hover:translate-y-0 transition-transform cursor-pointer overflow-y-auto">
                <p className="text-[10px] text-white font-medium leading-relaxed">{aiInsights}</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Table */}
      <main className="max-w-7xl mx-auto">
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="relative w-full md:w-80 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="搜尋學員或經理..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-400 text-xs font-bold transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-black bg-white px-3 py-1.5 rounded-xl border border-slate-100">
              <AlertCircle size={14} className="text-blue-500" />
              <span className="uppercase tracking-widest">提示：修改數據後將自動保存</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                  <th className="px-6 py-4">學員 / Manager</th>
                  <th className="px-6 py-4">累積 SC ($)</th>
                  <th className="px-6 py-4">本週 (總/有效)</th>
                  <th className="px-6 py-4 text-center">新客</th>
                  <th className="px-6 py-4">面談進度 (20)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStats.map((student) => {
                  const currentW = student.weeklyData?.[currentWeek - 1] || { meetings: 0, effectiveMeetings: 0, hasNewClient: false };
                  const progressPct = Math.min((student.cumulativeEffective / MEETING_GOAL) * 100, 100);
                  
                  return (
                    <tr key={student.id} className={`group hover:bg-slate-50/50 transition-all ${student.isAchiever ? 'bg-amber-50/5' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow-sm transition-all group-hover:scale-105 ${student.isAchiever ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-slate-300'}`}>
                            {student.isAchiever ? <Award size={18} /> : student.name.charAt(0)}
                          </div>
                          <div>
                            <p className={`font-black text-sm ${student.isAchiever ? 'text-amber-800' : 'text-slate-800'}`}>{student.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{student.manager}</p>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                        <div className="relative max-w-[120px]">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                          <input 
                            type="number"
                            className={`w-full pl-6 pr-2 py-2 border-2 rounded-xl text-sm font-black focus:outline-none transition-all ${student.isAchiever ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-100 text-slate-700 focus:border-blue-400'}`}
                            value={student.totalSC || ''}
                            onChange={(e) => updateStat(student.id, 'totalSC', e.target.value)}
                          />
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                           <input 
                              type="number"
                              className="w-12 px-1 py-2 bg-white border-2 border-slate-100 rounded-xl text-xs font-bold text-center focus:border-blue-400 outline-none"
                              value={currentW.meetings || ''}
                              onChange={(e) => updateStat(student.id, 'meetings', e.target.value)}
                              placeholder="0"
                            />
                            <input 
                              type="number"
                              className="w-12 px-1 py-2 bg-blue-50 border-2 border-blue-50 rounded-xl text-xs text-center text-blue-700 font-black focus:border-blue-400 outline-none"
                              value={currentW.effectiveMeetings || ''}
                              onChange={(e) => updateStat(student.id, 'effectiveMeetings', e.target.value)}
                              placeholder="0"
                            />
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <button 
                          onClick={() => updateStat(student.id, 'hasNewClient', !currentW.hasNewClient)}
                          className={`p-2 rounded-xl transition-all border-2 ${currentW.hasNewClient ? 'bg-emerald-500 border-emerald-500 text-white shadow-md' : 'bg-white border-slate-50 text-slate-200 hover:text-slate-400'}`}
                        >
                          <UserPlus size={16} />
                        </button>
                      </td>

                      <td className="px-6 py-4 min-w-[160px]">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-end text-[10px] font-black">
                            <span className="text-slate-700">{student.cumulativeEffective} / {MEETING_GOAL}</span>
                            <span className={progressPct >= 100 ? 'text-emerald-500' : 'text-slate-400'}>{Math.round(progressPct)}%</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden p-0.5">
                            <div 
                              className={`h-full transition-all duration-700 rounded-full ${progressPct >= 100 ? 'bg-emerald-400' : 'bg-blue-400'}`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto mt-8 mb-4 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isCloudMode ? 'bg-emerald-500 animate-pulse' : 'bg-blue-500'}`}></div>
          <span>Mode: {isCloudMode ? 'Real-time Cloud Sync' : 'Offline Local Storage'}</span>
        </div>
        <div>Region 54 - Q1 Sprint培育計劃 © 2026</div>
      </footer>
    </div>
  );
};

export default App;
