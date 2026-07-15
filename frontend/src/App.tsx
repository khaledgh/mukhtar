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
  Plus
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
    } catch (err) {
      console.error('Error fetching admin data:', err);
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
          
          {/* User Management */}
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

          {/* Telegram Whitelist Management */}
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

        </div>
      )}
    </div>
  );
}
