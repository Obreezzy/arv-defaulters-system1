import React, { useState, useEffect } from 'react';
import './App.css';
import Dashboard from './components/Dashboard';
import Defaulters from './components/Defaulters';
import Patients from './components/Patients';
import Reports from './components/Reports';
import Staff from './components/Staff';
import Login from './components/Login';
import { NotificationProvider } from './contexts/NotificationContext';
import NotificationDropdown from './components/NotificationDropdown';
import Toast from './components/Toast';
import { useAutoNotifications } from './hooks/useAutoNotifications';
import { authAPI } from './services/api'; 

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true); 
  const [user, setUser] = useState(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [patientFilter, setPatientFilter] = useState('All'); 
  
  useAutoNotifications();

  useEffect(() => {
    const checkAuthStatus = async () => {
      const token = sessionStorage.getItem('token'); // 👈 changed
      if (token) {
        try {
          const response = await authAPI.getCurrentUser();
          if (response.success) {
            setUser(response.user);
            setIsAuthenticated(true);
          }
        } catch (error) {
          console.error("Session expired or invalid token.");
          sessionStorage.removeItem('token'); // 👈 changed
        }
      }
      setAuthLoading(false); 
    };

    checkAuthStatus();
  }, []);

  const handleNavigate = (tab, filter = 'All') => {
    setActiveTab(tab);
    setPatientFilter(filter);
  };

  const handleLogin = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token'); // 👈 changed
    setIsAuthenticated(false);
    setUser(null);
    setActiveTab('dashboard'); 
  };

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return <Dashboard onNavigate={handleNavigate} />; 
      case 'defaulters': return <Defaulters />;
      case 'patients': return <Patients initialRiskFilter={patientFilter} />; 
      case 'reports': return <Reports />;
      case 'staff': return <Staff />;
      default: return <Dashboard onNavigate={handleNavigate} />;
    }
  };

  if (authLoading) return <div className="loading-screen">Verifying Secure Session...</div>;

  if (!isAuthenticated) {
    return (
      <div className="App">
        <Toast />
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="App">
      <Toast />

      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <div className="logo">ARV</div>
            <div className="header-text">
              <h1>ARV Defaulters Management System</h1>
              <p>Smart Healthcare Solution</p>
            </div>
          </div>
          
          <div className="user-section">
            <NotificationDropdown />
            
            <div className="user-avatar">
              {user?.full_name?.charAt(0) || user?.username?.charAt(0) || 'H'}
            </div>
            
            <span>{user?.full_name || user?.username || 'Healthcare Worker'}</span>
            
            <button className="btn-logout" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </header>

      <nav className="navigation">
        <div className="nav-content">
          <button 
            className={activeTab === 'dashboard' ? 'nav-button active' : 'nav-button'}
            onClick={() => handleNavigate('dashboard')}
          >
            Dashboard
          </button>
          
          <button 
            className={activeTab === 'defaulters' ? 'nav-button active' : 'nav-button'}
            onClick={() => handleNavigate('defaulters')}
          >
            Defaulters
          </button>
          
          <button 
            className={activeTab === 'patients' ? 'nav-button active' : 'nav-button'}
            onClick={() => handleNavigate('patients', 'All')}
          >
            Patients
          </button>
          
          <button 
            className={activeTab === 'reports' ? 'nav-button active' : 'nav-button'}
            onClick={() => handleNavigate('reports')}
          >
            Reports
          </button>

          {/* 🛡️ ADMIN ONLY TAB */}
          {user?.role === 'admin' && (
              <button 
                  className={activeTab === 'staff' ? 'nav-button active' : 'nav-button'}
                  onClick={() => handleNavigate('staff')}
              >
                  Staff Management
              </button>
          )}
        </div>
      </nav>

      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

function App() {
  return (
    <NotificationProvider>
      <AppContent />
    </NotificationProvider>
  );
}

export default App;