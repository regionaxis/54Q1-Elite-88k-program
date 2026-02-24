import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, setDoc, onSnapshot, collection, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { 
  Users, Trophy, TrendingUp, UserPlus, ChevronRight, ChevronLeft,
  Search, Award, AlertCircle, Loader2, Cloud, CloudOff, Sparkles,
  Download, Upload, Save, LogOut, BarChart3, PieChart as PieChartIcon
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { INITIAL_STUDENTS, SC_TARGET, TOTAL_WEEKS, MEETING_GOAL } from './constants';

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

const App: React.FC = () => {
  const [role, setRole] = useState<'admin' | 'candidate' | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCloudMode, setIsCloudMode] = useState(false);

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onSnapshot(collection(db, 'stats'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data.length === 0) {
        INITIAL_STUDENTS.forEach(async (s) => {
          await setDoc(doc(db, 'stats', s.id), {
            name: s.name, manager: s.manager, totalSC: 0,
            weeklyData: Array.from({ length: 8 }, () => ({ meetings: 0, effectiveMeetings: 0, hasNewClient: false }))
          });
        });
      } else {
        const sorted = INITIAL_STUDENTS.map(i => data.find(d => d.id === i.id) || { ...i, totalSC: 0, weeklyData: [] });
        setStats(sorted);
      }
      setIsCloudMode(true);
      setLoading(false);
    }, () => {
      setIsCloudMode(false);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const updateStat = useCallback(async (id: string, field: string, value: any) => {
    if (role === 'candidate' && selectedStudentId !== id) return;
    const updated = stats.map(s => {
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
    setStats(updated);
    if (isCloudMode) {
      const s = updated.find(x => x.id === id);
      await updateDoc(doc(db, 'stats', id), { totalSC: s.totalSC, weeklyData: s.weeklyData });
    }
  }, [stats, currentWeek, isCloudMode, role, selectedStudentId]);

  const processed = useMemo(() => stats.map(s => ({
    ...s,
    cumulativeEffective: s.weeklyData?.reduce((sum: number, w: any) => sum + (Number(w.effectiveMeetings) || 0), 0) || 0,
    isAchiever: (s.totalSC || 0) >= SC_TARGET
  })), [stats]);

  const filtered = useMemo(() => {
    if (role === 'candidate' && selectedStudentId) return processed.filter(s => s.id === selectedStudentId);
    return processed.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [processed, searchTerm, role, selectedStudentId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">
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
      <header className="max-w-7xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black">{role === 'admin' ? '管理員總覽' : '個人進度'}</h1>
          <p className="text-xs font-bold text-emerald-600">{isCloudMode ? '● 雲端同步中' : '● 離線模式'}</p>
        </div>
        <button onClick={() => setRole(null)} className="p-2 bg-white border rounded-xl"><LogOut size={16}/></button>
      </header>
      <main className="max-w-7xl mx-auto bg-white rounded-3xl border overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-[10px] font-black uppercase">
            <tr><th className="p-4">學員</th><th className="p-4">累積 SC</th><th className="p-4">本週面談</th><th className="p-4">進度</th></tr>
          </thead>
          <tbody>
            {filtered.map(s => {
              const week = s.weeklyData?.[currentWeek-1] || {meetings:0, effectiveMeetings:0};
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-4 font-bold text-sm">{s.name}</td>
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
