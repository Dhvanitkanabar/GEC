import React, { useState, useEffect } from 'react';
import {
    Activity,
    Zap,
    Monitor,
    BrainCircuit,
    ArrowDown,
    Lock,
    Eye,
    Move
} from 'lucide-react';
import { motion } from 'framer-motion';

interface ModuleCardProps {
    icon: React.ElementType;
    title: string;
    details: string[];
    color?: string;
    isActive: boolean;
}

const colorMap: Record<string, string> = {
    blue: "#3b82f6",
    yellow: "#eab308",
    purple: "#a855f7",
    red: "#ef4444",
    emerald: "#10b981",
    cyan: "#06b6d4",
    orange: "#f97316"
};

const ModuleCard = ({ icon: Icon, title, details, color = "blue", isActive }: ModuleCardProps) => {
    const hexColor = colorMap[color] || colorMap.blue;

    return (
        <motion.div
            animate={{
                borderColor: isActive ? hexColor : 'rgba(51, 65, 85, 0.5)',
                backgroundColor: isActive ? `rgba(15, 23, 42, 0.8)` : 'rgba(30, 41, 59, 0.5)',
                scale: isActive ? 1.02 : 1
            }}
            className={`border p-3 rounded-lg flex items-start gap-3 relative overflow-hidden transition-colors duration-300`}
        >
            <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-400`}>
                <Icon size={20} />
            </div>
            <div>
                <h4 className="text-slate-200 font-medium text-sm">{title}</h4>
                <ul className="text-xs text-slate-500 mt-1 space-y-0.5">
                    {details.map((d: string, i: number) => (
                        <li key={i}>• {d}</li>
                    ))}
                </ul>
            </div>

            {/* Active Scan Line */}
            {isActive && (
                <motion.div
                    layoutId="scan-line"
                    style={{ backgroundColor: hexColor, boxShadow: `0 0 10px ${hexColor}` }}
                    className="absolute left-0 top-0 bottom-0 w-1"
                />
            )}
        </motion.div>
    );
};

const ProcessingEngine = ({ activeModule }: { activeModule: number }) => {
    return (
        <div className="flex flex-col relative w-full">


            {/* AI Core Modules - POS & Log Analysis */}
            <div className="bg-slate-900/60 border-2 border-slate-800/50 rounded-[2rem] p-6 shadow-2xl relative z-10 flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar max-h-[500px]">

                <ModuleCard
                    icon={Monitor}
                    title="Log-Video Sync Engine"
                    details={["Unauthorized Drawer Opens", "Phantom Transactions", "Presence Cross-Ref"]}
                    color="blue"
                    isActive={activeModule === 0}
                />

                <div className="flex justify-center opacity-30 py-0.5">
                    <ArrowDown size={14} className="text-slate-500" />
                </div>

                <ModuleCard
                    icon={Zap}
                    title="Void/Refund Sentinel"
                    details={["Post-Sale Sequence Check", "Departure-Time Matching", "Ghost Void Detection"]}
                    color="yellow"
                    isActive={activeModule === 1}
                />

                <div className="flex justify-center opacity-30 py-0.5">
                    <ArrowDown size={14} className="text-slate-500" />
                </div>

                <ModuleCard
                    icon={BrainCircuit}
                    title="Outlier Bias Profiler"
                    details={["Discount Frequency Spike", "Override Statistical Bias", "Coupon Pattern Mining"]}
                    color="purple"
                    isActive={activeModule === 2}
                />

                <div className="flex justify-center opacity-30 py-0.5">
                    <ArrowDown size={14} className="text-slate-500" />
                </div>

                <ModuleCard
                    icon={Lock}
                    title="Log Integrity Watcher"
                    details={["Hash Chain Discontinuity", "Entry Count Continuity", "Tamper Attempt Flags"]}
                    color="red"
                    isActive={activeModule === 3}
                />

                <div className="flex justify-center opacity-30 py-0.5">
                    <ArrowDown size={14} className="text-slate-500" />
                </div>

                <ModuleCard
                    icon={Activity}
                    title="Temporal Sync Monitor"
                    details={["NTP Time Manipulation", "POS vs. Video Drift", "Timestamp Gaps"]}
                    color="emerald"
                    isActive={activeModule === 4}
                />
            </div>
        </div>
    );
};

export default ProcessingEngine;
