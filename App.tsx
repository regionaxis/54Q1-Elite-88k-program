import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getFirestore, doc, setDoc, onSnapshot, collection, updateDoc
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged
} from 'firebase/auth';
import type { User, Auth } from 'firebase/auth';
import { 
  Users, Trophy, TrendingUp, UserPlus, ChevronRight, ChevronLeft,
  Search, Award, AlertCircle, Loader2, Cloud, CloudOff, Sparkles,
  Download, Upload, Save, LogOut, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { 
  INITIAL_STUDENTS, SC_TARGET, TOTAL_WEEKS, MEETING_GOAL, WEEK_DATES 
} from './constants';
import { Student, ProcessedStudent } from './types';
import { getAIInsights } from './services/geminiService';

const getFirebaseConfig = () => ({
  apiKey: "AIzaSyBd-09Iw2nWR3zazM5TdswBSoxqWY-uYDg",
  authDomain: "q188000.firebaseapp.com",
  projectId: "q188000",
  storageBucket: "q188000.firebasestorage.app",
  messagingSenderId: "458229118195",
  appId: "1:458229118195:web:7961cdaaedabe53b853386",
  measurementId: "G-CJ5FZWLS13"
});

const fConfig = getFirebaseConfig();
let db: Firestore | null = null;
let auth: Auth | null = null;

try {
  const app = !getApps().length ? initializeApp(fConfig) : getApp();
  db = getFirestore(app);
  auth = getAuth(app);
} catch (e) {
  console.error("Firebase Init Error:", e);
}

const appId = 'q1-sprint-v1';
const LOCAL_STORAGE_KEY = `q1_sprint_data_${appId}`;

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'candidate' | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCloudMode, setIsCloudMode] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState(false);

  // 1. Auth
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(err => {
      console.error("Auth Error:", err);
      setCloudError("驗證失敗: 請確保 Firebase 已啟用匿名登錄");
    });
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // 2. Sync
  useEffect(() => {
    if (!db) {
      loadLocalData();
      return;
    }

    const statsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'stats');
    const unsubscribe = onSnapshot(statsCollection, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      if (data.length === 0) {
        INITIAL_STUDENTS.forEach(async (student) => {
          if (db) {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stats', student.id), {
              name: student.name,
              manager: student.manager,
              totalSC: 0,
              weeklyData: Array.from({ length: TOTAL_WEEKS }, () => ({
                meetings: 0, effectiveMeetings: 0, hasNewClient: false,
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
      setCloudError(null);
    }, (err) => {
      console.error("Firestore Error:", err);
      setCloudError(`同步失敗: ${err.message}`);
      setIsCloudMode(false);
      loadLocalData();
    });

    return () => unsubscribe();
  }, [user]);

  const loadLocalData = () => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) setStats(JSON.parse(saved));
    else {
      const initial = INITIAL_STUDENTS.map(s => ({
        ...s, totalSC: 0,
        weeklyData: Array.from({ length: TOTAL_WEEKS }, () => ({
          meetings: 0, effectiveMeetings: 0, hasNewClient: false,
        }))
      }));
      setStats(initial);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(initial));
    }
    setLoading(false);
  };

  const updateStat = useCallback(async (id: string, field: string, value: any) => {
    if (role === 'candidate' && selectedStudentId !== id) return;
    const updatedStats = stats.map(s => {
      if (s.id !== id) return s;
      const newS = { ...s };
      if (field === 'totalSC') newS.totalSC = Math.max(0, Number(value)) || 0;
      else {
        const newWeekly = [...(newS.weeklyData || [])];
        const targetWeekData = { ...newWeekly[currentWeek - 1] };
        if (field === 'hasNewClient') targetWeekData.hasNewClient = value;
        else (targetWeekData as any)[field] = Math.max(0, Number(value)) || 0;
        newWeekly[currentWeek - 1] = targetWeekData;
        newS.weeklyData = newWeekly;
      }
      return newS;
    });
    setStats(updatedStats);
    if (isCloudMode && db) {
      try {
        const studentDoc = doc(db, 'artifacts', appId, 'public', 'data', 'stats', id);
        const student = updatedStats.find(s => s.id === id);
        if (student) await updateDoc(studentDoc, { totalSC: student.totalSC, weeklyData: student.weeklyData });
      } catch (e) {
        console.error("Update Error:", e);
      }
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedStats));
  }, [stats, currentWeek, isCloudMode, role, selectedStudentId]);

  const processedStats = useMemo<ProcessedStudent[]>(() => {
    return stats.map(student => ({
      ...student,
      cumulativeEffective: student.weeklyData?.reduce((sum, w) => sum + (Number(w.effectiveMeetings) || 0), 0) || 0,
      isAchiever: (student.totalSC || 0) >= SC_TARGET
    }));
  }, [stats]);

  const filteredStats = useMemo(() => {
    if (role === 'candidate' && selectedStudentId) return processedStats.filter(s => s.id === selectedStudentId);
    return processedStats.filter(s => 
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.manager?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [processedStats, searchTerm, role, selectedStudentId]);

  const chartData = useMemo(() => processedStats.sort((a, b) => (b.totalSC || 0) - (a.totalSC || 0)).slice(0, 10).map(s => ({ name: s.name, sc: s.totalSC || 0 })), [processedStats]);

  const managerData = useMemo(() => {
    const managers: Record<string, any> = {};
    processedStats.forEach(s => {
      if (!managers[s.manager]) managers[s.manager] = { name: s.manager, totalSC: 0 };
      managers[s.manager].totalSC += (s.totalSC || 0);
    });
    return Object.values(managers).sort((a, b) => b.totalSC - a.totalSC);
  }, [processedStats]);

  const exportCSV = () => {
    const headers = ["Name", "Manager", "Total SC", "Effective Meetings", "Goal Met"];
    const rows = processedStats.map(s => [s.name, s.manager, s.totalSC, s.cumulativeEffective, s.isAchiever ? "YES" : "NO"]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Q1_Sprint_Report.csv`);
    link.click();
  };

  const importCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').map(line => line.split(','));
      const newStats = [...stats];
      for (let i = 1; i < lines.length; i++) {
        const [name, weekStr, meetings, effective, newClient, sc] = lines[i];
        if (!name) continue;
        const idx = newStats.findIndex(s => s.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (idx === -1) continue;
        const week = parseInt(weekStr);
        if (isNaN(week) || week < 1 || week > TOTAL_WEEKS) continue;
        const student = { ...newStats[idx] };
        const weeklyData = [...(student.weeklyData || [])];
        weeklyData[week - 1] = { meetings: parseInt(meetings) || 0, effectiveMeetings: parseInt(effective) || 0, hasNewClient: newClient?.trim().toUpperCase() === 'Y' };
        student.weeklyData = weeklyData;
        student.totalSC = (student.totalSC || 0) + (parseFloat(sc) || 0);
        newStats[idx] = student;
      }
      setStats(newStats);
      if (isCloudMode && db) {
        for (const s of newStats) {
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'stats', s.id);
          await updateDoc(docRef, { totalSC: s.totalSC, weeklyData: s.weeklyData });
        }
      }
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newStats));
      alert("數據導入成功！");
    };
    reader.readAsText(file);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl border border-slate-200 p-8">
          <div className="text-center mb-10">
            <Trophy className="text-blue-600 mx-auto mb-4" size={48} />
            <h1 className="text-2xl font-black">Q1 衝刺計劃</h1>
            <p className="text-slate-500">請選擇身份進入系統</p>
          </div>
          <div className="space-y-4">
            <button onClick={() => setRole('admin')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black flex items-center justify-center gap-2">管理員入口</button>
            <div className="text-center text-[10px] font-black text-slate-300">OR</div>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {INITIAL_STUDENTS.map(s => (
                <button key={s.id} onClick={() => { setRole('candidate'); setSelectedStudentId(s.id); }} className="w-full p-3 border rounded-xl text-left hover:bg-blue-50 transition-all">
                  <p className="font-bold">{s.name}</p>
                  <p className="text-[10px] text-slate-400">{s.manager}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2">
            {role === 'admin' ? '管理員總覽' : '個人進度'}
            <button onClick={() => setRole(null)} className="text-slate-300 hover:text-red-500"><LogOut size={16}/></button>
          </h1>
          <div className="flex flex-col">
            <p className={`text-xs font-bold ${isCloudMode ? 'text-emerald-600' : 'text-blue-600'}`}>
              {isCloudMode ? '🟢 雲端同步中 (Live Sync)' : '🔵 本地儲存 (Local Mode)'}
            </p>
            {cloudError && <p className="text-[10px] text-red-500 font-bold mt-1">{cloudError}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border">
          <button onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}><ChevronLeft/></button>
          <span className="font-black text-xs min-w-[100px] text-center">WEEK {currentWeek}</span>
          <button onClick={() => setCurrentWeek(Math.min(TOTAL_WEEKS, currentWeek + 1))}><ChevronRight/></button>
        </div>
        <div className="flex gap-2">
          {role === 'admin' && (
            <label className="p-2 bg-white border rounded-xl cursor-pointer hover:bg-slate-50"><Upload size={16}/><input type="file" className="hidden" onChange={importCSV}/></label>
          )}
          <button onClick={exportCSV} className="p-2 bg-white border rounded-xl"><Download size={16}/></button>
        </div>
      </header>

      {role === 'admin' && (
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-3xl border h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 10}} />
                  <Tooltip />
                  <Bar dataKey="sc" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
             </ResponsiveContainer>
          </div>
          <div className="bg-white p-6 rounded-3xl border h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={managerData} dataKey="totalSC" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {managerData.map((_, i) => <Cell key={i} fill={['#3b82f6', '#10b981', '#f59e0b'][i % 3]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
             </ResponsiveContainer>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto bg-white rounded-3xl border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black uppercase">
            <tr>
              <th className="p-4">學員</th>
              <th className="p-4">累積 SC</th>
              <th className="p-4">本週面談</th>
              <th className="p-4">進度</th>
            </tr>
          </thead>
          <tbody>
            {filteredStats.map(s => {
              const week = s.weeklyData?.[currentWeek-1] || {meetings:0, effectiveMeetings:0};
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-4 font-bold text-sm">{s.name}<br/><span className="text-[10px] text-slate-400">{s.manager}</span></td>
                  <td className="p-4"><input type="number" className="w-24 p-2 border rounded-lg text-sm" value={s.totalSC} onChange={(e)=>updateStat(s.id, 'totalSC', e.target.value)}/></td>
                  <td className="p-4 flex gap-1">
                    <input type="number" className="w-12 p-2 border rounded-lg text-xs" value={week.meetings} onChange={(e)=>updateStat(s.id, 'meetings', e.target.value)}/>
                    <input type="number" className="w-12 p-2 border border-blue-200 bg-blue-50 rounded-lg text-xs font-bold" value={week.effectiveMeetings} onChange={(e)=>updateStat(s.id, 'effectiveMeetings', e.target.value)}/>
                  </td>
                  <td className="p-4">
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full" style={{width: `${(s.cumulativeEffective/20)*100}%`}}/>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </main>
    </div>
  );
};

export default App;
