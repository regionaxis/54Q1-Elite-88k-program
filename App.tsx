import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, collection, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  Users, Trophy, TrendingUp, UserPlus, ChevronRight, ChevronLeft,
  Search, Award, AlertCircle, Loader2, Cloud, CloudOff, Sparkles,
  Download, Upload, Save, LogOut, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { INITIAL_STUDENTS, SC_TARGET, TOTAL_WEEKS, MEETING_GOAL, WEEK_DATES } from './constants';
import { Student, ProcessedStudent } from './types';

const firebaseConfig = {
  apiKey: "AIzaSyBd-09Iw2nWR3zazM5TdswBSoxqWY-uYDg",
  authDomain: "q188000.firebaseapp.com",
  projectId: "q188000",
  storageBucket: "q188000.firebasestorage.app",
  messagingSenderId: "458229118195",
  appId: "1:458229118195:web:7961cdaaedabe53b853386",
  measurementId: "G-CJ5FZWLS13"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

const LOCAL_STORAGE_KEY = `q1_sprint_data_v1`;

const App: React.FC = () => {
  const [role, setRole] = useState<'admin' | 'candidate' | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCloudMode, setIsCloudMode] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  useEffect(() => {
    signInAnonymously(auth).catch(err => console.error("Auth Error:", err));
    
    // Listen to 'stats' collection directly
    const statsCollection = collection(db, 'stats');
    const unsubscribe = onSnapshot(statsCollection, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Student));
      
      if (data.length === 0) {
        INITIAL_STUDENTS.forEach(async (s) => {
          await setDoc(doc(db, 'stats', s.id), {
            name: s.name, manager: s.manager, totalSC: 0,
            weeklyData: Array.from({ length: TOTAL_WEEKS }, () => ({ meetings: 0, effectiveMeetings: 0, hasNewClient: false }))
          });
        });
      } else {
        const sortedData = INITIAL_STUDENTS.map(initial => {
          const found = data.find(d => d.id === initial.id);
          return found || { ...initial, totalSC: 0, weeklyData: [] };
        }) as Student[];
        setStats(sortedData);
      }
      setIsCloudMode(true);
      setCloudError(null);
      setLoading(false);
    }, (err) => {
      console.error("Firestore Error:", err);
      setCloudError(err.message);
      setIsCloudMode(false);
      loadLocalData();
    });

    return () => unsubscribe();
  }, []);

  const loadLocalData = () => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) setStats(JSON.parse(saved));
    else {
      setStats(INITIAL_STUDENTS.map(s => ({
        ...s, totalSC: 0,
        weeklyData: Array.from({ length: TOTAL_WEEKS }, () => ({ meetings: 0, effectiveMeetings: 0, hasNewClient: false }))
      })));
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
        const target = { ...newWeekly[currentWeek - 1] };
        if (field === 'hasNewClient') target.hasNewClient = value;
        else (target as any)[field] = Math.max(0, Number(value)) || 0;
        newWeekly[currentWeek - 1] = target;
        newS.weeklyData = newWeekly;
      }
      return newS;
    });
    setStats(updatedStats);
    if (isCloudMode) {
      const student = updatedStats.find(s => s.id === id);
      if (student) await updateDoc(doc(db, 'stats', id), { totalSC: student.totalSC, weeklyData: student.weeklyData });
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedStats));
  }, [stats, currentWeek, isCloudMode, role, selectedStudentId]);

  const processedStats = useMemo(() => stats.map(s => ({
    ...s,
    cumulativeEffective: s.weeklyData?.reduce((sum, w) => sum + (Number(w.effectiveMeetings) || 0), 0) || 0,
    isAchiever: (s.totalSC || 0) >= SC_TARGET
  })), [stats]);

  const filteredStats = useMemo(() => {
    if (role === 'candidate' && selectedStudentId) return processedStats.filter(s => s.id === selectedStudentId);
    return processedStats.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [processedStats, searchTerm, role, selectedStudentId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl p-8">
          <Trophy className="text-blue-600 mx-auto mb-4" size={48} />
          <h1 className="text-2xl font-black text-center mb-8">Q1 衝刺計劃</h1>
          <button onClick={() => setRole('admin')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black mb-4">管理員入口</button>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {INITIAL_STUDENTS.map(s => (
              <button key={s.id} onClick={() => { setRole('candidate'); setSelectedStudentId(s.id); }} className="w-full p-3 border rounded-xl text-left hover:bg-blue-50">
                <p className="font-bold">{s.name}</p>
                <p className="text-xs text-slate-400">{s.manager}</p>
              </button>
            ))}
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
          <p className={`text-xs font-bold ${isCloudMode ? 'text-emerald-600' : 'text-blue-600'}`}>
            {isCloudMode ? '● 雲端同步中 (Live Sync)' : `● 本地儲存 (Offline)${cloudError ? ': ' + cloudError : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border">
          <button onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}><ChevronLeft/></button>
          <span className="font-black text-xs min-w-[100px] text-center">WEEK {currentWeek}</span>
          <button onClick={() => setCurrentWeek(Math.min(TOTAL_WEEKS, currentWeek + 1))}><ChevronRight/></button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto bg-white rounded-3xl border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black uppercase">
            <tr><th className="p-4">學員</th><th className="p-4">累積 SC</th><th className="p-4">本週面談</th><th className="p-4">進度</th></tr>
          </thead>
          <tbody>
            {filteredStats.map(s => {
              const week = s.weeklyData?.[currentWeek-1] || {meetings:0, effectiveMeetings:0};
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-4 font-bold text-sm">{s.name}<br/><span className="text-[10px] text-slate-400">{s.manager}</span></td>
                  <td className="p-4"><input type="number" className="w-24 p-2 border rounded-lg" value={s.totalSC} onChange={(e)=>updateStat(s.id, 'totalSC', e.target.value)}/></td>
                  <td className="p-4 flex gap-1">
                    <input type="number" className="w-12 p-2 border rounded-lg" value={week.meetings} onChange={(e)=>updateStat(s.id, 'meetings', e.target.value)}/>
                    <input type="number" className="w-12 p-2 border border-blue-200 bg-blue-50 rounded-lg font-bold" value={week.effectiveMeetings} onChange={(e)=>updateStat(s.id, 'effectiveMeetings', e.target.value)}/>
                  </td>
                  <td className="p-4"><div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="bg-blue-500 h-full" style={{width: `${(s.cumulativeEffective/20)*100}%`}}/></div></td>
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
