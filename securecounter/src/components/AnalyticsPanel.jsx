import { useRef, useEffect, useState, useCallback } from 'react';
import './AnalyticsPanel.css';

const AnalyticsPanel = () => {
    const [isOpen, setIsOpen] = useState(false);
    const barCanvasRef = useRef(null);
    const donutCanvasRef = useRef(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const drawBarChart = useCallback(() => {
        const canvas = barCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.offsetWidth;
        const h = canvas.height = canvas.offsetHeight;

        ctx.clearRect(0, 0, w, h);

        const data = [
            { label: 'Total Alerts', value: 24, color: '#ff4444' },
            { label: 'Authorized', value: 156, color: '#44ff88' },
            { label: 'Unauthorized', value: 8, color: '#ff6644' },
            { label: 'False +', value: 5, color: '#ffbb33' },
            { label: 'Confirmed', value: 3, color: '#ff2244' },
        ];

        const maxVal = Math.max(...data.map(d => d.value));
        const barW = Math.min(40, (w - 60) / data.length - 10);
        const chartH = h - 50;
        const startX = 30;

        // Y-axis
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = 15 + (chartH / 4) * i;
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(w - 10, y);
            ctx.stroke();

            ctx.fillStyle = '#4a5068';
            ctx.font = '9px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxVal - (maxVal / 4) * i), startX - 5, y + 3);
        }

        // Bars
        data.forEach((d, i) => {
            const x = startX + 15 + i * (barW + 15);
            const barH = (d.value / maxVal) * chartH;
            const y = 15 + chartH - barH;

            // Glow
            ctx.shadowColor = d.color;
            ctx.shadowBlur = 8;
            ctx.fillStyle = d.color;

            // Rounded top
            const radius = 4;
            ctx.beginPath();
            ctx.moveTo(x, y + radius);
            ctx.arcTo(x, y, x + barW, y, radius);
            ctx.arcTo(x + barW, y, x + barW, y + barH, radius);
            ctx.lineTo(x + barW, 15 + chartH);
            ctx.lineTo(x, 15 + chartH);
            ctx.closePath();
            ctx.fill();

            ctx.shadowBlur = 0;

            // Label
            ctx.fillStyle = '#6a7288';
            ctx.font = '9px Inter';
            ctx.textAlign = 'center';
            ctx.fillText(d.label, x + barW / 2, h - 5);

            // Value on top
            ctx.fillStyle = '#ccd2dc';
            ctx.font = 'bold 10px Inter';
            ctx.fillText(d.value, x + barW / 2, y - 5);
        });
    }, []);

    const drawDonutChart = useCallback(() => {
        const canvas = donutCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.offsetWidth;
        const h = canvas.height = canvas.offsetHeight;

        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) / 2 - 25;
        const innerRadius = radius * 0.55;

        const data = [
            { label: 'Safe', value: 72, color: '#44ff88' },
            { label: 'Review', value: 18, color: '#ffbb33' },
            { label: 'Suspicious', value: 10, color: '#ff4444' },
        ];

        const total = data.reduce((s, d) => s + d.value, 0);
        let currentAngle = -Math.PI / 2;

        data.forEach((d) => {
            const sliceAngle = (d.value / total) * Math.PI * 2;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, currentAngle, currentAngle + sliceAngle);
            ctx.arc(cx, cy, innerRadius, currentAngle + sliceAngle, currentAngle, true);
            ctx.closePath();

            ctx.shadowColor = d.color;
            ctx.shadowBlur = 10;
            ctx.fillStyle = d.color;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Label line
            const midAngle = currentAngle + sliceAngle / 2;
            const labelRadius = radius + 15;
            const lx = cx + Math.cos(midAngle) * labelRadius;
            const ly = cy + Math.sin(midAngle) * labelRadius;

            ctx.fillStyle = '#8890a4';
            ctx.font = '9px Inter';
            ctx.textAlign = Math.cos(midAngle) > 0 ? 'left' : 'right';
            ctx.fillText(`${d.label} ${d.value}%`, lx, ly);

            currentAngle += sliceAngle;
        });

        // Center text
        ctx.fillStyle = '#e0e6ed';
        ctx.font = 'bold 16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('72%', cx, cy - 2);
        ctx.fillStyle = '#6a7288';
        ctx.font = '9px Inter';
        ctx.fillText('Safe Rate', cx, cy + 12);
    }, []);

    useEffect(() => {
        if (isOpen) {
            // Slight delay to let DOM render
            const timer = setTimeout(() => {
                drawBarChart();
                drawDonutChart();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isOpen, drawBarChart, drawDonutChart]);

    useEffect(() => {
        if (!isOpen) return;
        const handleResize = () => {
            drawBarChart();
            drawDonutChart();
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isOpen, drawBarChart, drawDonutChart]);

    return (
        <div className="analytics-panel glass-panel">
            <button className="analytics-toggle" onClick={() => setIsOpen(!isOpen)}>
                <span className="head-icon">📊</span>
                <span className="head-title">Security Analytics</span>
                <span className={`toggle-arrow ${isOpen ? 'open' : ''}`}>▼</span>
            </button>
            <div className={`analytics-content ${isOpen ? 'open' : ''}`}>
                <div className="chart-grid">
                    <div className="chart-box">
                        <h4 className="chart-title">Alert Distribution</h4>
                        <canvas ref={barCanvasRef} className="chart-canvas bar-chart" />
                    </div>
                    <div className="chart-box">
                        <h4 className="chart-title">Detection Breakdown</h4>
                        <canvas ref={donutCanvasRef} className="chart-canvas donut-chart" />
                    </div>
                </div>
                <div className="analytics-stats">
                    <div className="stat-card">
                        <span className="stat-value red">24</span>
                        <span className="stat-label">Total Alerts Today</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value yellow">20.8%</span>
                        <span className="stat-label">False Positive Rate</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value blue">182ms</span>
                        <span className="stat-label">Avg Alert Latency</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value green">Hand to Pocket</span>
                        <span className="stat-label">Most Frequent Alert</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AnalyticsPanel;
