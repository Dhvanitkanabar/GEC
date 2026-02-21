import React from 'react';
import { BarChart3, Fingerprint, ArrowUpRight } from 'lucide-react';

const LiveAnalytics = () => {
    // Mock data for the interaction flux
    const dataPoints = [20, 30, 80, 45, 90, 25, 40, 75, 60, 30, 85, 50];

    return (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm flex flex-col h-full">
            <h4 className="flex items-center justify-between text-blue-100 font-semibold mb-4 tracking-wide text-sm uppercase">
                <span className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-purple-400" />
                    Interaction Flux
                </span>
                <span className="text-[9px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20 font-mono">
                    LIVE
                </span>
            </h4>

            {/* Chart Area */}
            <div className="flex-1 min-h-[100px] flex items-end justify-between gap-1 mb-4 px-2 relative">
                {/* Grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
                    <div className="w-full h-px bg-slate-500 border-t border-dashed border-slate-500" />
                    <div className="w-full h-px bg-slate-500 border-t border-dashed border-slate-500" />
                    <div className="w-full h-px bg-slate-500 border-t border-dashed border-slate-500" />
                </div>

                {dataPoints.map((h, i) => (
                    <div key={i} className="relative w-full group">
                        {/* Bar */}
                        <div
                            className={`w-full rounded-t transition-all duration-300 ${h > 70
                                ? 'bg-gradient-to-t from-red-900/50 to-red-500/80 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                                : 'bg-gradient-to-t from-purple-900/50 to-purple-500/80 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                                }`}
                            style={{ height: `${h}%` }}
                        />
                        {/* Tooltip hint */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] text-white bg-slate-800 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            {h}% Anomalous
                        </div>
                    </div>
                ))}
            </div>

            {/* Metrics Footer */}
            <div className="grid grid-cols-2 gap-2 mt-auto">
                <div className="bg-slate-950/50 p-2 rounded border border-slate-800 flex flex-col overflow-hidden">
                    <span className="text-[9px] text-slate-500 uppercase flex items-center gap-1 truncate">
                        <Fingerprint size={10} className="flex-shrink-0" /> User Entropy
                    </span>
                    <span className="text-slate-200 font-mono text-xs font-bold flex items-center gap-1 truncate">
                        HIGH <ArrowUpRight size={10} className="text-red-500 flex-shrink-0" />
                    </span>
                </div>
                <div className="bg-slate-950/50 p-2 rounded border border-slate-800 flex flex-col overflow-hidden">
                    <span className="text-[9px] text-slate-500 uppercase truncate">Accuracy</span>
                    <span className="text-emerald-400 font-mono text-xs font-bold truncate">
                        99.9%
                    </span>
                </div>
            </div>
        </div>
    );
};

export default LiveAnalytics;
