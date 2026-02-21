import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, AlertCircle, Terminal, MousePointer, MonitorOff } from 'lucide-react';

const RiskGauge = ({ score }: { score: number }) => {
    const activeFactors = React.useMemo(() => {
        const factors = [];
        if (score > 20) factors.push('velocity');
        if (score > 40) factors.push('clicks');
        if (score > 60) factors.push('shortcuts');
        if (score > 80) factors.push('focus');
        return factors;
    }, [score]);

    const getRiskLevel = (s: number) => {
        if (s < 30) return { label: 'LOW RISK', color: 'text-emerald-500', barColor: 'bg-emerald-500', borderColor: 'border-emerald-500/30' };
        if (s < 70) return { label: 'ANOMALOUS', color: 'text-yellow-500', barColor: 'bg-yellow-500', borderColor: 'border-yellow-500/30' };
        return { label: 'CRITICAL', color: 'text-red-500', barColor: 'bg-red-500', borderColor: 'border-red-500/30' };
    };

    const risk = getRiskLevel(score);

    const riskFactors = [
        { id: 'velocity', label: 'Phantom Transaction', points: 25, icon: MousePointer },
        { id: 'clicks', label: 'Void Pattern Breach', points: 30, icon: AlertCircle },
        { id: 'shortcuts', label: 'Manual Log Tamper', points: 40, icon: Terminal },
        { id: 'focus', label: 'Log Hash Discontinuity', points: 50, icon: MonitorOff },
    ];

    return (
        <div className={`bg-slate-900/40 backdrop-blur-xl border-2 ${risk.borderColor} transition-all duration-500 rounded-[2rem] p-8 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden group`}>
            <div className="absolute top-4 right-6 flex items-center gap-2 text-[10px] text-slate-500 uppercase font-black tracking-widest opacity-50">
                HEURISTIC_V4.2
            </div>

            <h3 className="text-slate-400 font-black mb-8 uppercase text-xs tracking-widest flex items-center gap-3 mt-2 opacity-80">
                <ShieldAlert size={18} className={risk.color} />
                Risk Probability Engine
            </h3>

            {/* SVG Gauge Visualization */}
            <div className="relative w-48 h-24 mb-10 overflow-visible">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 200 100">
                    <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="rgba(30, 41, 59, 0.4)" strokeWidth="18" strokeLinecap="round" />
                    <defs>
                        <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="50%" stopColor="#eab308" />
                            <stop offset="100%" stopColor="#ef4444" />
                        </linearGradient>
                    </defs>
                    <motion.path
                        d="M 20 100 A 80 80 0 0 1 180 100"
                        fill="none"
                        stroke="url(#gaugeGradient)"
                        strokeWidth="18"
                        strokeLinecap="round"
                        strokeDasharray="251.2"
                        strokeDashoffset={251.2 - (251.2 * score) / 100}
                        transition={{ duration: 0.8, ease: "circOut" }}
                    />
                    <motion.line
                        x1="100" y1="100" x2="100" y2="25"
                        stroke="white"
                        strokeWidth="4"
                        strokeLinecap="round"
                        initial={{ rotate: -90, originX: "100px", originY: "100px" }}
                        animate={{ rotate: -90 + (score / 100) * 180 }}
                        transition={{ type: "spring", stiffness: 120, damping: 12 }}
                    />
                    <circle cx="100" cy="100" r="6" fill="white" className="shadow-lg" />
                </svg>

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-3 flex flex-col items-center">
                    <span className={`text-5xl font-black ${risk.color} drop-shadow-[0_0_15px_currentColor] tabular-nums tracking-tighter`}>
                        {score}
                    </span>
                </div>
            </div>

            <div className={`text-sm font-black ${risk.color} mt-6 mb-8 tracking-[0.4em] uppercase opacity-90`}>
                {risk.label}
            </div>

            {/* Risk Factors List */}
            <div className="w-full space-y-3 flex-1 overflow-hidden">
                {riskFactors.map((factor) => {
                    const Icon = factor.icon;
                    const isActive = activeFactors.includes(factor.id);
                    return (
                        <div key={factor.id} className="flex justify-between items-center text-xs group/line transition-all duration-300">
                            <span className={`flex items-center gap-3 transition-all ${isActive ? 'text-slate-100 font-black' : 'text-slate-600 opacity-60'}`}>
                                <Icon size={14} className={isActive ? risk.color : 'text-slate-800'} />
                                <span className="tracking-tight">{factor.label}</span>
                            </span>
                            <span className={`font-mono text-[10px] transition-all px-2 py-0.5 rounded ${isActive ? 'bg-red-500/10 text-red-400 font-black' : 'text-slate-800'}`}>
                                +{factor.points}
                            </span>
                        </div>
                    );
                })}
            </div>

            {/* Critical Alert Overlay */}
            <motion.div
                animate={{ opacity: score >= 85 ? [0, 0.2, 0] : 0 }}
                transition={{ duration: 0.4, repeat: Infinity }}
                className="absolute inset-0 bg-red-600 pointer-events-none z-0"
            />
        </div>
    );
};

export default RiskGauge;
