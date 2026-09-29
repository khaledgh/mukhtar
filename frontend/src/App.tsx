import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Users, 
  MapPin, 
  Calendar, 
  HelpCircle, 
  RotateCcw, 
  Sun, 
  Moon, 
  TrendingUp,
  LayoutDashboard,
  Filter,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Lock,
  LogOut,
  FileText,
  Printer,
  Shield,
  Trash2,
  Plus,
  MessageSquare,
  Cpu,
  Mic,
  Bot,
  Radio,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Send,
  RefreshCw,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  Wrench,
  Check
} from 'lucide-react';

interface Voter {
  id: number;
  name: string;
  father_name: string;
  mother_name: string;
  registry_no: string;
  sect: string;
  birth_date: string | null;
  birth_date_raw: string;
  gender: 'Female' | 'Male';
  village: string;
  page_number: number;
  row_index: number;
}

interface Stats {
  total: number;
  villages: { village: string; count: number }[];
  genders: { gender: string; count: number }[];
  sects: { sect: string; count: number }[];
  top_birth_years: { birth_year: number; count: number }[];
}

interface User {
  id: number;
  username: string;
  role: 'admin' | 'super_admin';
}

interface WhitelistItem {
  id: number;
  identifier: string;
  description: string;
  created_at: string;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/index.php';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<'search' | 'dashboard' | 'reports' | 'admin'>('search');
  
  // Auth State
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt_token'));
  const [userRole, setUserRole] = useState<string | null>(localStorage.getItem('user_role'));
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Stats State
  const [stats, setStats] = useState<Stats | null>(null);
  
  // Search State
  const [voters, setVoters] = useState<Voter[]>([]);
  const [totalVoters, setTotalVoters] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [q, setQ] = useState(''); // Universal Easy Search
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [name, setName] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [registryNo, setRegistryNo] = useState('');
  const [village, setVillage] = useState('');
  const [gender, setGender] = useState('');
  const [sect, setSect] = useState('');

  // Admin Panel State
  const [users, setUsers] = useState<User[]>([]);
  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'super_admin'>('admin');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Admin Sub Tabs
  const [adminSubTab, setAdminSubTab] = useState<'users' | 'whitelist' | 'chatbot' | 'telegram'>('users');

