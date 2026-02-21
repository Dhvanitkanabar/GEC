'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import ProcessingEngine from '@/components/ProcessingEngine';
import RiskGauge from '@/components/RiskGauge';
import AlertSystem from '@/components/AlertSystem';
import { ArrowRight, AlertOctagon, Monitor, Zap, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAudioAlert } from '@/hooks/useAudioAlert';

export default function Home() {
  const [riskScore, setRiskScore] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [clickCount, setClickCount] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  const [activeModule, setActiveModule] = useState(-1);
  const [hackingDetected, setHackingDetected] = useState(false);

  const lastMousePos = useRef({ x: 0, y: 0, time: 0 });
  const clickTimes = useRef<number[]>([]);
  const resetTimer = useRef<NodeJS.Timeout | null>(null);
  const hackingTimer = useRef<NodeJS.Timeout | null>(null);

  // High risk threshold
  const isHighRisk = riskScore > 80;

  // Audio Alert
  useAudioAlert(isHighRisk || hackingDetected);

  const triggerModule = useCallback((index: number) => {
    setActiveModule(index);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setActiveModule(-1), 3000);
  }, []);

  const triggerHackingAlert = useCallback(() => {
    setHackingDetected(true);
    if (hackingTimer.current) clearTimeout(hackingTimer.current);
    hackingTimer.current = setTimeout(() => setHackingDetected(false), 5000);
  }, []);

  const addEvent = useCallback((msg: string) => {
    setEvents(prev => [msg, ...prev].slice(0, 5));
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });

      const now = Date.now();
      const dt = now - lastMousePos.current.time;
      if (dt > 100) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        const velocity = Math.sqrt(dx * dx + dy * dy) / dt;

        if (velocity > 5) {
          setRiskScore(prev => Math.min(100, prev + 5));
          addEvent("ANOMALY: High POS Interaction Velocity");
          triggerModule(0); // Log-Video Sync
        }

        lastMousePos.current = { x: e.clientX, y: e.clientY, time: now };
      }
    };

    const handleClick = () => {
      const now = Date.now();
      clickTimes.current = [...clickTimes.current, now].filter(t => now - t < 1000);
      setClickCount(clickTimes.current.length);

      if (clickTimes.current.length > 5) {
        setRiskScore(prev => Math.min(100, prev + 15));
        addEvent("ANOMALY: Rapid POS Terminal Burst");
        triggerModule(2); // Outlier Bias
      } else {
        setRiskScore(prev => Math.min(100, prev + 1));
        triggerModule(1); // Void Sentinel (Sequence Check)
      }
    };

    const handleBlur = () => {
      setRiskScore(prev => Math.min(100, prev + 30));
      addEvent("SECURITY: System Clock Drift vs NTP");
      triggerModule(4); // Temporal Sync
      triggerHackingAlert();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.key === 'F12') {
        setRiskScore(prev => Math.min(100, prev + 10));
        addEvent(`TAMPER: Unauthorized Key Chord: ${e.key}`);
        triggerModule(3); // Integrity Watcher
        triggerHackingAlert();
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('keydown', handleKeyDown);

    // Decay risk score over time
    const decay = setInterval(() => {
      setRiskScore(prev => Math.max(0, prev - 2));
    }, 1000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('keydown', handleKeyDown);
      clearInterval(decay);
    };
  }, [addEvent, triggerModule, triggerHackingAlert]);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 md:p-8 lg:p-12 flex flex-col items-center relative gap-8">
      {/* Background Tech Grid */}
      <div className="absolute inset-0 tech-grid opacity-20 pointer-events-none" />

      {/* Global Detection Overlay */}
      <AnimatePresence>
        {(isHighRisk || hackingDetected) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center pt-6 px-4"
          >
            <div className={`absolute inset-0 backdrop-blur-sm animate-pulse ${hackingDetected ? 'bg-red-950/80' : 'bg-red-500/10'}`} />

            <motion.div
              initial={{ y: -50, scale: 0.9 }}
              animate={{
                y: 0,
                scale: 1,
                x: hackingDetected ? [0, -2, 2, -1, 0] : 0,
              }}
              transition={{
                x: hackingDetected ? { duration: 0.2, repeat: Infinity, repeatType: "mirror" } : { duration: 0.3 }
              }}
              className={`px-8 py-5 rounded-2xl font-black shadow-[0_0_50px_rgba(220,38,38,0.5)] flex flex-col items-center gap-2 z-50 border-2 transition-colors duration-300 ${hackingDetected ? 'bg-black border-red-600 text-red-500' : 'bg-red-600 border-red-400/50 text-white'}`}
            >
              <div className="flex items-center gap-4">
                <AlertOctagon size={32} className={`${hackingDetected ? 'animate-pulse' : 'animate-bounce'}`} />
                <span className="tracking-tighter uppercase text-xl">
                  {hackingDetected ? "CRITICAL HACKING ATTEMPT DETECTED" : "SYSTEM BREACH DETECTED"}
                </span>
              </div>
              {hackingDetected && (
                <motion.div
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 0.1, repeat: Infinity }}
                  className="text-[10px] font-mono opacity-80 tracking-[0.3em] uppercase"
                >
                  UNAUTHORIZED_TERMINAL_ACCESS_BYPASSED &gt;&gt; LOCKDOWN_INIT
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Title */}
      <header className="mb-8 text-center z-10">
        <motion.h1
          className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 uppercase tracking-tighter drop-shadow-2xl"
          animate={{ scale: isHighRisk ? 1.05 : 1 }}
        >
          Anomaly Monitor
        </motion.h1>
        <p className="text-slate-500 text-sm mt-3 tracking-[0.3em] font-mono opacity-80 uppercase">
          Digital Guard v3.0
        </p>
      </header>

      {/* Main Architecture Diagram - standard 3-column grid */}
      <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10 mb-20 px-4">

        {/* SECTION 1: TELEMETRY */}
        <div className="flex flex-col relative group">
          <div className="absolute -inset-2 bg-gradient-to-b from-blue-500/10 to-transparent rounded-[2.5rem] blur-2xl group-hover:from-blue-500/20 transition-all duration-700" />
          <motion.div
            whileHover={{ y: -5 }}
            className={`border transition-all duration-500 bg-slate-900/60 backdrop-blur-xl rounded-[2rem] p-8 relative z-10 flex flex-col ${isHighRisk ? 'border-red-900/30' : 'border-slate-800/80 shadow-[0_8px_32px_rgba(0,0,0,0.3)]'}`}
          >
            <h2 className="text-blue-400 font-black mb-8 flex items-center gap-3 uppercase text-xs tracking-widest opacity-80">
              <span className="w-8 h-px bg-blue-500/50" />
              01 Telemetry
            </h2>

            <div className="space-y-6">
              <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50 flex flex-col gap-3 group/item hover:bg-slate-900/60 transition-all">
                <div className="flex items-center gap-3 text-blue-400/60 text-[10px] font-black tracking-widest uppercase">
                  <Monitor size={16} /> POS Station 01
                </div>
                <div className="text-slate-200 font-mono text-lg font-medium tabular-nums">
                  REG_ID: <span className="text-blue-400">#PX-442</span> | <span className="opacity-30 text-xs">ONLINE</span>
                </div>
              </div>

              <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50 flex flex-col gap-3 group/item hover:bg-slate-900/60 transition-all">
                <div className="flex items-center gap-3 text-yellow-500/60 text-[10px] font-black tracking-widest uppercase">
                  <Zap size={16} /> Tx Throughput
                </div>
                <div className="text-slate-200 font-mono text-lg font-bold tabular-nums">
                  {Math.floor(clickCount * 1.5)} <span className="opacity-30 text-xs">LOGS/MIN</span>
                </div>
              </div>

              <div className="bg-slate-950/40 p-5 rounded-2xl border border-slate-800/50 flex flex-col gap-4 min-h-[180px]">
                <div className="flex items-center gap-3 text-emerald-500/60 text-[10px] font-black tracking-widest uppercase border-b border-slate-800/80 pb-3">
                  <Activity size={16} /> Security Cross-Feed
                </div>
                <div className="space-y-3">
                  {events.map((e, i) => (
                    <motion.div
                      initial={{ x: -10, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      key={i}
                      className="text-[11px] font-mono text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-800/30"
                    >
                      <span className="text-emerald-500/50 mr-2">[{new Date().toLocaleTimeString([], { hour12: false })}]</span> &gt; {e}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* SECTION 2 & 3: ANALYSIS */}
        <div className="flex flex-col gap-8 relative group">
          <div className={`absolute -inset-4 rounded-[3rem] blur-3xl transition-all duration-700 ${isHighRisk ? 'bg-red-500/10' : 'bg-purple-500/5 group-hover:bg-purple-500/10'}`} />

          {/* Processing Engine */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            className={`border transition-all duration-500 bg-slate-900/60 backdrop-blur-xl rounded-[2.5rem] p-8 relative z-10 flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.5)] ${isHighRisk ? 'border-red-500/30' : 'border-slate-800/80'}`}
          >
            <h2 className="text-purple-400 font-black mb-8 flex items-center gap-3 uppercase text-xs tracking-widest opacity-80">
              <span className="w-8 h-px bg-purple-500/50" />
              02 Analysis
            </h2>
            <ProcessingEngine activeModule={activeModule} />
          </motion.div>

          {/* Risk Scoring */}
          <motion.div
            whileHover={{ scale: 1.02 }}
            className={`border transition-all duration-500 bg-slate-950/60 backdrop-blur-md rounded-3xl p-6 relative z-10 shadow-2xl ${isHighRisk ? 'border-red-500/50' : 'border-slate-800'}`}
          >
            <h2 className="text-red-400 font-black mb-4 flex items-center gap-3 uppercase text-xs tracking-widest opacity-80">
              <span className="w-8 h-px bg-red-500/50" />
              03 Risk Metric
            </h2>
            <RiskGauge score={riskScore} />
          </motion.div>
        </div>

        {/* SECTION 4: PROTOCOLS */}
        <div className="flex flex-col relative group">
          <div className={`absolute -inset-2 rounded-[2.5rem] blur-2xl transition-all duration-700 ${isHighRisk ? 'bg-red-500/20' : 'bg-emerald-500/5 group-hover:bg-emerald-500/10'}`} />
          <motion.div
            whileHover={{ y: -5 }}
            className={`border transition-all duration-500 bg-slate-900/60 backdrop-blur-xl rounded-[2rem] p-8 relative z-10 flex flex-col shadow-2xl ${isHighRisk ? 'border-red-500 shadow-[0_0_40px_rgba(220,38,38,0.3)]' : 'border-slate-800/80'}`}
          >
            <h2 className="text-emerald-400 font-black mb-8 flex items-center gap-3 uppercase text-xs tracking-widest opacity-80">
              <span className="w-8 h-px bg-emerald-500/50" />
              04 Protocol
            </h2>
            <AlertSystem isHighRisk={isHighRisk} />
          </motion.div>
        </div>

      </div>

      <footer className="w-full max-w-7xl pb-12 text-slate-600 text-[10px] font-mono flex flex-wrap justify-between items-center gap-4 border-t border-slate-800/30 pt-8 mt-auto px-4">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            SYSTEM_UPTIME: 14:28:32
          </span>
          <span className="opacity-50">ENVIRONMENT: PRODUCTION_NODE_BRW01</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="tracking-widest uppercase opacity-40">Privacy Protected Engine</span>
          <div className="w-px h-3 bg-slate-800" />
          <span className="text-blue-500/60 font-black">AE-v3 FINAL</span>
        </div>
      </footer>
    </main>
  );
}

// Helper for animated arrows
const RunningArrow = ({ delay = 0, active = true, color = "text-blue-500" }: { delay?: number, active?: boolean, color?: string }) => (
  <div className="relative w-12 h-12 flex items-center justify-center transition-opacity duration-300" style={{ opacity: active ? 1 : 0.2 }}>
    <div className="absolute w-full h-0.5 bg-slate-800" />
    {active && (
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 20, opacity: [0, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity, delay, ease: "linear" }}
      >
        <ArrowRight size={24} className={color} />
      </motion.div>
    )}
  </div>
);
