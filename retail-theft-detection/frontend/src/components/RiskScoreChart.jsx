import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function RiskScoreChart({ data }) {
    if (!data || data.length === 0) {
        return <p className="text-sm text-slate-500 text-center py-4">No risk score data available</p>;
    }

    const chartData = data.map(d => ({
        name: d.cashier_name || 'Unknown',
        software: d.software_score || 0,
        physical: d.physical_score || 0,
        combined: d.combined_score || 0,
    }));

    const getBarColor = (value) => {
        if (value >= 80) return '#ef4444';
        if (value >= 50) return '#f97316';
        if (value >= 20) return '#eab308';
        return '#22c55e';
    };

    return (
        <div>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={4} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                        <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '8px',
                                color: '#e2e8f0',
                                fontSize: '12px',
                            }}
                        />
                        <Bar dataKey="software" name="Software Risk" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={`sw-${index}`} fill={getBarColor(entry.software)} fillOpacity={0.7} />
                            ))}
                        </Bar>
                        <Bar dataKey="physical" name="Physical Risk" radius={[4, 4, 0, 0]}>
                            {chartData.map((entry, index) => (
                                <Cell key={`ph-${index}`} fill={getBarColor(entry.physical)} fillOpacity={0.9} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* Risk Score Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                {data.map((d, i) => {
                    const severity = d.severity || { label: 'normal', color: 'green' };
                    const bgColors = {
                        green: 'bg-emerald-500/10 border-emerald-500/20',
                        yellow: 'bg-amber-500/10 border-amber-500/20',
                        orange: 'bg-orange-500/10 border-orange-500/20',
                        red: 'bg-red-500/10 border-red-500/20',
                    };
                    const textColors = {
                        green: 'text-emerald-400',
                        yellow: 'text-amber-400',
                        orange: 'text-orange-400',
                        red: 'text-red-400',
                    };

                    return (
                        <div key={i} className={`p-4 rounded-xl border ${bgColors[severity.color] || bgColors.green}`}>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-semibold text-slate-200">{d.cashier_name}</p>
                                <span className={`badge border ${bgColors[severity.color] || ''} ${textColors[severity.color] || ''}`}>
                                    {severity.label}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div>
                                    <p className="text-xs text-slate-500">Software</p>
                                    <p className={`text-lg font-bold ${textColors[severity.color] || 'text-slate-300'}`}>
                                        {d.software_score}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Physical</p>
                                    <p className={`text-lg font-bold ${textColors[severity.color] || 'text-slate-300'}`}>
                                        {d.physical_score}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">Combined</p>
                                    <p className={`text-lg font-bold ${textColors[severity.color] || 'text-slate-300'}`}>
                                        {d.combined_score}
                                    </p>
                                </div>
                            </div>
                            <div className="risk-meter mt-3">
                                <div className="risk-meter-fill" style={{
                                    width: `${d.combined_score}%`,
                                    backgroundColor: getBarColor(d.combined_score)
                                }} />
                            </div>
                            <p className="text-[10px] text-slate-600 mt-2">
                                {d.sw_event_count} POS events · {d.ph_event_count} camera events · {d.period_hours}h window
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
