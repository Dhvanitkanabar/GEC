import React from 'react';
import { Package, Lock, Activity, FileJson, CheckCircle2 } from 'lucide-react';

const EvidencePackaging = () => {
    return (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-5 backdrop-blur-sm hover:border-blue-500/30 transition-colors group">
            <h4 className="flex items-center gap-2 text-blue-100 font-semibold mb-4 tracking-wide text-sm uppercase">
                <Package size={16} className="text-blue-400" />
                Session Forensics
            </h4>

            <div className="grid grid-cols-2 gap-3">
                {/* Telemetry Module */}
                <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-lg flex flex-col gap-2 group-hover:border-blue-500/20 transition-colors overflow-hidden">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-slate-500 font-mono">DUMP_01</span>
                        <Activity size={14} className="text-blue-400/80 flex-shrink-0" />
                    </div>
                    <div className="text-slate-300 text-[11px] font-medium flex items-center gap-2 truncate">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0" />
                        Telemetry Snap
                    </div>
                    <div className="text-[9px] text-slate-500 bg-slate-900 rounded px-1.5 py-0.5 w-fit font-mono">
                        Event_Buffer
                    </div>
                </div>

                {/* LOGS Module */}
                <div className="bg-slate-950/50 border border-slate-800 p-3 rounded-lg flex flex-col gap-2 group-hover:border-blue-500/20 transition-colors overflow-hidden">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] text-slate-500 font-mono">DUMP_02</span>
                        <FileJson size={14} className="text-purple-400/80 flex-shrink-0" />
                    </div>
                    <div className="text-slate-300 text-[11px] font-medium flex items-center gap-2 truncate">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0" />
                        DOM Trace
                    </div>
                    <div className="text-[9px] text-slate-500 bg-slate-900 rounded px-1.5 py-0.5 w-fit font-mono">
                        Encrypted_JSON
                    </div>
                </div>

                {/* Vault Status */}
                <div className="col-span-2 bg-slate-950/30 border border-slate-800/80 p-2 rounded-lg flex justify-between items-center px-4 overflow-hidden">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 truncate">
                        <Lock size={12} className="text-emerald-500 flex-shrink-0" />
                        <span className="font-mono tracking-tighter truncate uppercase">Secure Vault</span>
                    </div>
                    <CheckCircle2 size={14} className="text-emerald-500/80 flex-shrink-0" />
                </div>
            </div>
        </div>
    );
};

export default EvidencePackaging;
