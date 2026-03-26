import React from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

// Register components
ChartJS.register(ArcElement, Tooltip, Legend);

function DoughnutChart({ data, options }) {
  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          padding: 20,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8
      }
    },
    cutout: '70%',
    ...options
  };

  return (
    <div style={{ height: '300px', width: '100%' }}>
      <Doughnut data={data} options={defaultOptions} />
    </div>
  );
}

export default DoughnutChart;