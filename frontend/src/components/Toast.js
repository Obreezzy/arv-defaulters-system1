import React from 'react';
import './Toast.css';
import { useNotifications } from '../contexts/NotificationContext';
import { CheckCircle, XCircle, AlertTriangle, Info, Bell, X } from 'lucide-react';

function Toast() {
  const { toasts, removeToast } = useNotifications();

  const getToastIcon = (type) => {
    switch (type) {
      case 'success': return <CheckCircle size={18} />;
      case 'error':   return <XCircle size={18} />;
      case 'warning': return <AlertTriangle size={18} />;
      case 'info':    return <Info size={18} />;
      default:        return <Bell size={18} />;
    }
  };

  const getToastClass = (type) => {
    switch (type) {
      case 'success': return 'toast-success';
      case 'error':   return 'toast-error';
      case 'warning': return 'toast-warning';
      case 'info':    return 'toast-info';
      default:        return 'toast-default';
    }
  };

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${getToastClass(toast.type)}`}>
          <div className="toast-icon">{getToastIcon(toast.type)}</div>
          <div className="toast-content">
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-message">{toast.message}</div>
          </div>
          <button className="toast-close" onClick={() => removeToast(toast.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default Toast;
