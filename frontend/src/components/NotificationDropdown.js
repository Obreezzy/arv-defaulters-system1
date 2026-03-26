import React, { useState, useRef, useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import './NotificationDropdown.css';

function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, removeNotification } = useNotifications();
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = (id) => {
    markAsRead(id);
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
  };

  const handleClearAll = () => {
    clearAll();
    setIsOpen(false);
  };

  const getNotificationIcon = (type) => {
    switch(type) {
      case 'sms': return '💬';
      case 'call': return '📞';
      case 'defaulter': return '⚠️';
      case 'success': return '✅';
      case 'warning': return '⚡';
      case 'error': return '❌';
      default: return '🔔';
    }
  };

  const getNotificationColor = (type) => {
    switch(type) {
      case 'sms': return '#3b82f6';
      case 'call': return '#8b5cf6';
      case 'defaulter': return '#ef4444';
      case 'success': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'error': return '#dc2626';
      default: return '#6b7280';
    }
  };

  return (
    <div className="notification-dropdown-container" ref={dropdownRef}>
      {/* Bell Icon Button */}
      <button 
        className="notification-bell"
        onClick={handleToggle}
        aria-label="Notifications"
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Notification Panel - Opens as overlay */}
      {isOpen && (
        <div className="notification-panel">
          {/* Header */}
          <div className="notification-header">
            <h3>Notifications</h3>
            <span className="unread-count">{unreadCount} unread</span>
          </div>

          {/* Action Buttons */}
          {notifications.length > 0 && (
            <div className="notification-actions">
              <button 
                className="action-btn mark-read-btn"
                onClick={handleMarkAllRead}
                disabled={unreadCount === 0}
              >
                Mark all read
              </button>
              <button 
                className="action-btn clear-btn"
                onClick={handleClearAll}
              >
                Clear all
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📭</span>
                <p>No notifications</p>
                <span className="empty-subtitle">You're all caught up!</span>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                  onClick={() => handleNotificationClick(notification.id)}
                >
                  <div 
                    className="notification-icon-wrapper"
                    style={{ backgroundColor: getNotificationColor(notification.type) + '20' }}
                  >
                    <span 
                      className="notification-type-icon"
                      style={{ color: getNotificationColor(notification.type) }}
                    >
                      {getNotificationIcon(notification.type)}
                    </span>
                  </div>

                  <div className="notification-content">
                    <div className="notification-title-row">
                      <h4 className="notification-title">{notification.title}</h4>
                      {!notification.read && <span className="unread-dot"></span>}
                    </div>
                    <p className="notification-message">{notification.message}</p>
                    <span className="notification-time">{notification.timestamp}</span>
                  </div>

                  <button
                    className="remove-notification-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNotification(notification.id);
                    }}
                    aria-label="Remove notification"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationDropdown;