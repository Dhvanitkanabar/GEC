import React from 'react';
import { Cloud, Wifi } from 'lucide-react';
import InstantAlert from './InstantAlert';
import EvidencePackaging from './EvidencePackaging';
import LiveAnalytics from './LiveAnalytics';

const AlertSystem = ({ isHighRisk }: { isHighRisk: boolean }) => {
    return (
        <div className="flex flex-col gap-4">
            {/* 1. POS Anomaly Alert - High Priority */}
            {/* 1. Instant Theft Alert - High Priority */}
            <div className={`transition-all duration-500 ${isHighRisk ? 'opacity-100 translate-y-0' : 'opacity-30 -translate-y-2 grayscale'}`}>
                <InstantAlert />
            </div>

            {/* 2. Evidence & Analytics (Stacked for better accessibility) */}
            <div className="flex flex-col gap-6 flex-1">
                <div className="animate-in slide-in-from-right-10 fade-in duration-700 delay-100">
                    <EvidencePackaging />
                </div>
                <div className="animate-in slide-in-from-right-10 fade-in duration-700 delay-200">
                    <LiveAnalytics />
                </div>
            </div>

            {/* 3. Cloud Integration Footer */}
            <div className="animate-in slide-in-from-bottom-5 fade-in duration-700 delay-300">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 border border-slate-700/50 rounded-xl p-4 flex justify-between items-center shadow-lg">
                    <div className="flex items-center gap-3 text-slate-400 text-sm font-medium">
                        <div className="p-2 bg-blue-500/10 rounded-lg">
                            <Cloud size={18} className="text-blue-400" />
                        </div>
                        <div>
                            <div className="text-xs text-slate-500 uppercase tracking-wider">Cloud Uplink</div>
                            <div className="text-slate-300">Central Monitoring Station</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-[pulse_1.5s_infinite]" />
                            <div className="w-2 h-2 bg-emerald-500/50 rounded-full animate-[pulse_1.5s_infinite] delay-150" />
                            <div className="w-2 h-2 bg-emerald-500/30 rounded-full animate-[pulse_1.5s_infinite] delay-300" />
                        </div>
                        <div className="h-8 w-px bg-slate-700" />
                        <Wifi size={16} className="text-emerald-500/80" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AlertSystem;
