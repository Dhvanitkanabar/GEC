import React from 'react';
import { ShieldAlert, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const InstantAlert = () => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative overflow-hidden bg-red-950/40 border border-red-500/50 rounded-xl p-5 flex items-center gap-5 shadow-[0_0_30px_rgba(220,38,38,0.2)]"
        >
            {/* Background scanning effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent translate-x-[-100%] animate-[shimmer_2s_infinite]" />

            {/* Pulse Rings */}
            <div className="absolute left-8 top-1/2 -translate-y-1/2">
                <div className="absolute w-12 h-12 bg-red-500/30 rounded-full animate-ping" />
                <div className="absolute w-12 h-12 bg-red-500/20 rounded-full animate-ping delay-75" />
            </div>

            <div className="relative bg-gradient-to-br from-red-600 to-red-800 p-4 rounded-full shadow-lg border border-red-400/30 z-10">
                <ShieldAlert className="text-white drop-shadow-md" size={32} />
            </div>

            <div className="z-10 flex-1">
                <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-white font-black text-lg tracking-wider flex items-center gap-2">
                            BREACH
                            <Zap size={14} className="text-yellow-400 animate-pulse" />
                        </h3>
                        <p className="text-red-200/80 text-[10px] font-mono mt-1 flex items-center gap-2 overflow-hidden">
                            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse flex-shrink-0" />
                            <span className="truncate break-all">ANOMALOUS BEHAVIOR DETECTED • SHRTD_TTL &lt;1ms</span>
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default InstantAlert;
