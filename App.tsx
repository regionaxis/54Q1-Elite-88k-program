import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  updateDoc
} from 'firebase/firestore';
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
  Save,
  Sparkles,
  Download,
  Upload,
  LogOut,
  BarChart3,
  PieChart as PieChartIcon,
  LayoutDashboard
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { 
  INITIAL_STUDENTS, 
  SC_TARGET, 
  TOTAL_WEEKS, 
  MEETING_GOAL, 
  WEEK_DATES 
} from './constants';
import { Student, ProcessedStudent } from './types';
import { getAIInsights } from './services/geminiService';

const getFirebaseConfig = () => {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBd-09Iw2nWR3zazM5TdswBSoxqWY-uYDg",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "q188000.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "q188000",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "q188000.firebasestorage.app",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "458229118195",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:458229118195:web:7961cdaaedabe53b853386",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-CJ5FZWLS13"
  };
};

const fConfig = getFirebaseConfig();
let db: Firestore | null = null;
let auth: Auth | null = null;

if (fConfig) {
  try {
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
  const [role, setRole] = useState<'admin' | 'candidate' | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCloudMode, setIsCloudMode] = useState(!!db);
  const [aiInsights, setAiInsights] = useState<string>('');
  const [loadingAI, setLoadingAI] = useState(false);

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(console.error);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (db) {
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
    if (role === 'candidate' && selectedStudentId !== id) return;

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
  }, [stats, currentWeek, isCloudMode, role, selectedStudentId]);

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
    if (role === 'candidate' && selectedStudentId) {
      return processedStats.filter(s => s.id === selectedStudentId);
    }
    return processedStats.filter(s => 
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.manager?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [processedStats, searchTerm, role, selectedStudentId]);

  const chartData = useMemo(() => {
    return processedStats
      .sort((a, b) => (b.totalSC || 0) - (a.totalSC || 0))
      .slice(0, 10)
      .map(s => ({
        name: s.name,
        sc: s.totalSC || 0,
        meetings: s.cumulativeEffective
      }));
  }, [processedStats]);

  const managerData = useMemo(() => {
    const managers: Record<string, { name: string, totalSC: number, count: number }> = {};
    processedStats.forEach(s => {
      if (!managers[s.manager]) {
        managers[s.manager] = { name: s.manager, totalSC: 0, count: 0 };
      }
      managers[s.manager].totalSC += (s.totalSC || 0);
      managers[s.manager].count += 1;
    });
    return Object.values(managers).sort((a, b) => b.totalSC - a.totalSC);
  }, [processedStats]);

  const fetchAIInsights = async () => {
    setLoadingAI(true);
    const insights = await getAIInsights(processedStats, currentWeek);
    setAiInsights(insights || '');
    setLoadingAI(false);
  };

  const exportCSV = () => {
    const headers = ["Name", "Manager", "Total SC", "Effective Meetings", "Goal Met"];
    const rows = processedStats.map(s => [s.name, s.manager, s.totalSC, s.cumulativeEffective, s.isAchiever ? "YES" : "NO"]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href",