  // Telegram Diagnostics & Settings State
  const [telegramData, setTelegramData] = useState<any>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramFixing, setTelegramFixing] = useState(false);
  const [telegramFixReport, setTelegramFixReport] = useState<{ success: boolean; message: string; actions?: string[] } | null>(null);

  // Test Telegram Message
  const [testChatId, setTestChatId] = useState('');
  const [testCustomText, setTestCustomText] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; hint?: string } | null>(null);

  // Bot Token / Gemini Settings
  const [tokenInput, setTokenInput] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showGeminiInput, setShowGeminiInput] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ success: boolean; text: string } | null>(null);

  // Chatbot Logs State
  const [chatbotLogs, setChatbotLogs] = useState<any[]>([]);
  const [logsStats, setLogsStats] = useState<any>({
    total_queries: 0,
    voice_queries: 0,
    text_queries: 0,
    total_tokens: 0,
    total_cost: 0
  });
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [logsTotalCount, setLogsTotalCount] = useState(0);
  const [logsSearch, setLogsSearch] = useState('');
  const [logsType, setLogsType] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  // Toggle Theme
  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Helper fetch with Token
  const authFetch = async (url: string, options: RequestInit = {}) => {
    const headers = {
      ...(options.headers || {}),
      'Authorization': `Bearer ${token}`
    };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      handleLogout();
      throw new Error('Session expired. Please login again.');
    }
    return res;
  };

  // Fetch Stats
  const fetchStats = async () => {
    if (!token) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  // Fetch Voters (Paginated & Filtered)
  const fetchVoters = async (page = 1) => {
    if (!token) return;
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        q,
        name: showAdvanced ? name : '',
        father_name: showAdvanced ? fatherName : '',
        mother_name: showAdvanced ? motherName : '',
        registry_no: showAdvanced ? registryNo : '',
        village,
        gender,
        sect
      });
      
      const res = await authFetch(`${API_BASE_URL}/api/voters?${queryParams.toString()}`);
      const data = await res.json();
      
      setVoters(data.data || []);
      setTotalVoters(data.total || 0);
      setCurrentPage(data.page || 1);
      setTotalPages(data.pages || 1);
    } catch (err) {
      console.error('Error fetching voters:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Admin Data
  const fetchAdminData = async () => {
    if (!token || userRole !== 'super_admin') return;
    try {
      const resUsers = await authFetch(`${API_BASE_URL}/api/users`);
      const dataUsers = await resUsers.json();
      setUsers(dataUsers);

      const resWhitelist = await authFetch(`${API_BASE_URL}/api/whitelist`);
      const dataWhitelist = await resWhitelist.json();
      setWhitelist(dataWhitelist);
      
      fetchChatbotLogs(1);
      fetchTelegramDiagnostics();
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  };

  // Fetch Chatbot Logs
  const fetchChatbotLogs = async (page = 1) => {
    if (!token || userRole !== 'super_admin') return;
    setLogsLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        q: logsSearch,
        type: logsType
      });
      const res = await authFetch(`${API_BASE_URL}/api/chatbot-logs?${queryParams.toString()}`);
      const data = await res.json();
      setChatbotLogs(data.logs || []);
      setLogsStats(data.stats || {
        total_queries: 0,
        voice_queries: 0,
        text_queries: 0,
        total_tokens: 0,
        total_cost: 0
      });
      setLogsCurrentPage(data.pagination?.page || 1);
      setLogsTotalPages(data.pagination?.pages || 1);
      setLogsTotalCount(data.pagination?.total || 0);
    } catch (err) {
      console.error('Error fetching chatbot logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  // Clear Chatbot Logs
  const handleClearLogs = async () => {
    if (!window.confirm('هل أنت متأكد من مسح جميع سجلات المحادثات؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/chatbot-logs/clear`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setExpandedLogId(null);
        fetchChatbotLogs(1);
      }
    } catch (err) {
      console.error('Error clearing chatbot logs:', err);
    }
  };

  // Add User
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole })
      });
      if (res.ok) {
        setNewUsername('');
        setNewPassword('');
        setNewRole('admin');
        fetchAdminData();
      }
    } catch (err) {
      console.error('Error creating user:', err);
    }
  };

  // Delete User
  const handleDeleteUser = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/users/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  // Add Whitelist Item
  const handleAddWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdentifier) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: newIdentifier, description: newDesc })
      });
      if (res.ok) {
        setNewIdentifier('');
        setNewDesc('');
        fetchAdminData();
      }
    } catch (err) {
      console.error('Error whitelisting Telegram identifier:', err);
    }
  };

  // Delete Whitelist Item
  const handleDeleteWhitelist = async (id: number) => {
    if (!window.confirm('هل أنت متأكد من إزالة هذا المعرف من القائمة؟')) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/whitelist/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchAdminData();
      }
    } catch (err) {
      console.error('Error deleting whitelist item:', err);
    }
  };

  // Fetch Telegram Diagnostics
  const fetchTelegramDiagnostics = async () => {
    if (!token || userRole !== 'super_admin') return;
    setTelegramLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/telegram/status`);
      if (res.ok) {
        const data = await res.json();
        setTelegramData(data);
      }
    } catch (err) {
      console.error('Error fetching telegram diagnostics:', err);
    } finally {
      setTelegramLoading(false);
    }
  };

  // Reconnect and Fix Telegram
  const handleTelegramReconnectAndFix = async () => {
    if (!token || userRole !== 'super_admin') return;
    setTelegramFixing(true);
    setTelegramFixReport(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/telegram/reconnect-fix`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setTelegramFixReport({ success: true, message: data.message, actions: data.actions });
        if (data.diagnostics) {
          setTelegramData(data.diagnostics);
        }
      } else {
        setTelegramFixReport({ success: false, message: data.error || 'حدث خطأ أثناء محاولة الإصلاح' });
      }
    } catch (err: any) {
      setTelegramFixReport({ success: false, message: err.message || 'خطأ في الاتصال بالخادم' });
    } finally {
      setTelegramFixing(false);
    }
  };

  // Send Test Telegram Message
  const handleSendTelegramTestMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!testChatId) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await authFetch(`${API_BASE_URL}/api/telegram/test-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: testChatId, text: testCustomText || undefined })
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ success: true, message: data.message });
      } else {
        setTestResult({ success: false, message: data.error, hint: data.hint });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'تعذر الاتصال بالخادم' });
    } finally {
      setTestSending(false);
    }
  };

  // Save Bot Token & Settings
  const handleSaveTelegramSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsMsg(null);
    try {
      const payload: any = {};
      if (tokenInput.trim()) payload.bot_token = tokenInput.trim();
      if (geminiKeyInput.trim()) payload.gemini_api_key = geminiKeyInput.trim();

      const res = await authFetch(`${API_BASE_URL}/api/telegram/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setSettingsMsg({ success: true, text: data.message });
        if (data.diagnostics) setTelegramData(data.diagnostics);
        setTokenInput('');
        setGeminiKeyInput('');
      } else {
        setSettingsMsg({ success: false, text: data.error || 'تعذر حفظ الإعدادات' });
      }
    } catch (err: any) {
      setSettingsMsg({ success: false, text: err.message || 'خطأ في الاتصال بالخادم' });
    } finally {
      setSettingsSaving(false);
    }
  };

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameInput, password: passwordInput })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('jwt_token', data.token);
        localStorage.setItem('user_role', data.role);
        setToken(data.token);
        setUserRole(data.role);
        setUsernameInput('');
        setPasswordInput('');
      } else {
        setAuthError(data.error || 'فشل تسجيل الدخول. يرجى التحقق من المدخلات.');
      }
    } catch (err) {
      setAuthError('حدث خطأ أثناء الاتصال بالخادم.');
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_role');
    setToken(null);
    setUserRole(null);
    setStats(null);
    setVoters([]);
  };

  // Trigger search on submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVoters(1);
  };

  // Reset Filters
  const handleReset = () => {
    setQ('');
    setName('');
    setFatherName('');
    setMotherName('');
    setRegistryNo('');
    setVillage('');
    setGender('');
    setSect('');
    setTimeout(() => fetchVoters(1), 0);
  };

  // Print Page trigger
  const handlePrint = () => {
    window.print();
  };

  // Initial Loads when token changes
  useEffect(() => {
    if (token) {
      fetchStats();
      fetchVoters(1);
      if (userRole === 'super_admin') {
        fetchAdminData();
      }
    }
  }, [token, userRole]);

  // Auth Guard Screen
  if (!token) {
    return (
      <div className="login-overlay">
        <form onSubmit={handleLogin} className="glass-card login-card">
          <div className="login-icon">
            <Lock size={32} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>تسجيل الدخول</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: '0.9rem' }}>
            نظام سجل وإدارة المواطنين الآمن
          </p>
          
          {authError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              {authError}
            </div>
          )}
          
          <div className="input-group" style={{ marginBottom: '1.25rem', textAlign: 'right' }}>
            <label>اسم المستخدم</label>
            <input 
              type="text" 
              value={usernameInput} 
              onChange={(e) => setUsernameInput(e.target.value)} 
              placeholder="أدخل اسم المستخدم..."
              required
            />
          </div>
          
          <div className="input-group" style={{ marginBottom: '2rem', textAlign: 'right' }}>
            <label>كلمة المرور</label>
            <input 
              type="password" 
              value={passwordInput} 
              onChange={(e) => setPasswordInput(e.target.value)} 
              placeholder="أدخل كلمة المرور..."
              required
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.85rem' }}>
            دخول آمن
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="title-section">
          <h1>لوحة إدارة ومعلومات المواطنين</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            محافظة الشمال - قضاء زغرتا (القادرية & مرياطة)
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Navigation */}
          <button 
            className={`btn ${activeTab === 'search' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('search')}
          >
            <Search size={18} />
            البحث عن مواطن
          </button>
          
          <button 
            className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setActiveTab('dashboard');
              fetchStats();
            }}
          >
            <LayoutDashboard size={18} />
            الإحصائيات العامة
          </button>

          <button 
            className={`btn ${activeTab === 'reports' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => {
              setActiveTab('reports');
              fetchStats();
            }}
          >
            <FileText size={18} />
            التقارير المطبوعة
          </button>

          {userRole === 'super_admin' && (
            <button 
              className={`btn ${activeTab === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setActiveTab('admin');
                fetchAdminData();
              }}
            >
              <Shield size={18} />
              لوحة التحكم
            </button>
          )}

          {/* Theme switcher */}
          <button className="theme-toggle" onClick={toggleTheme} title="تبديل المظهر">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          {/* Logout */}
          <button className="btn btn-secondary" onClick={handleLogout} title="تسجيل الخروج" style={{ padding: '0.75rem' }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* 1. Dashboard Tab */}
      {activeTab === 'dashboard' && stats && (
        <div>
          <div className="grid-stats">
            <div className="glass-card stat-card">
              <div className="stat-info">
                <h3>إجمالي المواطنين</h3>
                <p>{stats.total.toLocaleString()}</p>
              </div>
              <div className="stat-icon">
                <Users size={24} />
              </div>
            </div>

            {stats.villages.map(v => (
              <div key={v.village} className="glass-card stat-card">
                <div className="stat-info">
                  <h3>سكان {v.village}</h3>
                  <p>{v.count.toLocaleString()}</p>
                </div>
                <div className="stat-icon" style={{ background: 'var(--success-gradient)', boxShadow: '0 0 15px rgba(16, 185, 129, 0.35)' }}>
                  <MapPin size={24} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* Gender Stats */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <TrendingUp size={20} color="var(--accent-color)" />
                توزيع الجنسين
              </h2>
              {stats.genders.map(g => (
                <div key={g.gender} style={{ marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontWeight: 600 }}>{g.gender === 'Female' ? 'إناث' : 'ذكور'}</span>
                    <span style={{ fontFamily: 'var(--font-english)', fontWeight: 700 }}>
                      {((g.count / stats.total) * 100).toFixed(1)}% ({g.count.toLocaleString()})
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.06)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${(g.count / stats.total) * 100}%`, 
                      height: '100%', 
                      background: g.gender === 'Female' ? 'linear-gradient(90deg, #ec4899, #db2777)' : 'linear-gradient(90deg, #3b82f6, #1d4ed8)',
                      borderRadius: '5px'
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Sect distributions */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <HelpCircle size={20} color="var(--accent-color)" />
                توزيع المذاهب والطوائف
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {stats.sects.map(s => (
                  <div key={s.sect} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 600 }}>{s.sect === '--' ? 'غير محدد' : s.sect}</span>
                    <span style={{ fontFamily: 'var(--font-english)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {s.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top birth years */}
            <div className="glass-card" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Calendar size={20} color="var(--accent-color)" />
                السنوات الأكثر تكراراً للولادة
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {stats.top_birth_years.map((y, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-english)', fontWeight: 600 }}>{y.birth_year}</span>
                    <div style={{ flexGrow: 1, margin: '0 1rem', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${(y.count / stats.top_birth_years[0].count) * 100}%`, 
                        height: '100%', 
                        background: 'var(--accent-gradient)',
                        borderRadius: '3px'
                      }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-english)', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {y.count.toLocaleString()} مواطناً
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Advanced / Easy Search Tab */}
      {activeTab === 'search' && (
        <div>
          {/* Simple search bar + toggle */}
          <form onSubmit={handleSearchSubmit} className="glass-card search-box">
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Filter size={20} color="var(--accent-color)" />
              البحث الذكي في سجل المواطنين
            </h2>
            
            {/* Easy search input */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <div style={{ flexGrow: 1, position: 'relative' }}>
                <input 
                  type="text" 
                  value={q} 
                  onChange={(e) => setQ(e.target.value)} 
                  placeholder="ابحث بالاسم، الأب، الأم، أو رقم القيد هنا..." 
                  style={{
                    width: '100%',
                    padding: '0.85rem 1.25rem',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    color: 'var(--text-primary)',
                    fontSize: '1.05rem',
                    outline: 'none'
                  }}
                />
              </div>
              <button 
                type="button" 
                className={`btn ${showAdvanced ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                خيارات البحث المتقدم
              </button>
            </div>

            {/* Advanced input fields */}
            {showAdvanced && (
              <div className="search-grid" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1.5rem' }}>
                <div className="input-group">
                  <label>اسم المواطن</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم والشهرة..." />
                </div>
                <div className="input-group">
                  <label>اسم الأب</label>
                  <input type="text" value={fatherName} onChange={(e) => setFatherName(e.target.value)} placeholder="اسم الأب..." />
                </div>
                <div className="input-group">
                  <label>اسم الأم</label>
                  <input type="text" value={motherName} onChange={(e) => setMotherName(e.target.value)} placeholder="اسم الأم وشهرتها..." />
                </div>
                <div className="input-group">
                  <label>رقم القيد</label>
                  <input type="text" value={registryNo} onChange={(e) => setRegistryNo(e.target.value)} placeholder="رقم القيد..." />
                </div>
              </div>
            )}

            {/* General Filters */}
            <div className="search-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="input-group">
                <label>البلدة/الحي</label>
                <select value={village} onChange={(e) => setVillage(e.target.value)}>
                  <option value="">الكل</option>
                  <option value="القادريه">القادرية</option>
                  <option value="مرياطه">مرياطة</option>
                </select>
              </div>
              <div className="input-group">
                <label>الجنس</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">الكل</option>
                  <option value="Female">إناث</option>
                  <option value="Male">ذكور</option>
                </select>
              </div>
              <div className="input-group">
                <label>المذهب</label>
                <select value={sect} onChange={(e) => setSect(e.target.value)}>
                  <option value="">الكل</option>
                  <option value="سني">سني</option>
                  <option value="شيعي">شيعي</option>
                  <option value="ماروني">ماروني</option>
                  <option value="روم ارثوذكس">روم أرثوذكس</option>
                  <option value="روم كاثوليك">روم كاثوليك</option>
                </select>
              </div>
            </div>

            <div className="search-actions" style={{ marginTop: '1.5rem' }}>
              <button type="submit" className="btn btn-primary">
                <Search size={18} />
                تطبيق البحث
              </button>
              <button type="button" onClick={handleReset} className="btn btn-secondary">
                <RotateCcw size={18} />
                إعادة ضبط
              </button>
              
              <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                تم العثور على: <span style={{ color: 'var(--text-primary)', margin: '0 0.25rem', fontFamily: 'var(--font-english)', fontSize: '1.2rem', fontWeight: 800 }}>{totalVoters.toLocaleString()}</span> مواطن
              </div>
            </div>
          </form>

          {/* Results Area */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <div style={{ 
                border: '4px solid rgba(255,255,255,0.1)', 
                borderTop: '4px solid var(--accent-color)', 
                borderRadius: '50%', 
                width: '40px', 
                height: '40px', 
                animation: 'spin 1s linear infinite' 
              }} />
            </div>
          ) : voters.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <ShieldAlert size={48} style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }} />
              <p>لم يتم العثور على أي نتائج تطابق خيارات البحث.</p>
            </div>
          ) : (
            <div>
              {/* Desktop Table View */}
              <div className="glass-card results-section">
                <table className="voters-table">
                  <thead>
                    <tr>
                      <th>الاسم والشهرة</th>
                      <th>اسم الأب</th>
                      <th>اسم الأم وشهرتها</th>
                      <th>رقم القيد</th>
                      <th>تاريخ الولادة</th>
                      <th>المذهب</th>
                      <th>الجنس</th>
                      <th>البلدة</th>
                      <th>الموقع في المستند</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voters.map((v) => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 700 }}>{v.name}</td>
                        <td>{v.father_name}</td>
                        <td>{v.mother_name}</td>
                        <td style={{ fontFamily: 'var(--font-english)', fontWeight: 600 }}>{v.registry_no}</td>
                        <td style={{ fontFamily: 'var(--font-english)' }}>
                          {v.birth_date ? v.birth_date : v.birth_date_raw}
                        </td>
                        <td>{v.sect}</td>
                        <td>{v.gender === 'Female' ? 'أنثى' : 'ذكر'}</td>
                        <td>
                          <span style={{ 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: '4px', 
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            background: v.village === 'القادريه' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: v.village === 'القادريه' ? '#60a5fa' : '#34d399'
                          }}>
                            {v.village}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-english)', color: 'var(--text-secondary)' }}>
                          ص {v.page_number} / س {v.row_index}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="mobile-cards">
                {voters.map((v) => (
                  <div key={v.id} className="glass-card mobile-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{v.name}</span>
                      <span style={{ 
                        padding: '0.25rem 0.5rem', 
                        borderRadius: '4px', 
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: v.village === 'القادريه' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                        color: v.village === 'القادريه' ? '#60a5fa' : '#34d399'
                      }}>
                        {v.village}
                      </span>
                    </div>
                    <div className="mobile-card-row">
                      <span>اسم الأب:</span>
                      <span>{v.father_name}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>اسم الأم وشهرتها:</span>
                      <span>{v.mother_name}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>رقم القيد / المذهب:</span>
                      <span>{v.registry_no} / {v.sect}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>تاريخ الولادة:</span>
                      <span style={{ fontFamily: 'var(--font-english)' }}>
                        {v.birth_date ? v.birth_date : v.birth_date_raw}
                      </span>
                    </div>
                    <div className="mobile-card-row">
                      <span>الجنس:</span>
                      <span>{v.gender === 'Female' ? 'أنثى' : 'ذكر'}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>موقع المستند:</span>
                      <span style={{ fontFamily: 'var(--font-english)', color: 'var(--text-secondary)' }}>
                        صفحة {v.page_number} / سطر {v.row_index}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="pagination">
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    الصفحة <span className="page-num" style={{ color: 'var(--text-primary)' }}>{currentPage}</span> من <span className="page-num" style={{ color: 'var(--text-primary)' }}>{totalPages}</span>
                  </div>
                  <div className="pagination-btn-group">
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => fetchVoters(currentPage - 1)}
                      disabled={currentPage === 1}
                      style={{ padding: '0.5rem 1rem', opacity: currentPage === 1 ? 0.5 : 1 }}
                    >
                      <ChevronRight size={18} />
                      السابق
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => fetchVoters(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      style={{ padding: '0.5rem 1rem', opacity: currentPage === totalPages ? 0.5 : 1 }}
                    >
                      التالي
                      <ChevronLeft size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. Reports Tab */}
      {activeTab === 'reports' && stats && (
        <div className="glass-card" style={{ padding: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '2px solid var(--border-glass)', paddingBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>التقرير الإحصائي والتحليلي النهائي للمواطنين</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>توزيع بيانات المواطنين بحسب البلدة، الجنس، والمذهب</p>
            </div>
            <button className="btn btn-primary" onClick={handlePrint}>
              <Printer size={18} />
              طباعة التقرير
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>ملخص البلدات</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.5rem 0' }}>البلدة</th>
                    <th style={{ padding: '0.5rem 0', textAlign: 'left' }}>العدد</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.villages.map(v => (
                    <tr key={v.village}>
                      <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{v.village}</td>
                      <td style={{ padding: '0.5rem 0', textAlign: 'left', fontFamily: 'var(--font-english)' }}>{v.count.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '2px solid var(--border-glass)' }}>
                    <td style={{ padding: '0.5rem 0', fontWeight: 800 }}>المجموع الكلي</td>
                    <td style={{ padding: '0.5rem 0', textAlign: 'left', fontFamily: 'var(--font-english)', fontWeight: 800 }}>{stats.total.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>توزيع الجنسين</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.5rem 0' }}>الجنس</th>
                    <th style={{ padding: '0.5rem 0', textAlign: 'left' }}>العدد</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.genders.map(g => (
                    <tr key={g.gender}>
                      <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{g.gender === 'Female' ? 'إناث' : 'ذكور'}</td>
                      <td style={{ padding: '0.5rem 0', textAlign: 'left', fontFamily: 'var(--font-english)' }}>{g.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>توزيع الطوائف والمذاهب</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.5rem 0' }}>المذهب</th>
                    <th style={{ padding: '0.5rem 0', textAlign: 'left' }}>العدد</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sects.map(s => (
                    <tr key={s.sect}>
                      <td style={{ padding: '0.5rem 0', fontWeight: 600 }}>{s.sect === '--' ? 'غير محدد' : s.sect}</td>
                      <td style={{ padding: '0.5rem 0', textAlign: 'left', fontFamily: 'var(--font-english)' }}>{s.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Admin Panel Tab */}
      {activeTab === 'admin' && userRole === 'super_admin' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Admin Inner Sub Navigation */}
          <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem', flexWrap: 'wrap' }}>
            <button 
              className={`btn ${adminSubTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAdminSubTab('users')}
            >
              <Shield size={18} />
              إدارة مستخدمي النظام
            </button>
            <button 
              className={`btn ${adminSubTab === 'whitelist' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAdminSubTab('whitelist')}
            >
              <Users size={18} />
              القائمة البيضاء لبوت تليغرام
            </button>
            <button 
              className={`btn ${adminSubTab === 'chatbot' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAdminSubTab('chatbot');
                fetchChatbotLogs(1);
              }}
            >
              <MessageSquare size={18} />
              سجل المحادثات وتكلفة الذكاء الاصطناعي
            </button>
            <button 
              className={`btn ${adminSubTab === 'telegram' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => {
                setAdminSubTab('telegram');
                fetchTelegramDiagnostics();
              }}
            >
              <Bot size={18} />
              فحص وتشخيص بوت تليغرام والإصلاح
            </button>
          </div>

          {/* User Management Sub-Tab */}
          {adminSubTab === 'users' && (
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Shield size={22} color="var(--accent-color)" />
                إدارة مستخدمي النظام
              </h2>
              
              {/* Add User Form */}
              <form onSubmit={handleAddUser} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
                <div className="input-group" style={{ flexGrow: 1, minWidth: '150px' }}>
                  <label>اسم المستخدم</label>
                  <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
                </div>
                <div className="input-group" style={{ flexGrow: 1, minWidth: '150px' }}>
                  <label>كلمة المرور</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                </div>
                <div className="input-group" style={{ minWidth: '150px' }}>
                  <label>الدور</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                    <option value="admin">مسؤول (Admin)</option>
                    <option value="super_admin">مسؤول خارق (Super Admin)</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary">
                  <Plus size={18} />
                  إضافة مستخدم
                </button>
              </form>

              {/* Users Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                      <th style={{ padding: '0.75rem 0' }}>اسم المستخدم</th>
                      <th style={{ padding: '0.75rem 0' }}>الدور</th>
                      <th style={{ padding: '0.75rem 0', textAlign: 'left' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                        <td style={{ padding: '0.75rem 0', fontWeight: 600 }}>{u.username}</td>
                        <td style={{ padding: '0.75rem 0' }}>
                          <span style={{ 
                            fontSize: '0.8rem', 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px',
                            background: u.role === 'super_admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                            color: u.role === 'super_admin' ? '#f87171' : '#60a5fa',
                            fontWeight: 700
                          }}>
                            {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 0', textAlign: 'left' }}>
                          {u.username !== 'superadmin' && (
                            <button onClick={() => handleDeleteUser(u.id)} className="btn" style={{ background: 'transparent', color: '#f87171', padding: '0.25rem' }}>
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Telegram Whitelist Sub-Tab */}
          {adminSubTab === 'whitelist' && (
            <div className="glass-card" style={{ padding: '2rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Users size={22} color="var(--accent-color)" />
                إدارة الأرقام المصرح لها بالوصول لـ Telegram Bot
              </h2>

              {/* Add Whitelist form */}
              <form onSubmit={handleAddWhitelist} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-end' }}>
                <div className="input-group" style={{ flexGrow: 1, minWidth: '200px' }}>
                  <label>رقم الهاتف أو المعرف (ID/Username)</label>
                  <input type="text" value={newIdentifier} onChange={(e) => setNewIdentifier(e.target.value)} placeholder="مثال: +96170123456 أو 123456789..." required />
                </div>
                <div className="input-group" style={{ flexGrow: 1, minWidth: '200px' }}>
                  <label>الوصف / الاسم</label>
                  <input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="مثال: المختار فلان..." />
                </div>
                <button type="submit" className="btn btn-primary">
                  <Plus size={18} />
                  إضافة للقائمة
                </button>
              </form>

              {/* Whitelist Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                      <th style={{ padding: '0.75rem 0' }}>المعرف / رقم الهاتف</th>
                      <th style={{ padding: '0.75rem 0' }}>الاسم والوصف</th>
                      <th style={{ padding: '0.75rem 0' }}>تاريخ الإضافة</th>
                      <th style={{ padding: '0.75rem 0', textAlign: 'left' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelist.map(w => (
                      <tr key={w.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                        <td style={{ padding: '0.75rem 0', fontWeight: 600, fontFamily: 'var(--font-english)' }}>{w.identifier}</td>
                        <td style={{ padding: '0.75rem 0' }}>{w.description}</td>
                        <td style={{ padding: '0.75rem 0', fontFamily: 'var(--font-english)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {new Date(w.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '0.75rem 0', textAlign: 'left' }}>
                          <button onClick={() => handleDeleteWhitelist(w.id)} className="btn" style={{ background: 'transparent', color: '#f87171', padding: '0.25rem' }}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Chatbot Logs & AI Cost Dashboard Sub-Tab */}
          {adminSubTab === 'chatbot' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Stats Cards */}
              <div className="grid-stats">
                <div className="glass-card stat-card">
                  <div className="stat-info">
                    <h3>إجمالي طلبات البوت</h3>
                    <p>{logsStats.total_queries.toLocaleString()}</p>
                  </div>
                  <div className="stat-icon" style={{ background: 'var(--accent-gradient)' }}>
                    <MessageSquare size={24} />
                  </div>
                </div>

                <div className="glass-card stat-card">
                  <div className="stat-info">
                    <h3>الطلبات الصوتية (AI)</h3>
                    <p>{logsStats.voice_queries.toLocaleString()}</p>
                  </div>
                  <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)', boxShadow: '0 0 15px rgba(168, 85, 247, 0.35)' }}>
                    <Mic size={24} />
                  </div>
                </div>

                <div className="glass-card stat-card">
                  <div className="stat-info">
                    <h3>الرموز المستخدمة (Tokens)</h3>
                    <p>{logsStats.total_tokens.toLocaleString()}</p>
                  </div>
                  <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', boxShadow: '0 0 15px rgba(245, 158, 11, 0.35)' }}>
                    <Cpu size={24} />
                  </div>
                </div>

                <div className="glass-card stat-card">
                  <div className="stat-info">
                    <h3>تكلفة الذكاء الاصطناعي الكلية</h3>
                    <p style={{ fontFamily: 'var(--font-english)', fontSize: '1.8rem' }}>
                      ${logsStats.total_cost.toFixed(6)}
                    </p>
                  </div>
                  <div className="stat-icon" style={{ background: 'var(--success-gradient)' }}>
                    <TrendingUp size={24} />
                  </div>
                </div>
              </div>

              {/* Filter and Clear logs */}
              <div className="glass-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  
                  <div style={{ flexGrow: 1, minWidth: '200px' }}>
                    <input 
                      type="text" 
                      value={logsSearch} 
                      onChange={(e) => setLogsSearch(e.target.value)} 
                      placeholder="ابحث برقم المعرف، اسم المستخدم، أو محتوى الطلب..." 
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ minWidth: '150px' }}>
                    <select 
                      value={logsType} 
                      onChange={(e) => setLogsType(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        outline: 'none'
                      }}
                    >
                      <option value="">كل أنواع الرسائل</option>
                      <option value="text">رسائل نصية</option>
                      <option value="voice">رسائل صوتية</option>
                    </select>
                  </div>

                  <button 
                    onClick={() => fetchChatbotLogs(1)}
                    className="btn btn-primary"
                  >
                    <Search size={18} />
                    تطبيق الفلترة
                  </button>

                  <button 
                    onClick={handleClearLogs}
                    className="btn"
                    style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.25)' }}
                  >
                    <Trash2 size={18} />
                    مسح السجل بالكامل
                  </button>

                  <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    تم العثور على: <span style={{ color: 'var(--text-primary)', margin: '0 0.25rem', fontFamily: 'var(--font-english)', fontSize: '1.2rem', fontWeight: 800 }}>{logsTotalCount.toLocaleString()}</span> طلب
                  </div>
                </div>
              </div>

              {/* Table View */}
              {logsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                  <div style={{ 
                    border: '4px solid rgba(255,255,255,0.1)', 
                    borderTop: '4px solid var(--accent-color)', 
                    borderRadius: '50%', 
                    width: '40px', 
                    height: '40px', 
                    animation: 'spin 1s linear infinite' 
                  }} />
                </div>
              ) : chatbotLogs.length === 0 ? (
                <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <ShieldAlert size={48} style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }} />
                  <p>لا يوجد أي سجلات محادثة مطابقة للبحث.</p>
                </div>
              ) : (
                <div>
                  <div className="glass-card results-section">
                    <table className="voters-table">
                      <thead>
                        <tr>
                          <th>التاريخ والوقت</th>
                          <th>المعرّف (المستخدم)</th>
                          <th>النوع</th>
                          <th>الطلب / النص المستخرج</th>
                          <th>رد البوت (النتائج)</th>
                          <th>الرموز (Tokens)</th>
                          <th>التكلفة المقدرة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chatbotLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-english)' }}>
                              {new Date(log.created_at).toLocaleString('ar-LB')}
                            </td>
                            <td>
                              <span style={{ fontWeight: 600, fontFamily: 'var(--font-english)' }}>{log.chat_id}</span>
                              {log.username && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginRight: '0.25rem', fontFamily: 'var(--font-english)' }}>
                                  (@{log.username})
                                </span>
                              )}
                            </td>
                            <td>
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.25rem',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                background: log.message_type === 'voice' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                color: log.message_type === 'voice' ? '#c084fc' : '#60a5fa'
                              }}>
                                {log.message_type === 'voice' ? <Mic size={12} /> : <FileText size={12} />}
                                {log.message_type === 'voice' ? 'صوت' : 'نص'}
                              </span>
                            </td>
                            <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.query_text}>
                              {log.query_text}
                            </td>
                            <td>
                              <button 
                                onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                className="btn btn-secondary"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                              >
                                {expandedLogId === log.id ? 'إخفاء الرد' : 'عرض الرد'}
                              </button>
                            </td>
                            <td style={{ fontFamily: 'var(--font-english)', fontSize: '0.9rem' }}>
                              {log.message_type === 'voice' ? `${log.prompt_tokens} / ${log.completion_tokens}` : '0'}
                            </td>
                            <td style={{ fontFamily: 'var(--font-english)', fontWeight: 600, color: log.message_type === 'voice' ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                              ${parseFloat(log.estimated_cost).toFixed(6)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Expanded Response Area */}
                  {expandedLogId !== null && (
                    <div className="glass-card" style={{ padding: '1.5rem', marginTop: '1rem', border: '1px solid var(--accent-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>تفاصيل الرد للمعرّف: {chatbotLogs.find(l => l.id === expandedLogId)?.chat_id}</h4>
                        <button onClick={() => setExpandedLogId(null)} className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>إغلاق</button>
                      </div>
                      <pre style={{ 
                        whiteSpace: 'pre-wrap', 
                        background: 'rgba(0,0,0,0.3)', 
                        padding: '1rem', 
                        borderRadius: '8px', 
                        fontFamily: 'inherit',
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        color: 'var(--text-primary)',
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}>
                        {chatbotLogs.find(l => l.id === expandedLogId)?.response_text}
                      </pre>
                    </div>
                  )}

                  {/* Pagination */}
                  {logsTotalPages > 1 && (
                    <div className="pagination" style={{ marginTop: '1.5rem' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        الصفحة <span className="page-num" style={{ color: 'var(--text-primary)' }}>{logsCurrentPage}</span> من <span className="page-num" style={{ color: 'var(--text-primary)' }}>{logsTotalPages}</span>
                      </div>
                      <div className="pagination-btn-group">
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => fetchChatbotLogs(logsCurrentPage - 1)}
                          disabled={logsCurrentPage === 1}
                          style={{ padding: '0.5rem 1rem', opacity: logsCurrentPage === 1 ? 0.5 : 1 }}
                        >
                          <ChevronRight size={18} />
                          السابق
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          onClick={() => fetchChatbotLogs(logsCurrentPage + 1)}
                          disabled={logsCurrentPage === logsTotalPages}
                          style={{ padding: '0.5rem 1rem', opacity: logsCurrentPage === logsTotalPages ? 0.5 : 1 }}
                        >
                          التالي
                          <ChevronLeft size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Telegram Diagnostics & Repair Sub-Tab */}
          {adminSubTab === 'telegram' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              
              {/* Header Actions Bar */}
              <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <Bot size={24} color="var(--accent-color)" />
                    مركز فحص وتشخيص بوت تليغرام والإصلاح الفوري
                  </h2>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    فحص مباشر لصحة الاتصال بسيرفرات Telegram، تشخيص الأعطال وتعارضات الويب هوك، وإصلاحها بضغطة زر واحدة.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button 
                    onClick={fetchTelegramDiagnostics}
                    disabled={telegramLoading}
                    className="btn btn-secondary"
                    style={{ padding: '0.65rem 1.25rem' }}
                    title="إعادة فحص الاتصال الآن"
                  >
                    <RefreshCw size={18} className={telegramLoading ? 'animate-spin' : ''} style={{ animation: telegramLoading ? 'spin 1s linear infinite' : 'none' }} />
                    {telegramLoading ? 'جاري الفحص...' : 'تحديث الفحص'}
                  </button>

                  <button 
                    onClick={handleTelegramReconnectAndFix}
                    disabled={telegramFixing}
                    className="btn btn-primary"
                    style={{ 
                      padding: '0.65rem 1.4rem', 
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                      boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
                      fontWeight: 700 
                    }}
                  >
                    <Wrench size={18} style={{ animation: telegramFixing ? 'spin 1s linear infinite' : 'none' }} />
                    {telegramFixing ? 'جاري الإصلاح وإعادة الاتصال...' : 'إعادة الاتصال والإصلاح التلقائي الآن'}
                  </button>
                </div>
              </div>

              {/* Fix Report Banner (if fix executed) */}
              {telegramFixReport && (
                <div className="glass-card" style={{ 
                  padding: '1.5rem', 
                  border: telegramFixReport.success ? '1px solid #10b981' : '1px solid #ef4444',
                  background: telegramFixReport.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.1rem', color: telegramFixReport.success ? '#34d399' : '#f87171' }}>
                      {telegramFixReport.success ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
                      {telegramFixReport.message}
                    </div>
                    <button 
                      onClick={() => setTelegramFixReport(null)}
                      className="btn btn-secondary" 
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
                    >
                      إغلاق
                    </button>
                  </div>
                  {telegramFixReport.actions && telegramFixReport.actions.length > 0 && (
                    <div style={{ marginTop: '0.75rem', paddingRight: '1rem', borderRight: '2px solid rgba(255,255,255,0.1)' }}>
                      {telegramFixReport.actions.map((action, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.35rem 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          <Check size={16} color="#34d399" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Loading State */}
              {telegramLoading && !telegramData ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                  <div style={{ 
                    border: '4px solid rgba(255,255,255,0.1)', 
                    borderTop: '4px solid var(--accent-color)', 
                    borderRadius: '50%', 
                    width: '45px', 
                    height: '45px', 
                    animation: 'spin 1s linear infinite' 
                  }} />
                </div>
              ) : telegramData && (
                <>
                  {/* Status Banner */}
                  <div className="glass-card" style={{ padding: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                      <div style={{ 
                        width: '56px', 
                        height: '56px', 
                        borderRadius: '16px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        background: telegramData.status === 'healthy' 
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.4) 100%)' 
                          : telegramData.status === 'warning'
                          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.4) 100%)'
                          : 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.4) 100%)',
                        border: telegramData.status === 'healthy' 
                          ? '1px solid rgba(16, 185, 129, 0.4)' 
                          : telegramData.status === 'warning'
                          ? '1px solid rgba(245, 158, 11, 0.4)'
                          : '1px solid rgba(239, 68, 68, 0.4)',
                        boxShadow: telegramData.status === 'healthy' 
                          ? '0 0 20px rgba(16, 185, 129, 0.3)' 
                          : '0 0 20px rgba(239, 68, 68, 0.3)'
                      }}>
                        {telegramData.status === 'healthy' ? (
                          <Activity size={28} color="#10b981" />
                        ) : telegramData.status === 'warning' ? (
                          <AlertTriangle size={28} color="#f59e0b" />
                        ) : (
                          <XCircle size={28} color="#ef4444" />
                        )}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ 
                            padding: '0.3rem 0.8rem', 
                            borderRadius: '30px', 
                            fontSize: '0.85rem', 
                            fontWeight: 800,
                            background: telegramData.status === 'healthy' ? 'rgba(16, 185, 129, 0.15)' : telegramData.status === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: telegramData.status === 'healthy' ? '#34d399' : telegramData.status === 'warning' ? '#fbbf24' : '#f87171',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            border: `1px solid ${telegramData.status === 'healthy' ? 'rgba(16, 185, 129, 0.3)' : telegramData.status === 'warning' ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                          }}>
                            <span style={{ 
                              width: '8px', 
                              height: '8px', 
                              borderRadius: '50%', 
                              background: telegramData.status === 'healthy' ? '#10b981' : telegramData.status === 'warning' ? '#f59e0b' : '#ef4444',
                              boxShadow: `0 0 8px ${telegramData.status === 'healthy' ? '#10b981' : '#ef4444'}`
                            }} />
                            {telegramData.status === 'healthy' ? 'متصل وجاهز للاستقبال والبحث' : telegramData.status === 'warning' ? 'متصل مع وجود تنبيهات' : 'غير متصل - يوجد خطأ في الاتصال'}
                          </span>

                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            زمن الاستجابة: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-english)' }}>{telegramData.latency_ms} ms</strong>
                          </span>
                        </div>

                        <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                            {telegramData.bot?.first_name || 'البوت غير متصل'}
                          </span>
                          {telegramData.bot?.username && (
                            <a 
                              href={`https://t.me/${telegramData.bot.username}`} 
                              target="_blank" 
                              rel="noreferrer"
                              style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '0.3rem', 
                                color: 'var(--accent-color)', 
                                fontFamily: 'var(--font-english)', 
                                fontWeight: 600,
                                textDecoration: 'none'
                              }}
                            >
                              @{telegramData.bot.username}
                              <ExternalLink size={14} />
                            </a>
                          )}
                          {telegramData.bot?.id && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-english)' }}>
                              (ID: {telegramData.bot.id})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>توقيت آخر فحص</span>
                      <span style={{ fontFamily: 'var(--font-english)', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {telegramData.checked_at}
                      </span>
                    </div>
                  </div>

                  {/* 4 Diagnostic Stat Cards */}
                  <div className="grid-stats">
                    {/* 1. Bot Token */}
                    <div className="glass-card stat-card">
                      <div className="stat-info">
                        <h3>توكن البوت (Bot Token)</h3>
                        <p style={{ fontFamily: 'var(--font-english)', fontSize: '1.2rem', marginTop: '0.25rem' }}>
                          {telegramData.token_masked || 'غير محدد'}
                        </p>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 700, 
                          color: telegramData.token_configured ? '#34d399' : '#f87171' 
                        }}>
                          {telegramData.token_configured ? '✓ التوكن مضبوط' : '✗ التوكن غير متوفر'}
                        </span>
                      </div>
                      <div className="stat-icon" style={{ background: 'var(--accent-gradient)' }}>
                        <Key size={24} />
                      </div>
                    </div>

                    {/* 2. Webhook & Queue */}
                    <div className="glass-card stat-card">
                      <div className="stat-info">
                        <h3>الويب هوك وقائمة الانتظار</h3>
                        <p style={{ fontFamily: 'var(--font-english)', fontSize: '1.4rem' }}>
                          {telegramData.webhook?.pending_update_count ?? 0}
                          <span style={{ fontSize: '0.85rem', marginRight: '0.35rem', color: 'var(--text-secondary)' }}>معلق</span>
                        </p>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 700, 
                          color: telegramData.webhook?.url ? '#fbbf24' : '#60a5fa' 
                        }}>
                          {telegramData.webhook?.url ? '⚠️ ويب هوك مسجل' : '✓ وضع البولينغ جاهز'}
                        </span>
                      </div>
                      <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' }}>
                        <Radio size={24} />
                      </div>
                    </div>

                    {/* 3. Gemini AI */}
                    <div className="glass-card stat-card">
                      <div className="stat-info">
                        <h3>محرك الذكاء الاصطناعي (Gemini)</h3>
                        <p style={{ fontSize: '1rem', fontWeight: 700, marginTop: '0.25rem' }}>
                          {telegramData.gemini?.connected ? 'جاهز ومتصل' : telegramData.gemini?.message || 'غير مفعل'}
                        </p>
                        <span style={{ 
                          fontSize: '0.8rem', 
                          fontWeight: 700, 
                          color: telegramData.gemini?.connected ? '#34d399' : '#f87171' 
                        }}>
                          {telegramData.gemini?.connected ? `gemini-2.5-flash (${telegramData.gemini.latency_ms}ms)` : 'الصوت والتحليل معطل'}
                        </span>
                      </div>
                      <div className="stat-icon" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
                        <Cpu size={24} />
                      </div>
                    </div>

                    {/* 4. Whitelist & Database */}
                    <div className="glass-card stat-card">
                      <div className="stat-info">
                        <h3>المصرح لهم بالوصول (Whitelist)</h3>
                        <p style={{ fontFamily: 'var(--font-english)', fontSize: '1.4rem' }}>
                          {telegramData.whitelist_count}
                          <span style={{ fontSize: '0.85rem', marginRight: '0.35rem', color: 'var(--text-secondary)' }}>مستخدم</span>
                        </p>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399' }}>
                          ✓ قاعدة البيانات متصلة
                        </span>
                      </div>
                      <div className="stat-icon" style={{ background: 'var(--success-gradient)' }}>
                        <Users size={24} />
                      </div>
                    </div>
                  </div>

                  {/* Issues & Root Cause Diagnostics Analyzer */}
                  {telegramData.issues && telegramData.issues.length > 0 && (
                    <div className="glass-card" style={{ padding: '1.75rem' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f87171' }}>
                        <AlertTriangle size={22} color="#f87171" />
                        تقرير كشف الأخطاء وأسبابها المقترحة (Root Causes & Solutions)
                      </h3>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {telegramData.issues.map((issue: any, idx: number) => {
                          const isErr = issue.type === 'error';
                          const isWarn = issue.type === 'warning';
                          const borderColor = isErr ? '#ef4444' : isWarn ? '#f59e0b' : '#3b82f6';
                          const bgColor = isErr ? 'rgba(239, 68, 68, 0.08)' : isWarn ? 'rgba(245, 158, 11, 0.08)' : 'rgba(59, 130, 246, 0.08)';

                          return (
                            <div key={idx} style={{ 
                              padding: '1.25rem', 
                              borderRadius: '12px', 
                              border: `1px solid ${borderColor}`, 
                              background: bgColor,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.5rem'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ 
                                    padding: '0.2rem 0.5rem', 
                                    borderRadius: '4px', 
                                    fontSize: '0.75rem', 
                                    fontWeight: 800, 
                                    fontFamily: 'var(--font-english)',
                                    background: isErr ? 'rgba(239, 68, 68, 0.25)' : isWarn ? 'rgba(245, 158, 11, 0.25)' : 'rgba(59, 130, 246, 0.25)',
                                    color: isErr ? '#f87171' : isWarn ? '#fbbf24' : '#60a5fa'
                                  }}>
                                    {issue.code}
                                  </span>
                                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{issue.title}</strong>
                                </div>

                                {(issue.code === 'WEBHOOK_ACTIVE' || issue.code === 'HIGH_PENDING_UPDATES') && (
                                  <button 
                                    onClick={handleTelegramReconnectAndFix}
                                    disabled={telegramFixing}
                                    className="btn btn-primary"
                                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                  >
                                    إصلاح المشكلة الآن
                                  </button>
                                )}
                              </div>

                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                {issue.message}
                              </p>

                              <div style={{ 
                                background: 'rgba(0, 0, 0, 0.25)', 
                                padding: '0.75rem 1rem', 
                                borderRadius: '8px', 
                                fontSize: '0.85rem', 
                                color: 'var(--text-primary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <span>💡 <strong>الحل المباشر:</strong> {issue.recommendation}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Two Interactive Tools Columns */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                    
                    {/* Tool 1: Send Test Ping Message */}
                    <div className="glass-card" style={{ padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Send size={20} color="var(--accent-color)" />
                        فحص التوصيل المباشر (إرسال رسالة تجريبية)
                      </h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                        أرسل رسالة فحص فورية إلى أي حساب تليغرام للتأكد من قدرة الخادم على إيصال التنبيهات.
                      </p>

                      <form onSubmit={handleSendTelegramTestMessage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="input-group">
                          <label>معرّف المحادثة (Telegram Chat ID)</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input 
                              type="text" 
                              value={testChatId} 
                              onChange={(e) => setTestChatId(e.target.value)} 
                              placeholder="مثال: 263844931 أو 6538993902..."
                              required
                              style={{ flexGrow: 1 }}
                            />
                            {whitelist.length > 0 && (
                              <select 
                                onChange={(e) => {
                                  if (e.target.value) setTestChatId(e.target.value);
                                }}
                                style={{ width: '130px', padding: '0.5rem' }}
                                defaultValue=""
                              >
                                <option value="" disabled>اختر من القائمة...</option>
                                {whitelist.map(w => (
                                  <option key={w.id} value={w.identifier}>{w.description || w.identifier}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>

                        <div className="input-group">
                          <label>نص الرسالة المخصص (اختياري)</label>
                          <input 
                            type="text" 
                            value={testCustomText} 
                            onChange={(e) => setTestCustomText(e.target.value)} 
                            placeholder="اترك فارغاً لإرسال رسالة الفحص الافتراضية المنسقة..."
                          />
                        </div>

                        <button 
                          type="submit" 
                          disabled={testSending || !testChatId}
                          className="btn btn-primary"
                          style={{ marginTop: '0.5rem' }}
                        >
                          <Send size={18} />
                          {testSending ? 'جاري إرسال الرسالة...' : 'إرسال رسالة الفحص الآن'}
                        </button>
                      </form>

                      {/* Result Box */}
                      {testResult && (
                        <div style={{ 
                          marginTop: '1rem', 
                          padding: '1rem', 
                          borderRadius: '8px', 
                          border: testResult.success ? '1px solid #10b981' : '1px solid #ef4444',
                          background: testResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: testResult.success ? '#34d399' : '#f87171' }}>
                            {testResult.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                            {testResult.message}
                          </div>
                          {testResult.hint && (
                            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                              💡 <strong>ملاحظة هامة:</strong> {testResult.hint}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Tool 2: Bot Token & Gemini Settings */}
                    <div className="glass-card" style={{ padding: '2rem' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Key size={20} color="var(--accent-color)" />
                        إعداد وتحديث مفاتيح الربط والتوكن
                      </h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                        تحديث توكن البوت أو مفتاح Gemini AI مباشرة في ملف الإعدادات دون الحاجة للوصول للسيرفر.
                      </p>

                      <form onSubmit={handleSaveTelegramSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="input-group">
                          <label>توكن تليغرام الجديد (TELEGRAM_BOT_TOKEN)</label>
                          <div style={{ position: 'relative' }}>
                            <input 
                              type={showTokenInput ? 'text' : 'password'} 
                              value={tokenInput} 
                              onChange={(e) => setTokenInput(e.target.value)} 
                              placeholder="أدخل التوكن الجديد الصادر من @BotFather..."
                              style={{ width: '100%', paddingLeft: '2.5rem' }}
                            />
                            <button 
                              type="button" 
                              onClick={() => setShowTokenInput(!showTokenInput)}
                              style={{ 
                                position: 'absolute', 
                                left: '10px', 
                                top: '50%', 
                                transform: 'translateY(-50%)', 
                                background: 'transparent', 
                                border: 'none', 
                                color: 'var(--text-secondary)', 
                                cursor: 'pointer' 
                              }}
                            >
                              {showTokenInput ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div className="input-group">
                          <label>مفتاح Google Gemini API الجديد</label>
                          <div style={{ position: 'relative' }}>
                            <input 
                              type={showGeminiInput ? 'text' : 'password'} 
                              value={geminiKeyInput} 
                              onChange={(e) => setGeminiKeyInput(e.target.value)} 
                              placeholder="أدخل مفتاح Gemini AI الجديد..."
                              style={{ width: '100%', paddingLeft: '2.5rem' }}
                            />
                            <button 
                              type="button" 
                              onClick={() => setShowGeminiInput(!showGeminiInput)}
                              style={{ 
                                position: 'absolute', 
                                left: '10px', 
                                top: '50%', 
                                transform: 'translateY(-50%)', 
                                background: 'transparent', 
                                border: 'none', 
                                color: 'var(--text-secondary)', 
                                cursor: 'pointer' 
                              }}
                            >
                              {showGeminiInput ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <button 
                          type="submit" 
                          disabled={settingsSaving || (!tokenInput && !geminiKeyInput)}
                          className="btn btn-secondary"
                          style={{ marginTop: '0.5rem' }}
                        >
                          <Check size={18} />
                          {settingsSaving ? 'جاري التحقق والحفظ...' : 'فحص وحفظ الإعدادات الجديدة'}
                        </button>
                      </form>

                      {settingsMsg && (
                        <div style={{ 
                          marginTop: '1rem', 
                          padding: '0.75rem 1rem', 
                          borderRadius: '8px', 
                          border: settingsMsg.success ? '1px solid #10b981' : '1px solid #ef4444',
                          background: settingsMsg.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          fontSize: '0.85rem',
                          color: settingsMsg.success ? '#34d399' : '#f87171'
                        }}>
                          {settingsMsg.text}
                        </div>
                      )}
                    </div>

                  </div>
                </>
              )}

            </div>
          )}

        </div>
      )}
    </div>
  );
}
