import React from 'react';
import './StatCard.css';

// This component shows a statistic card
// It receives data through "props" (properties)
function StatCard({ title, value, change, color, icon }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: color }}>
      <div className="stat-content">
        <div className="stat-text">
          <p className="stat-title">{title}</p>
          <p className="stat-value">{value}</p>
          {change && (
            <p className="stat-change">{change}</p>
          )}
        </div>
        
        <div className="stat-icon" style={{ backgroundColor: `${color}20` }}>
          <span style={{ color: color }}>{icon}</span>
        </div>
      </div>
    </div>
  );
}

export default StatCard;