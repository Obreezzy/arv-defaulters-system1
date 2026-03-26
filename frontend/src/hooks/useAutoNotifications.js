import { useEffect } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { defaultersAPI } from '../services/api';

export const useAutoNotifications = () => {
  const { addNotification } = useNotifications();

  useEffect(() => {
    checkForAlerts();

    // Check every 5 minutes
    const interval = setInterval(checkForAlerts, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const checkForAlerts = async () => {
    try {
      const response = await defaultersAPI.getAllDefaulters();
      const defaulters = response.defaulters || response.data || [];

      // Check for high-risk defaulters
      const highRisk = defaulters.filter(d => {
        const daysMissed = d.days_missed || d.daysMissed || 0;
        return daysMissed > 7;
      });

      if (highRisk.length > 0) {
        highRisk.forEach(defaulter => {
          const name = defaulter.patient_name || defaulter.name || 'Unknown';
          const days = defaulter.days_missed || defaulter.daysMissed || 0;

          addNotification({
            type: 'defaulter',
            title: '⚠️ Critical: High Risk Defaulter',
            message: `${name} has missed pickup for ${days} days`,
            showToast: false
          });
        });
      }

      // Check for patients due for pickup today
      const today = new Date().toISOString().split('T')[0];
      // You can add more checks here based on your needs

    } catch (err) {
      console.error('Error checking for alerts:', err);
    }
  };
};