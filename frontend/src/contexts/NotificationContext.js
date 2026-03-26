import React, { createContext, useContext, useState, useEffect } from 'react';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Load notifications from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('notifications');
    if (saved) {
      try {
        setNotifications(JSON.parse(saved));
      } catch (err) {
        console.error('Error loading notifications:', err);
      }
    }
  }, []);

  // Save notifications to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Add a new notification
  const addNotification = (notification) => {
    const newNotification = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      read: false,
      ...notification
    };

    setNotifications(prev => [newNotification, ...prev]);

    // Also show as toast if specified
    if (notification.showToast !== false) {
      showToast(newNotification);
    }

    return newNotification;
  };

  // Show a toast notification
  const showToast = (toast) => {
    const newToast = {
      id: Date.now(),
      duration: 5000, // 5 seconds default
      ...toast
    };

    setToasts(prev => [...prev, newToast]);

    // Auto remove after duration
    setTimeout(() => {
      removeToast(newToast.id);
    }, newToast.duration);
  };

  // Remove a toast
  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Mark notification as read
  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  };

  // Mark all as read
  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  };

  // Delete a notification
  const deleteNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Clear all notifications
  const clearAll = () => {
    setNotifications([]);
  };

  // Get unread count
  const unreadCount = notifications.filter(n => !n.read).length;

  const value = {
    notifications,
    toasts,
    unreadCount,
    addNotification,
    showToast,
    removeToast,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};