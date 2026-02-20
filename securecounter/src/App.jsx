import { useState, useEffect, useRef, useCallback } from 'react';

// ─── DESIGN TOKENS ──────────────────────────────────────────────────────────
const C = {
  bg: '#080b10', panel: '#0d1117', border: '#1c2333', hdr: '#0f1620',
  text: '#cdd9e5', sub: '#768390', muted: '#444c56',
  blue: '#388bfd', green: '#3fb950', warn: '#d29922', danger: '#f85149', crit: '#dc2626',
  gBg: 'rgba(63,185,80,.10)', wBg: 'rgba(210,153,34,.10)', rBg: 'rgba(220,38,38,.10)', bBg: 'rgba(56,139,253,.10)',
};
const mono = "'SF Mono','Fira Code','Courier New',monospace";
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const fx = lm => ({ ...lm, x: 1 - lm.x });
let _id = 0; const uid = () => `${++_id}`;

// ─── POS SIMULATION DATA ─────────────────────────────────────────────────────
const ITEMS = [
  ['Masala Dosa', 120], ['Paneer Tikka', 280], ['Veg Thali', 220], ['Butter Chicken', 350],
  ['Biryani', 300], ['Chai x2', 40], ['Cold Coffee', 150], ['Dal Makhani', 240], ['Samosa x4', 80],
];
const PAYS = ['💵 Cash', '💵 Cash', '💵 Cash', '💳 Card', '📱 UPI'];
const fmtT = (d = new Date()) => d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtMs = (d = new Date()) => fmtT(d) + '.' + String(d.getMilliseconds()).padStart(3, '0');

// ─── ALERT COORDINATOR ───────────────────────────────────────────────────────
const ALERT_COOLDOWNS = { critical: 4000, high: 5000, medium: 8000, low: 12000 };
const alertCooldownMap = {};
const canFireAlert = (key, sev) => {
  const now = Date.now();
  if (alertCooldownMap[key] && now - alertCooldownMap[key] < ALERT_COOLDOWNS[sev]) return false;
  alertCooldownMap[key] = now;
  return true;
};

// ─── MEDIAPIPE CDN URLS ──────────────────────────────────────────────────────
const MP_URLS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js',
  'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js',
];

// ─── HAND CONNECTIONS (manual fallback) ──────────────────────────────────────
const HCONN = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
[9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];
const POSEUPPER = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]];

// ─── POCKET ZONE NAMES ───────────────────────────────────────────────────────
const ZONES = ['L.CHEST', 'R.CHEST', 'L.PANTS', 'R.PANTS'];
const ZONE_COLORS = {
  CLEAR: { b: 'rgba(59,130,246,0.3)', f: 'rgba(59,130,246,0.04)' },
  PROXIMITY: { b: 'rgba(245,158,11,0.6)', f: 'rgba(245,158,11,0.08)' },
  ENTERING: { b: 'rgba(234,88,12,0.9)', f: 'rgba(234,88,12,0.12)' },
  INSERTED: { b: 'rgba(239,68,68,1)', f: 'rgba(239,68,68,0.18)' },
  CONFIRMED: { b: 'rgba(239,68,68,1)', f: 'rgba(239,68,68,0.25)' },
};
// Updated thresholds: suspicious at 75%, critical at 85%
const confToState = c => c > 0.85 ? 'CONFIRMED' : c > 0.75 ? 'INSERTED' : c > 0.55 ? 'ENTERING' : c > 0.35 ? 'PROXIMITY' : 'CLEAR';
const stateColor = s => s === 'CONFIRMED' || s === 'INSERTED' ? C.danger : s === 'ENTERING' ? C.warn : s === 'PROXIMITY' ? C.warn : C.green;

export default function App() {
  // ── System ──────────────────────────────────────────────────────────────────
  const [fps, setFps] = useState(0);
  const [camStatus, setCamStatus] = useState('off'); // off|connecting|live|error
  const [camErr, setCamErr] = useState('');
  const [mpState, setMpState] = useState('loading'); // loading|ready|fallback
  const [soundOn, setSoundOn] = useState(false);
  const [soundReady, setSoundReady] = useState(false);

  // ── Hand Detection ──────────────────────────────────────────────────────────
  const [handsN, setHandsN] = useState(0);
  const [handStates, setHandStates] = useState({ left: 'CLEAR', right: 'CLEAR' });
  const [handConf, setHandConf] = useState({ left: 0, right: 0 });
  const [handZone, setHandZone] = useState({ left: null, right: null });
  const [handDwell, setHandDwell] = useState({ left: 0, right: 0 });
  const [signals, setSignals] = useState({ pos: 0, curl: 0, vel: 0, dwell: 0, rot: 0 });
  const [detectionLog, setDetectionLog] = useState([]);
  const [pocketEvents, setPocketEvents] = useState([]);

  // ── POS & Drawer ────────────────────────────────────────────────────────────
  const [posEvents, setPosEvents] = useState([]);
  const [drawerSt, setDrawerSt] = useState('CLOSED');
  const [drawerDur, setDrawerDur] = useState(0);
  const [openCountWin, setOpenCountWin] = useState(0);
  const [linkStatus, setLinkStatus] = useState('CLEAR');
  const [linkGap, setLinkGap] = useState(null);
  const [cashMismatch, setCashMismatch] = useState(null);
  const [e1St, setE1St] = useState('OK'); const [e2St, setE2St] = useState('OK');
  const [e3St, setE3St] = useState('OK'); const [e4St, setE4St] = useState('OK');
  const [overallRisk, setOverallRisk] = useState(0);
  const [multiEngine, setMultiEngine] = useState(null);
  const [syncDelta, setSyncDelta] = useState(null);
  const [corrStatus, setCorrStatus] = useState('SYNCED');
  const [unauthOpens, setUnauthOpens] = useState(0);

  // ── KPI ─────────────────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState(47);
  const [alertCount, setAlertCount] = useState(0);
  const [accuracy, setAccuracy] = useState(94.7);
  const [latency, setLatency] = useState(127);
  const [uptime, setUptime] = useState('00:00:00');

  // ── Alerts ──────────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState([]);

  // ── Refs: System ────────────────────────────────────────────────────────────
  const isMountedRef = useRef(true);
  const rafRef = useRef(null);
  const frameRef = useRef(0);
  const fpsCntRef = useRef(0);
  const fpsTimeRef = useRef(performance.now());
  const lastMPTimeRef = useRef(0);

  // ── Refs: Camera ────────────────────────────────────────────────────────────
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const miniCanvasRef = useRef(null);
  const streamRef = useRef(null);

  // ── Refs: MediaPipe ─────────────────────────────────────────────────────────
  const handsRef = useRef(null);
  const poseRef = useRef(null);
  const handResultsRef = useRef(null);
  const poseResultsRef = useRef(null);
  const pocketZonesRef = useRef([]);
  const mpReadyRef = useRef(false);
  const fallbackTimerRef = useRef(null);

  // ── Refs: Hand detection ────────────────────────────────────────────────────
  const wristTrailRef = useRef({ left: [], right: [] });     // raw positions for velocity
  const smoothedLmRef = useRef({ left: null, right: null }); // EMA-smoothed landmark arrays
  const velHistRef   = useRef({ left: [], right: [] });      // last-3 velocity samples
  const dwellStartRef = useRef({ left: null, right: null }); // time wrist entered current zone
  const zoneEntryTsRef = useRef({ left: null, right: null }); // anti-bypass entry timestamp
  const confirmCntRef = useRef([[0, 0, 0, 0], [0, 0, 0, 0]]); // [hand][zone] frame counter
  const handStateRef = useRef({ left: 'CLEAR', right: 'CLEAR' });
  const handCoolRef  = useRef({ left: 0, right: 0 });        // per-hand cooldown (ms)
  const beepCoolRef  = useRef({});
  const sustainedRef = useRef(null);

  // ── Refs: Audio ─────────────────────────────────────────────────────────────
  const audioCtxRef = useRef(null);

  // ── Refs: Drawer engines ────────────────────────────────────────────────────
  const drawerOpenTimeRef = useRef(null);
  const durIntervalRef = useRef(null);
  const openTsRef = useRef([]);
  const lastSaleTsRef = useRef(0);
  const lastSaleAmtRef = useRef(0);
  const e1CoolRef = useRef(false);
  const e2CoolRef = useRef(false);
  const e3CoolRef = useRef(false);
  const e4CoolRef = useRef(false);

  // ── Refs: Intervals ─────────────────────────────────────────────────────────
  const posIntervalRef = useRef(null);
  const drawerIntervalRef = useRef(null);
  const customerIntervalRef = useRef(null);
  const uptimeIntervalRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      handsRef.current?.close?.();
      poseRef.current?.close?.();
      clearTimeout(fallbackTimerRef.current);
      clearInterval(sustainedRef.current);
      [posIntervalRef, drawerIntervalRef, customerIntervalRef,
        durIntervalRef, uptimeIntervalRef].forEach(r => clearInterval(r.current));
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close().catch(() => { });
    };
  }, []);

  // ── Session uptime ───────────────────────────────────────────────────────────
  useEffect(() => {
    uptimeIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      const s = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const h = String(Math.floor(s / 3600)).padStart(2, '0');
      const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      const sc = String(s % 60).padStart(2, '0');
      setUptime(`${h}:${m}:${sc}`);
    }, 1000);
    return () => clearInterval(uptimeIntervalRef.current);
  }, []);

  // ── Customer count ────────────────────────────────────────────────────────────
  useEffect(() => {
    customerIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) return;
      if (Math.random() < 0.3) setCustomers(p => p + 1);
      setAccuracy(p => Math.max(93, Math.min(97, p + (Math.random() - 0.5) * 0.2)));
    }, 8000);
    return () => clearInterval(customerIntervalRef.current);
  }, []);

  // ── Audio ─────────────────────────────────────────────────────────────────────
  const initAudio = useCallback(() => {
    if (audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    audioCtxRef.current = ctx;
    setSoundReady(true); setSoundOn(true);
  }, []);

  const playBeep = useCallback((level = 'entering') => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state !== 'running') return;
    const now = Date.now();
    const cooldown = level === 'confirmed' ? 3000 : level === 'inserted' ? 2000 : 2500;
    if (beepCoolRef.current[level] && now - beepCoolRef.current[level] < cooldown) return;
    beepCoolRef.current[level] = now;
    const configs = {
      entering: [{ f: 880, d: 0.15, v: 0.3, t: 'sine', delay: 0 }],
      inserted: [{ f: 1100, d: 0.12, v: 0.5, t: 'square', delay: 0 }, { f: 1100, d: 0.12, v: 0.5, t: 'square', delay: 0.2 }],
      confirmed: [{ f: 1400, d: 0.10, v: 0.8, t: 'sawtooth', delay: 0 }, { f: 1400, d: 0.10, v: 0.8, t: 'sawtooth', delay: 0.15 }, { f: 1400, d: 0.10, v: 0.8, t: 'sawtooth', delay: 0.3 }],
      alert: [{ f: 660, d: 0.25, v: 0.4, t: 'sine', delay: 0 }],
    };
    (configs[level] || configs.alert).forEach(({ f, d, v, t, delay }) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = t; osc.frequency.value = f;
      gain.gain.setValueAtTime(v, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + d);
      osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + d + 0.05);
    });
  }, []);

  // ── Alert dispatcher ──────────────────────────────────────────────────────────
  const addAlert = useCallback((key, sev, title, detail, extra = {}) => {
    if (!canFireAlert(key, sev)) return;
    const a = { id: uid(), sev, title, detail, time: fmtMs(), ...extra };
    if (!isMountedRef.current) return;
    setAlerts(p => [a, ...p].slice(0, 5));
    setAlertCount(p => p + 1);
    setLatency(Math.floor(Math.random() * 80) + 80);
    if (sev === 'critical') playBeep('confirmed');
    else if (sev === 'high') playBeep('inserted');
    else playBeep('alert');
  }, [playBeep]);

  // ── MediaPipe loading ─────────────────────────────────────────────────────────
  const initMediaPipe = useCallback(() => {
    if (!window.Hands || !window.Pose) { setMpState('fallback'); return; }
    try {
      const h = new window.Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
      h.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.75, minTrackingConfidence: 0.6 });
      h.onResults(res => { handResultsRef.current = res; });
      handsRef.current = h;

      const p = new window.Pose({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
      p.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
      p.onResults(res => { poseResultsRef.current = res; });
      poseRef.current = p;

      mpReadyRef.current = true;
      clearTimeout(fallbackTimerRef.current);
      if (isMountedRef.current) setMpState('ready');
    } catch (e) { if (isMountedRef.current) setMpState('fallback'); }
  }, []);

  const activateFallback = useCallback(() => {
    if (!mpReadyRef.current && isMountedRef.current) setMpState('fallback');
  }, []);

  useEffect(() => {
    const loadScript = src => new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src; s.crossOrigin = 'anonymous';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    fallbackTimerRef.current = setTimeout(activateFallback, 12000);
    loadScript(MP_URLS[0])
      .then(() => loadScript(MP_URLS[1]))
      .then(() => loadScript(MP_URLS[2]))
      .then(() => { if (isMountedRef.current) initMediaPipe(); })
      .catch(() => { if (isMountedRef.current) activateFallback(); });
    return () => clearTimeout(fallbackTimerRef.current);
  }, [initMediaPipe, activateFallback]);

  // ── Pocket zone calculation from pose ────────────────────────────────────────
  // All pose landmark X values are flipped for mirrored video (CSS scaleX(-1))
  const calcPocketZones = useCallback((lm) => {
    if (!lm || lm.length < 27) return;
    const ls = fx(lm[11]), rs = fx(lm[12]), lh = fx(lm[23]), rh = fx(lm[24]), lk = fx(lm[25]), rk = fx(lm[26]);
    const sw = rs.x - ls.x, th = lh.y - ls.y;
    if (sw < 0.05) return;
    // Store torso center X for hand-side validation in analyzeHand
    pocketZonesRef.current = [
      { name: 'L.CHEST', cx: ls.x + sw * 0.22, cy: ls.y + th * 0.20, w: sw * 0.20, h: th * 0.18 },
      { name: 'R.CHEST', cx: rs.x - sw * 0.22, cy: rs.y + th * 0.20, w: sw * 0.20, h: th * 0.18 },
      { name: 'L.PANTS', cx: lh.x - sw * 0.12, cy: lh.y + (lk.y - lh.y) * 0.28, w: sw * 0.28, h: (lk.y - lh.y) * 0.38 },
      { name: 'R.PANTS', cx: rh.x + sw * 0.12, cy: rh.y + (rk.y - rh.y) * 0.28, w: sw * 0.28, h: (rk.y - rh.y) * 0.38 },
    ];
    // Store torso midpoint X for side validation
    pocketZonesRef.current._torsoMidX = (ls.x + rs.x) / 2;
  }, []);

  // ── EMA landmark smoother ─────────────────────────────────────────────────────
  // Applies exponential moving average: 70% previous + 30% current per landmark
  const smoothLandmarks = useCallback((rawLm, side) => {
    const prev = smoothedLmRef.current[side];
    if (!prev || prev.length !== rawLm.length) {
      // First frame: clone raw into smoothed
      smoothedLmRef.current[side] = rawLm.map(p => ({ ...p, x: 1 - p.x })); // also apply mirror flip
      return smoothedLmRef.current[side];
    }
    smoothedLmRef.current[side] = rawLm.map((p, i) => ({
      ...p,
      x: prev[i].x * 0.7 + (1 - p.x) * 0.3,   // mirror flip + smooth
      y: prev[i].y * 0.7 + p.y * 0.3,
      z: prev[i].z * 0.7 + p.z * 0.3,
    }));
    return smoothedLmRef.current[side];
  }, []);

  // ── 5-signal hand fusion (improved) ──────────────────────────────────────────
  // Uses smoothed, mirror-corrected landmarks throughout.
  // Weights: position 40%, curl 25%, dwell 20%, velocity 10%, rotation 5%
  const analyzeHand = useCallback((rawLm, handIdx, frameTime) => {
    const side = handIdx === 0 ? 'left' : 'right';

    // Apply EMA smoothing + mirror correction to all landmarks
    const lm = smoothLandmarks(rawLm, side);
    const wrist = lm[0]; // already mirror-flipped by smoothLandmarks

    // ── SIGNAL 1: Wrist position / proximity ─────────────────────────────────
    // Hand-side validation: compare wrist.x to torso midpoint.
    // Left hand should approach left zones, right hand right zones.
    const torsoMid = pocketZonesRef.current._torsoMidX ?? 0.5;
    const isLeftHand = wrist.x < torsoMid;
    // Only score zones that match the hand side (prevents cross-body false positives)
    const zones = pocketZonesRef.current.filter ? pocketZonesRef.current : [];

    // ── SIGNAL 2: Finger curl (index + middle only — more reliable) ───────────
    // Uses smoothed Y values. Tip Y above MCP Y = extended; below = curled.
    const idxCurl  = clamp((lm[8].y  - lm[5].y)  / 0.12, 0, 1);
    const midCurl  = clamp((lm[12].y - lm[9].y)  / 0.12, 0, 1);
    const ringCurl = clamp((lm[16].y - lm[13].y) / 0.12, 0, 1);
    const curl     = (idxCurl + midCurl + ringCurl) / 3;

    // ── SIGNAL 3: Velocity (3-frame averaged, prevents spike) ────────────────
    const trail = wristTrailRef.current[side];
    trail.push({ x: wrist.x, y: wrist.y, t: frameTime });
    if (trail.length > 20) trail.shift();

    let instantVel = 0;
    if (trail.length >= 4) {
      // Average velocity across last 3 inter-frame gaps
      const vels = [];
      for (let i = trail.length - 1; i >= trail.length - 3 && i > 0; i--) {
        const dt = Math.max(trail[i].t - trail[i - 1].t, 1);
        vels.push(dist(trail[i], trail[i - 1]) / dt * 1000); // px/s in normalized coords
      }
      instantVel = vels.reduce((a, v) => a + v, 0) / vels.length;
    }
    // Smooth velocity history (3-sample window)
    const velHist = velHistRef.current[side];
    velHist.push(instantVel);
    if (velHist.length > 3) velHist.shift();
    const smoothVel = velHist.reduce((a, v) => a + v, 0) / velHist.length;
    // Lower velocity = more suspicious (hand lingering, not passing through)
    const velScore = 1 - clamp(smoothVel / 0.04, 0, 1);

    // ── SIGNAL 5: Wrist rotation ──────────────────────────────────────────────
    const rot = clamp(Math.abs(Math.atan2(
      lm[17].y - lm[1].y,
      lm[17].x - lm[1].x
    )) / (Math.PI / 2), 0, 1);

    let maxConf = 0, bestZone = -1, bestDwellScore = 0;
    const allZones = Array.isArray(pocketZonesRef.current) ? pocketZonesRef.current : [];

    allZones.forEach((z, zi) => {
      // Hand-side gate: left hand only scores L.* zones and vice versa
      const zoneIsLeft = z.name.startsWith('L.');
      if (isLeftHand !== zoneIsLeft) {
        // Still reset confirmation counter if out of matching zone
        confirmCntRef.current[handIdx][zi] = 0;
        return;
      }

      // S1: proximity (strict rectangle + radial falloff outside)
      const dx = wrist.x - z.cx, dy = wrist.y - z.cy;
      const inZone = Math.abs(dx) < z.w / 2 && Math.abs(dy) < z.h / 2;
      const r = Math.sqrt((z.w / 2) ** 2 + (z.h / 2) ** 2);
      const prox = clamp(1 - Math.sqrt(dx * dx + dy * dy) / r, 0, 1);

      // S4: dwell — require minimum 400ms before scoring any dwell
      let dwellScore = 0;
      if (inZone) {
        if (!dwellStartRef.current[side]) {
          dwellStartRef.current[side] = Date.now();
          zoneEntryTsRef.current[side] = Date.now(); // anti-bypass timestamp
        }
        const ds = (Date.now() - dwellStartRef.current[side]) / 1000;
        // Dwell score only starts after 400ms (anti-bypass rule)
        if (ds >= 0.4) {
          dwellScore = ds > 3.0 ? 1.0 : ds > 1.5 ? 0.8 : ds > 0.8 ? 0.6 : 0.3;
        }
      } else {
        dwellStartRef.current[side] = null;
      }

      // Weighted confidence: position 40%, curl 25%, dwell 20%, velocity 10%, rotation 5%
      const conf = prox * 0.40 + curl * 0.25 + dwellScore * 0.20 + velScore * 0.10 + rot * 0.05;

      if (conf > maxConf) { maxConf = conf; bestZone = zi; bestDwellScore = dwellScore; }

      // 12-frame confirmation counter (stricter than before)
      if (inZone && conf > 0.55) {
        confirmCntRef.current[handIdx][zi]++;
      } else {
        confirmCntRef.current[handIdx][zi] = 0;
      }
    });

    return {
      conf: maxConf,
      zoneIdx: bestZone,
      curl,
      velScore,
      rot,
      dwellScore: bestDwellScore,
      signals: { pos: maxConf, curl, vel: velScore, dwell: bestDwellScore, rot },
    };
  }, [smoothLandmarks]);

  // ── Process hand results ──────────────────────────────────────────────────────
  // Hand side is determined two ways:
  //   1. MediaPipe handedness label (flipped because video is mirrored)
  //   2. Wrist.x vs torso midpoint (secondary validation computed inside analyzeHand)
  const processHands = useCallback(() => {
    const res = handResultsRef.current;
    if (!res) return;
    const hands = res.multiHandLandmarks || [];
    if (!isMountedRef.current) return;
    setHandsN(hands.length);

    const newStates = { left: 'CLEAR', right: 'CLEAR' };
    const newConf   = { left: 0, right: 0 };
    const newZone   = { left: null, right: null };
    const newDwell  = { left: 0, right: 0 };
    let maxConf = 0, maxSigs = { pos: 0, curl: 0, vel: 0, dwell: 0, rot: 0 };
    const now = Date.now();

    hands.forEach((lm, i) => {
      if (i >= 2) return;
      // MediaPipe labels are flipped for mirrored video: 'Left' label = right hand visually
      const side = res.multiHandedness?.[i]?.label === 'Left' ? 'right' : 'left';
      const handIdx = side === 'left' ? 0 : 1;

      // ── Per-hand 3-second cooldown after confirmed detection ────────────────
      if (now - handCoolRef.current[side] < 3000) return;

      const { conf, zoneIdx, dwellScore, signals: sigs } = analyzeHand(lm, handIdx, now);
      const state = confToState(conf);
      newStates[side] = state;
      newConf[side]   = conf;
      if (zoneIdx >= 0) newZone[side] = ZONES[zoneIdx];
      if (dwellStartRef.current[side]) {
        newDwell[side] = (now - dwellStartRef.current[side]) / 1000;
      }
      if (conf > maxConf) { maxConf = conf; maxSigs = sigs; }

      // ── Anti-bypass: ignore zone contact < 200ms ────────────────────────────
      const entryAge = zoneEntryTsRef.current[side]
        ? now - zoneEntryTsRef.current[side]
        : 0;
      if (entryAge < 200) return; // too brief — not a real insertion attempt

      // ── Fire alert on 12 consecutive confirmed frames ───────────────────────
      if (zoneIdx >= 0 && confirmCntRef.current[handIdx][zoneIdx] === 12) {
        const zoneName = ZONES[zoneIdx];
        // Only fire at suspicious (>75%) and critical (>85%) thresholds
        if (conf < 0.75) return;
        const sev = conf > 0.85 ? 'critical' : 'high';
        addAlert(
          `pocket_${side}_${zoneIdx}`, sev,
          `Hand-to-Pocket: ${zoneName}`,
          `${side === 'left' ? 'Left' : 'Right'} hand inserted into ${zoneName} pocket — ${Math.round(conf * 100)}% confidence`,
          { zone: 'Counter Zone A' }
        );
        const beepLevel = conf > 0.85 ? 'confirmed' : 'inserted';
        playBeep(beepLevel);
        // Set per-hand cooldown (3 seconds)
        handCoolRef.current[side] = now;
        setDetectionLog(p => [{
          id: uid(), time: fmtMs(), hand: side, zone: zoneName,
          conf: Math.round(conf * 100), sev,
        }, ...p].slice(0, 4));
      }
    });

    // Clear smoothed state for hands that disappeared
    if (hands.length === 0) {
      smoothedLmRef.current = { left: null, right: null };
      velHistRef.current    = { left: [], right: [] };
      dwellStartRef.current = { left: null, right: null };
      zoneEntryTsRef.current = { left: null, right: null };
      confirmCntRef.current  = [[0,0,0,0],[0,0,0,0]];
    }

    setHandStates(newStates);
    setHandConf(newConf);
    setHandZone(newZone);
    setHandDwell(newDwell);
    if (maxConf > 0) setSignals(maxSigs);
  }, [analyzeHand, addAlert, playBeep]);

  // ── Process pose results ──────────────────────────────────────────────────────
  const processPose = useCallback(() => {
    const res = poseResultsRef.current;
    if (!res?.poseLandmarks) return;
    calcPocketZones(res.poseLandmarks);
  }, [calcPocketZones]);

  // ── Gesture simulation (fallback) ─────────────────────────────────────────────
  const simGestureRef = useRef(null);
  const runSimGesture = useCallback(() => {
    if (!isMountedRef.current) return;
    const r = Math.random();
    const conf = r < 0.05 ? 0.88 : r < 0.12 ? 0.75 : r < 0.22 ? 0.55 : r < 0.40 ? 0.35 : 0.10;
    const zoneIdx = Math.floor(Math.random() * 4);
    const side = r < 0.5 ? 'left' : 'right';
    setHandsN(1);
    setHandConf(p => ({ ...p, [side]: conf }));
    setHandStates(p => ({ ...p, [side]: confToState(conf) }));
    if (zoneIdx >= 0) setHandZone(p => ({ ...p, [side]: ZONES[zoneIdx] }));
    setSignals({ pos: conf, curl: conf * 0.8, vel: 0.6, dwell: conf * 0.5, rot: conf * 0.4 });
    if (conf > 0.70 && canFireAlert(`sim_${side}_${zoneIdx}`, conf > 0.85 ? 'critical' : 'high')) {
      const sev = conf > 0.85 ? 'critical' : 'high';
      addAlert(`sim_${side}_${zoneIdx}`, sev,
        `Hand-to-Pocket: ${ZONES[zoneIdx]}`,
        `${side} hand detected near ${ZONES[zoneIdx]} — ${Math.round(conf * 100)}%`,
        { zone: 'Counter Zone A' }
      );
    }
    clearTimeout(simGestureRef.current);
    simGestureRef.current = setTimeout(runSimGesture, 3000 + Math.random() * 5000);
  }, [addAlert]);

  // ── Canvas drawing ────────────────────────────────────────────────────────────
  const drawFrame = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const video = videoRef.current;
    if (video) { c.width = video.clientWidth || c.offsetWidth; c.height = video.clientHeight || c.offsetHeight; }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const W = c.width, H = c.height;
    const now = Date.now();

    // Draw counter zone (static dashed)
    ctx.save();
    ctx.strokeStyle = 'rgba(59,130,246,0.25)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(W * 0.15, H * 0.50, W * 0.70, H * 0.44);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(56,139,253,0.6)';
    ctx.font = '9px ' + mono;
    ctx.fillText('COUNTER ZONE — MONITORED', W * 0.16, H * 0.50 - 4);
    ctx.restore();

    // Draw pose skeleton
    const pose = poseResultsRef.current;
    if (pose?.poseLandmarks) {
      const lm = pose.poseLandmarks;
      ctx.save(); ctx.strokeStyle = 'rgba(100,120,160,0.35)'; ctx.lineWidth = 1.5;
      POSEUPPER.forEach(([a, b]) => {
        const pa = lm[a], pb = lm[b];
        ctx.beginPath(); ctx.moveTo((1 - pa.x) * W, pa.y * H); ctx.lineTo((1 - pb.x) * W, pb.y * H); ctx.stroke();
      });
      ctx.restore();
    }

    // Draw pocket zones
    const zones = pocketZonesRef.current;
    zones.forEach((z, zi) => {
      const maxConf = Math.max(
        confirmCntRef.current[0][zi] > 0 ? (handResultsRef.current?.multiHandLandmarks?.[0] ? 0.5 : 0) : 0,
        confirmCntRef.current[1][zi] > 0 ? 0.5 : 0
      );
      // Use handConf state to determine zone state - use ref for immediate drawing
      const state = 'CLEAR';
      const col = ZONE_COLORS[state];
      ctx.save();
      const zx = (z.cx - z.w / 2) * W, zy = (z.cy - z.h / 2) * H, zw = z.w * W, zh = z.h * H;
      ctx.fillStyle = col.f; ctx.fillRect(zx, zy, zw, zh);
      ctx.strokeStyle = col.b; ctx.lineWidth = 1.5; ctx.strokeRect(zx, zy, zw, zh);
      ctx.fillStyle = 'rgba(59,130,246,0.7)'; ctx.font = '8px ' + mono;
      ctx.fillText(z.name, zx + 2, zy - 2);
      ctx.restore();
    });

    // Draw hands
    const hands = handResultsRef.current;
    if (hands?.multiHandLandmarks) {
      hands.multiHandLandmarks.forEach((lm, hi) => {
        const side = hands.multiHandedness?.[hi]?.label === 'Left' ? 'right' : 'left';
        const conf = hi === 0 ? (handResultsRef.current ? 0.3 : 0) : 0;
        const col = conf > 0.70 ? C.danger : conf > 0.50 ? C.warn : C.green;
        ctx.save();
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        HCONN.forEach(([a, b]) => {
          const pa = lm[a], pb = lm[b];
          ctx.beginPath(); ctx.moveTo((1 - pa.x) * W, pa.y * H); ctx.lineTo((1 - pb.x) * W, pb.y * H); ctx.stroke();
        });
        lm.forEach(pt => {
          ctx.beginPath(); ctx.arc((1 - pt.x) * W, pt.y * H, 3, 0, Math.PI * 2);
          ctx.fillStyle = col; ctx.fill();
        });
        // Wrist pulse
        const wr = lm[0];
        ctx.beginPath(); ctx.arc((1 - wr.x) * W, wr.y * H, 6 + Math.sin(now / 300) * 2, 0, Math.PI * 2);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      });
    }

    // Wrist trails
    ['left', 'right'].forEach((side, si) => {
      const trail = wristTrailRef.current[side];
      trail.forEach((pt, i) => {
        const alpha = (i + 1) / trail.length * 0.7;
        ctx.beginPath(); ctx.arc(pt.x * W, pt.y * H, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(248,81,73,${alpha})`; ctx.fill();
      });
    });

    // Risk HUD (top right)
    const maxConf = Math.max(handConf?.left || 0, handConf?.right || 0);
    const hudX = W - 22, hudY = 20, hudH = 80;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(hudX - 2, hudY - 14, 20, hudH + 20);
    const fillH = hudH * maxConf;
    const hCol = maxConf > 0.70 ? C.danger : maxConf > 0.50 ? C.warn : C.green;
    ctx.fillStyle = hCol; ctx.fillRect(hudX, hudY + hudH - fillH, 8, fillH);
    ctx.strokeStyle = '#444c56'; ctx.lineWidth = 1; ctx.strokeRect(hudX, hudY, 8, hudH);
    ctx.fillStyle = '#768390'; ctx.font = '7px ' + mono;
    ctx.fillText('RISK', hudX - 1, hudY - 4);
    ctx.restore();
  }, [handConf]);

  // ── Mini canvas (wrist trail) ─────────────────────────────────────────────────
  const drawMiniCanvas = useCallback(() => {
    const c = miniCanvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, c.width, c.height);
    const zones = pocketZonesRef.current;
    zones.forEach(z => {
      ctx.fillStyle = 'rgba(56,139,253,0.08)';
      ctx.fillRect((z.cx - z.w / 2) * c.width, (z.cy - z.h / 2) * c.height, z.w * c.width, z.h * c.height);
    });
    ['left', 'right'].forEach(side => {
      const trail = wristTrailRef.current[side];
      if (trail.length < 2) return;
      trail.forEach((pt, i) => {
        const ratio = i / trail.length;
        const r = Math.floor(63 + ratio * 192), g = Math.floor(185 - ratio * 155), b = 80;
        ctx.beginPath(); ctx.arc(pt.x * c.width, pt.y * c.height, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill();
      });
    });
  }, []);

  // ── Main RAF loop ─────────────────────────────────────────────────────────────
  const startLoop = useCallback(async () => {
    const loop = async () => {
      if (!isMountedRef.current) return;
      const now = performance.now();
      fpsCntRef.current++;
      if (now - fpsTimeRef.current >= 1000) {
        setFps(fpsCntRef.current); fpsCntRef.current = 0; fpsTimeRef.current = now;
      }
      frameRef.current++;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && mpReadyRef.current) {
        const elapsed = now - lastMPTimeRef.current;
        if (elapsed >= 66) { // ~15fps for MP processing
          lastMPTimeRef.current = now;
          if (frameRef.current % 2 === 0) {
            try { await handsRef.current?.send({ image: v }); } catch (e) { }
            processHands();
          } else {
            try { await poseRef.current?.send({ image: v }); } catch (e) { }
            processPose();
          }
        }
      }
      drawFrame();
      drawMiniCanvas();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [processHands, processPose, drawFrame, drawMiniCanvas]);

  // ── Camera start/stop ─────────────────────────────────────────────────────────
  const startCam = useCallback(async () => {
    setCamStatus('connecting'); setCamErr(''); initAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
      if (!isMountedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      const v = videoRef.current;
      v.muted = true; v.playsInline = true; v.srcObject = stream;
      v.onloadedmetadata = () => {
        v.play().then(() => {
          if (!isMountedRef.current) return;
          setCamStatus('live');
          if (mpState === 'fallback') {
            simGestureRef.current = setTimeout(runSimGesture, 1000);
          }
          startLoop();
        }).catch(() => setCamStatus('error'));
      };
    } catch (e) {
      setCamStatus('error');
      setCamErr(e.name === 'NotAllowedError' ? 'Camera permission denied' : e.name === 'NotFoundError' ? 'No camera found' : 'Camera unavailable');
    }
  }, [initAudio, mpState, runSimGesture, startLoop]);

  const stopCam = useCallback(() => {
    cancelAnimationFrame(rafRef.current); rafRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearTimeout(simGestureRef.current);
    handsRef.current?.close?.(); poseRef.current?.close?.();
    setCamStatus('off'); setFps(0); setHandsN(0);
    setHandStates({ left: 'CLEAR', right: 'CLEAR' }); setHandConf({ left: 0, right: 0 });
  }, []);

  const [camOn, setCamOn] = useState(false);
  const toggleCam = useCallback(() => {
    if (camOn) { stopCam(); setCamOn(false); } else { setCamOn(true); startCam(); }
  }, [camOn, startCam, stopCam]);

  // ── POS simulation ────────────────────────────────────────────────────────────
  const schedulePOS = useCallback(() => {
    posIntervalRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      const now = new Date(); const r = Math.random();
      let ev;
      if (r < 0.10) {
        const hasCmd = Math.random() > 0.30;
        ev = { id: uid(), icon: hasCmd ? '🔓' : '🚨', type: 'Drawer', desc: hasCmd ? 'Auth Open' : 'UNAUTHORIZED', amt: null, time: fmtMs(now), alert: !hasCmd };
        if (!hasCmd) {
          setUnauthOpens(p => p + 1);
          addAlert('drawer_unauth', 'critical', 'Unauthorized Drawer Open', 'Drawer opened without POS command', { zone: 'Counter Zone A' });
          setCorrStatus('MISMATCH'); setSyncDelta(null);
        } else {
          const dt = Math.floor(Math.random() * 600) - 100; setSyncDelta(dt);
          setCorrStatus(Math.abs(dt) < 2000 ? 'SYNCED' : 'MISMATCH');
        }
      } else if (r < 0.15) {
        const [name, amt] = ITEMS[Math.floor(Math.random() * ITEMS.length)];
        ev = { id: uid(), icon: '🗑️', type: 'Void', desc: name, amt, time: fmtMs(now), alert: true };
        addAlert('pos_void', 'medium', 'Bill Void Detected', `Voided: ${name} ₹${amt}`, {});
      } else {
        const [name, amt] = ITEMS[Math.floor(Math.random() * ITEMS.length)];
        const pay = PAYS[Math.floor(Math.random() * PAYS.length)];
        ev = { id: uid(), icon: pay.split(' ')[0], type: pay.split(' ')[1], desc: name, amt, time: fmtMs(now), alert: false };
        lastSaleTsRef.current = Date.now(); lastSaleAmtRef.current = amt;
      }
      setPosEvents(p => [ev, ...p].slice(0, 6));
      schedulePOS();
    }, 6000 + Math.random() * 9000);
  }, [addAlert]);
  useEffect(() => { schedulePOS(); return () => clearTimeout(posIntervalRef.current); }, [schedulePOS]);

  // ── Drawer engine simulation ───────────────────────────────────────────────────
  const engineStatusToScore = { OK: 0, WARN: 25, SUSPICIOUS: 60, CRITICAL: 90 };
  const computeOverall = (e1, e2, e3, e4) =>
    Math.round((engineStatusToScore[e1] || 0) * 0.25 + (engineStatusToScore[e2] || 0) * 0.25 +
      (engineStatusToScore[e3] || 0) * 0.30 + (engineStatusToScore[e4] || 0) * 0.20);

  const simulateDrawerOpen = useCallback(() => {
    if (!isMountedRef.current) return;
    const hasSale = Math.random() > 0.25;
    if (hasSale) { lastSaleTsRef.current = Date.now() - Math.floor(Math.random() * 8000); }
    setDrawerSt('OPEN'); drawerOpenTimeRef.current = Date.now();
    setDrawerDur(0);
    clearInterval(durIntervalRef.current);
    durIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) { clearInterval(durIntervalRef.current); return; }
      const dur = (Date.now() - drawerOpenTimeRef.current) / 1000;
      setDrawerDur(dur);
      let e1 = 'OK';
      if (dur > 25 && !e1CoolRef.current) { e1 = 'CRITICAL'; e1CoolRef.current = true; addAlert('e1_crit', 'critical', `⏱ Drawer Open ${dur.toFixed(0)}s`, `Critical: ${dur.toFixed(1)}s open (max 8s)`, {}); }
      else if (dur > 15 && !e1CoolRef.current) { e1 = 'SUSPICIOUS'; addAlert('e1_susp', 'high', `⚠️ Drawer Open ${dur.toFixed(0)}s`, `Suspicious: ${dur.toFixed(1)}s open`, {}); }
      else if (dur > 10) e1 = 'WARN';
      setE1St(e1);
    }, 1000);

    // E2: rapid opens
    const tsNow = Date.now();
    openTsRef.current = openTsRef.current.filter(t => tsNow - t < 60000);
    openTsRef.current.push(tsNow);
    const cnt = openTsRef.current.length;
    setOpenCountWin(cnt);
    let e2 = 'OK';
    if (cnt >= 5 && !e2CoolRef.current) { e2 = 'CRITICAL'; e2CoolRef.current = true; setTimeout(() => { e2CoolRef.current = false; }, 15000); addAlert('e2_crit', 'critical', `🔁 ${cnt} opens in 60s`, 'Skimming pattern detected', {}); }
    else if (cnt >= 4) { e2 = 'SUSPICIOUS'; addAlert('e2_susp', 'high', `🔁 Rapid: ${cnt} opens`, '', {}); }
    else if (cnt >= 3) e2 = 'WARN';
    setE2St(e2);

    // E3: transaction link
    const gap = lastSaleTsRef.current ? (tsNow - lastSaleTsRef.current) / 1000 : 999;
    setLinkGap(gap);
    let e3 = 'OK', ls = 'LINKED';
    if (!lastSaleTsRef.current || gap > 30) { e3 = 'CRITICAL'; ls = 'UNAUTHORIZED'; if (!e3CoolRef.current) { e3CoolRef.current = true; setTimeout(() => { e3CoolRef.current = false; }, 10000); addAlert('e3_crit', 'critical', `🚨 No Transaction (${gap.toFixed(0)}s)`, 'Drawer opened without linked sale', {}); } }
    else if (gap > 10) { e3 = 'SUSPICIOUS'; ls = 'UNLINKED'; addAlert('e3_susp', 'high', `🧾 Late link: ${gap.toFixed(0)}s`, '', {}); }
    else if (gap > 5) { e3 = 'WARN'; ls = 'UNLINKED'; }
    setE3St(e3); setLinkStatus(ls);

    // Determine open duration
    const scenario = Math.random();
    const closeDur = scenario < 0.55 ? 4000 + Math.random() * 4000 : 16000 + Math.random() * 12000;
    setTimeout(() => {
      if (!isMountedRef.current) return;
      clearInterval(durIntervalRef.current); setDrawerSt('CLOSED'); setDrawerDur(0);
      e1CoolRef.current = false;
      setE1St('OK');

      // E4: cash mismatch (only for cash sales)
      if (hasSale && lastSaleAmtRef.current > 0 && Math.random() < 0.30) {
        const posAmt = lastSaleAmtRef.current;
        setTimeout(() => {
          if (!isMountedRef.current) return;
          const factor = Math.random() < 0.5 ? 0.5 + Math.random() * 0.2 : 0.95 + Math.random() * 0.1;
          const detected = Math.floor(posAmt * factor);
          const delta = posAmt - detected;
          setCashMismatch({ pos: posAmt, detected, delta, pct: Math.round(delta / posAmt * 100) });
          let e4 = 'OK';
          if (delta > 200 && !e4CoolRef.current) { e4 = 'CRITICAL'; e4CoolRef.current = true; setTimeout(() => { e4CoolRef.current = false; }, 5000); addAlert('e4_crit', 'critical', `💰 Cash Theft: ₹${delta} missing`, `POS: ₹${posAmt} | Vision: ₹${detected} (${Math.round(delta / posAmt * 100)}%)`, {}); }
          else if (delta > 50) { e4 = 'SUSPICIOUS'; addAlert('e4_susp', 'high', `💰 Mismatch ₹${delta}`, `POS: ₹${posAmt} vs Vision: ₹${detected}`, {}); }
          setE4St(e4);
          const overall = computeOverall(e1, e2, e3, e4);
          setOverallRisk(overall);
          // Check multi-engine
          const fired = [e1, e2, e3, e4].filter(s => s === 'SUSPICIOUS' || s === 'CRITICAL');
          if (fired.length >= 2) setMultiEngine(`E${e1 !== 'OK' ? '1' : ''} E${e2 !== 'OK' ? '2' : ''} E${e3 !== 'OK' ? '3' : ''} E${e4 !== 'OK' ? '4' : ''}`.replace(/  +/g, ' ').trim());
          else setMultiEngine(null);
        }, 800 + Math.random() * 700);
      } else {
        const overall = computeOverall(e1, e2, e3, 'OK');
        setOverallRisk(overall);
        setMultiEngine(null);
        setTimeout(() => { setE4St('OK'); setCashMismatch(null); }, 3000);
      }
    }, closeDur);
  }, [addAlert]);

  useEffect(() => {
    const schedule = () => {
      drawerIntervalRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        simulateDrawerOpen();
        schedule();
      }, 20000 + Math.random() * 25000);
    };
    schedule();
    return () => clearTimeout(drawerIntervalRef.current);
  }, [simulateDrawerOpen]);

  // ─── COMPUTED VALUES FOR NEW UI ─────────────────────────────────────────────
  const maxHandState = [handStates.left, handStates.right].includes('CONFIRMED') ? 'CONFIRMED'
    : [handStates.left, handStates.right].includes('INSERTED') ? 'INSERTED'
    : [handStates.left, handStates.right].includes('ENTERING') ? 'ENTERING'
    : [handStates.left, handStates.right].includes('PROXIMITY') ? 'PROXIMITY' : 'CLEAR';
  const handRiskMap = { CLEAR: 0, PROXIMITY: 15, ENTERING: 45, INSERTED: 75, CONFIRMED: 95 };
  const drawerRiskMap = { OK: 0, WARN: 25, SUSPICIOUS: 60, CRITICAL: 90 };
  const overallDrawerSt = [e1St, e2St, e3St, e4St].includes('CRITICAL') ? 'CRITICAL'
    : [e1St, e2St, e3St, e4St].includes('SUSPICIOUS') ? 'SUSPICIOUS'
    : [e1St, e2St, e3St, e4St].includes('WARN') ? 'WARN' : 'OK';
  const combinedRisk = Math.round((handRiskMap[maxHandState] || 0) * 0.6 + (drawerRiskMap[overallDrawerSt] || 0) * 0.4);
  const maxHandConf = Math.max(handConf.left, handConf.right);
  const getRiskColor = s => s >= 81 ? '#dc2626' : s >= 61 ? '#e07b39' : s >= 31 ? '#d29922' : '#3fb950';
  const riskCol = getRiskColor(combinedRisk);
  const CIRC = 2 * Math.PI * 48;
  const sevBorder = s => s === 'critical' ? '#dc2626' : s === 'high' ? '#ea580c' : s === 'medium' ? '#d29922' : '#2563eb';

  // Current action label
  const currentAction = maxHandState === 'CONFIRMED' ? 'CONFIRMED THEFT'
    : maxHandState === 'INSERTED' ? 'Hand-to-Pocket'
    : maxHandState === 'ENTERING' ? 'Suspicious Movement'
    : maxHandState === 'PROXIMITY' ? 'Hand Near Zone'
    : drawerSt === 'OPEN' && linkStatus === 'UNAUTHORIZED' ? 'Unauthorized Drawer Open'
    : multiEngine ? 'Multi-System Alert' : 'Normal Activity';
  const actionColor = maxHandState === 'CONFIRMED' ? '#dc2626'
    : maxHandState === 'INSERTED' ? '#e07b39'
    : maxHandState === 'ENTERING' ? '#d29922'
    : maxHandState === 'PROXIMITY' ? '#d29922'
    : drawerSt === 'OPEN' && linkStatus === 'UNAUTHORIZED' ? '#dc2626' : '#3fb950';

  // AI status chip
  const aiChip = combinedRisk >= 60 ? { t: 'ALERT', c: '#dc2626' } : combinedRisk >= 20 ? { t: 'TRACKING', c: '#388bfd' } : { t: 'IDLE', c: '#3fb950' };

  // System status
  const sysStatus = (alerts.length > 0 && alerts[0].sev === 'critical') || (drawerSt === 'OPEN' && linkStatus === 'UNAUTHORIZED') || maxHandState === 'INSERTED' || maxHandState === 'CONFIRMED'
    ? 'CRITICAL' : maxHandState === 'ENTERING' || overallDrawerSt === 'WARN' || overallDrawerSt === 'SUSPICIOUS' || alerts.length > 0
    ? 'WARNING' : 'SAFE';
  const sysCfg = sysStatus === 'CRITICAL' ? { c: '#dc2626', bg: 'rgba(220,38,38,0.15)', t: '● CRITICAL' }
    : sysStatus === 'WARNING' ? { c: '#d29922', bg: 'rgba(210,153,34,0.15)', t: '⚠ WARNING' }
    : { c: '#10b981', bg: 'rgba(16,185,129,0.15)', t: '● SAFE' };

  // Drawer display
  const drawerAuth = drawerSt === 'OPEN' && linkStatus === 'UNAUTHORIZED';
  const drawerAuthorized = drawerSt === 'OPEN' && !drawerAuth;

  // Last POS sale event
  const lastSale = posEvents.find(e => e.type !== 'Drawer' && e.type !== 'Void');
  const lastDrawerEv = posEvents.find(e => e.type === 'Drawer');

  return (
    <>
    <style>{`
      *{box-sizing:border-box;margin:0;padding:0}
      body{overflow:hidden}
      @keyframes statusPulse{0%,100%{opacity:1}50%{opacity:.55}}
      @keyframes livePulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.7}}
      @keyframes slideInLeft{from{transform:translateX(-20px);opacity:0}to{transform:translateX(0);opacity:1}}
      @keyframes drawerFlash{0%,100%{border-color:rgba(220,38,38,.4)}50%{border-color:rgba(220,38,38,.9)}}
      .alert-card{animation:slideInLeft .3s ease forwards}
      .critical-badge{animation:statusPulse 1.2s ease infinite}
      .live-dot{animation:livePulse 1.5s ease infinite}
      .drawer-unauth{animation:drawerFlash 1.5s ease infinite}
      ::-webkit-scrollbar{width:4px;height:4px}
      ::-webkit-scrollbar-track{background:#0d1117}
      ::-webkit-scrollbar-thumb{background:#1c2333;border-radius:2px}
      button{cursor:pointer;font-family:inherit;transition:all .15s ease}
      button:hover{opacity:.85}
    `}</style>

    {/* ═══ OUTER GRID ═══ */}
    <div style={{ height:'100vh', width:'100vw', overflow:'hidden', display:'grid',
      gridTemplateRows:'52px 1fr auto', gap:12, padding:12, boxSizing:'border-box',
      background:C.bg, fontFamily:"system-ui,-apple-system,'Segoe UI',sans-serif", color:C.text }}>

      {/* ═══ HEADER BAR ═══ */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        background:C.hdr, borderRadius:8, padding:'0 16px', border:`1px solid ${C.border}` }}>
        {/* Left group */}
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:20 }}>🛡</span>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'#fff', lineHeight:1.2 }}>SecureCounter AI</div>
              <div style={{ fontSize:11, color:C.sub }}>PetPooja Edition • Store #1247</div>
            </div>
          </div>
          <span className={sysStatus==='CRITICAL'?'critical-badge':''} style={{
            display:'inline-flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700,
            padding:'4px 10px', borderRadius:20, background:sysCfg.bg, color:sysCfg.c
          }}>{sysCfg.t}</span>
        </div>
        {/* Right group */}
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ fontFamily:mono, fontSize:14, color:'#fff' }}>{uptime}</span>
          <span style={{ fontSize:11, color: camStatus==='live' ? C.green : C.muted, display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background: camStatus==='live' ? C.green : C.muted }} />
            {camStatus==='live' ? 'Camera On' : 'Camera Off'}
          </span>
          <span style={{ fontSize:11, color:C.green, display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:C.green }} />POS Connected
          </span>
          <button onClick={() => { if(!soundReady) initAudio(); else setSoundOn(p=>!p); }} style={{
            background:'rgba(255,255,255,0.06)', border:`1px solid ${C.border}`, borderRadius:6,
            color: soundOn ? C.green : C.sub, fontSize:12, padding:'6px 12px'
          }}>{soundOn ? '🔔 Sound On' : '🔕 Enable Sound'}</button>
          <button onClick={toggleCam} style={{
            background: camOn ? '#dc2626' : C.blue, border:'none', borderRadius:6,
            color:'#fff', fontSize:12, fontWeight:700, padding:'6px 16px'
          }}>{camOn ? '⏹ Stop Camera' : '▶ Start Camera'}</button>
        </div>
      </div>

      {/* ═══ MAIN CONTENT — 2 COLUMN ═══ */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:12, minHeight:0 }}>

        {/* ── LEFT: CAMERA PANEL ── */}
        <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8,
          display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}>
          <div style={{ padding:'8px 14px', fontSize:12, color:C.sub, textTransform:'uppercase',
            letterSpacing:'0.06em', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            📺 Live Feed — Counter Camera 01
          </div>
          <div style={{ flex:1, position:'relative', overflow:'hidden', background:'#080b10', minHeight:0 }}>
            {/* Video + Canvas (always rendered, hidden when off) */}
            <video ref={videoRef} style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%',
              objectFit:'cover', transform:'scaleX(-1)', zIndex:1, display: camStatus==='live'?'block':'none' }} />
            <canvas ref={canvasRef} style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%',
              transform:'scaleX(-1)', zIndex:2, display: camStatus==='live'?'block':'none' }} />
            {/* Hidden mini canvas for wrist trail (kept for drawMiniCanvas) */}
            <canvas ref={miniCanvasRef} width={200} height={150} style={{ display:'none' }} />

            {camStatus === 'live' ? (<>
              {/* LIVE badge */}
              <div style={{ position:'absolute', top:10, left:10, zIndex:3, display:'flex', alignItems:'center', gap:6,
                background:'rgba(0,0,0,0.6)', padding:'4px 10px', borderRadius:4 }}>
                <span className="live-dot" style={{ width:8, height:8, borderRadius:'50%', background:'#dc2626' }} />
                <span style={{ fontSize:11, fontWeight:700, color:'#fff' }}>LIVE</span>
                <span style={{ fontSize:10, fontFamily:mono, color:C.sub }}>{fps} FPS</span>
              </div>
              {/* MediaPipe chip */}
              <div style={{ position:'absolute', top:10, right:10, zIndex:3, fontSize:10, padding:'3px 8px',
                borderRadius:4, background: mpState==='ready' ? 'rgba(63,185,80,0.15)' : mpState==='fallback' ? 'rgba(210,153,34,0.15)' : 'rgba(56,139,253,0.15)',
                color: mpState==='ready' ? C.green : mpState==='fallback' ? C.warn : C.blue }}>
                {mpState==='ready' ? '🤖 AI Active' : mpState==='fallback' ? '⚠ Demo Mode' : '⏳ Loading AI...'}
              </div>
              {/* Bottom HUD bar */}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, zIndex:3, height:48,
                background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 16px' }}>
                <span style={{ fontSize:14, fontWeight:700, color:actionColor }}>{currentAction}</span>
                <span style={{ fontSize:11, padding:'3px 8px', borderRadius:4,
                  background: combinedRisk>60?'rgba(220,38,38,0.2)':combinedRisk>30?'rgba(210,153,34,0.2)':'rgba(63,185,80,0.2)',
                  color:riskCol }}>{combinedRisk>60?'HIGH THREAT':combinedRisk>30?'ELEVATED':'LOW THREAT'}</span>
                <span style={{ fontFamily:mono, fontSize:13, color:'#fff' }}>{Math.round(maxHandConf*100)}%</span>
              </div>
            </>) : (
              /* OFFLINE placeholder */
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', gap:8 }}>
                <span style={{ fontSize:48, color:C.muted }}>📷</span>
                <span style={{ fontSize:16, color:C.sub }}>Camera Offline</span>
                <span style={{ fontSize:12, color:C.muted }}>Click 'Start Camera' to begin surveillance</span>
                {camErr && <span style={{ fontSize:11, color:C.danger, marginTop:4 }}>{camErr}</span>}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: 3 STACKED PANELS ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:12, minHeight:0 }}>

          {/* ═══ PANEL 1: AI ACTIVITY ═══ */}
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8, padding:16, flexShrink:0 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <span style={{ fontSize:12, color:C.sub, textTransform:'uppercase', letterSpacing:'0.06em' }}>🔴 AI Activity</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4,
                background:`${aiChip.c}22`, color:aiChip.c }}>{aiChip.t}</span>
            </div>
            <div style={{ display:'flex', gap:20, alignItems:'center' }}>
              {/* SVG Ring */}
              <div style={{ position:'relative', width:110, height:110, flexShrink:0 }}>
                <svg width="110" height="110" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#1c2333" strokeWidth="8" />
                  <circle cx="60" cy="60" r="48" fill="none" stroke={riskCol} strokeWidth="8"
                    strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC*(1-combinedRisk/100)}
                    transform="rotate(-90 60 60)" style={{ transition:'stroke-dashoffset .8s ease, stroke .5s ease' }} />
                </svg>
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                  alignItems:'center', justifyContent:'center' }}>
                  <span style={{ fontSize:26, fontWeight:'bold', color:riskCol, fontFamily:mono, lineHeight:1 }}>{combinedRisk}</span>
                  <span style={{ fontSize:9, color:C.sub, letterSpacing:'0.1em', marginTop:2 }}>RISK</span>
                </div>
              </div>
              {/* Action Details */}
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:10 }}>
                <div>
                  <div style={{ fontSize:10, color:C.sub, textTransform:'uppercase', marginBottom:4 }}>Current Action</div>
                  <div style={{ fontSize:18, fontWeight:700, color:actionColor, lineHeight:1.2 }}>{currentAction}</div>
                </div>
                <div>
                  <div style={{ fontSize:10, color:C.sub, marginBottom:4 }}>Confidence</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ flex:1, height:6, background:'#1c2333', borderRadius:3, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.round(maxHandConf*100)}%`,
                        background: maxHandConf>0.7 ? '#dc2626' : C.blue, borderRadius:3,
                        transition:'width .5s ease' }} />
                    </div>
                    <span style={{ fontFamily:mono, fontSize:12, color:C.text, minWidth:32 }}>{Math.round(maxHandConf*100)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ PANEL 2: POS SYNC ═══ */}
          <div style={{ background:C.panel, borderRadius:8, padding:16, flexShrink:0,
            border: corrStatus==='MISMATCH' ? '1px solid rgba(220,38,38,0.4)' : `1px solid ${C.border}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontSize:12, color:C.sub, textTransform:'uppercase', letterSpacing:'0.06em' }}>🗃 POS Sync — PetPooja</span>
              <span style={{ fontSize:11, color:C.green, display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:C.green }} />Connected
              </span>
            </div>
            {/* Drawer row */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
              <div>
                <span style={{ fontWeight:700, fontSize:13, color:C.text }}>🔓 Drawer </span>
                {lastDrawerEv ? (
                  <span style={{ fontSize:12, color: lastDrawerEv.desc==='UNAUTHORIZED' ? C.danger : lastDrawerEv.desc==='Auth Open' ? C.green : C.sub }}>
                    {lastDrawerEv.desc==='UNAUTHORIZED' ? 'No POS Command' : lastDrawerEv.desc==='Auth Open' ? 'Cash Sale' : lastDrawerEv.desc}
                  </span>
                ) : <span style={{ fontSize:12, color:C.muted }}>Idle</span>}
              </div>
              {lastDrawerEv && <span style={{ fontFamily:mono, fontSize:11, color:C.muted }}>{lastDrawerEv.time}</span>}
            </div>
            {/* Cash row */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${C.border}` }}>
              <div>
                {lastSale ? (<>
                  <span style={{ fontWeight:700, fontSize:13, color:C.text }}>{lastSale.icon} {lastSale.type} </span>
                  <span style={{ fontSize:12, color:C.sub }}>{lastSale.desc}</span>
                </>) : <span style={{ fontSize:12, color:C.muted }}>No recent sale</span>}
              </div>
              {lastSale && (
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.green }}>₹{lastSale.amt}</div>
                  <div style={{ fontFamily:mono, fontSize:11, color:C.muted }}>{lastSale.time}</div>
                </div>
              )}
            </div>
            {/* Correlation */}
            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:10 }}>
              <span style={{ fontSize:11, color:C.sub }}>Correlation</span>
              <span style={{ fontSize:11, fontWeight: corrStatus==='MISMATCH'?700:400,
                color: corrStatus==='SYNCED' ? C.green : corrStatus==='MISMATCH' ? C.danger : C.warn }}>
                {corrStatus==='SYNCED' ? '✅ Synced' : corrStatus==='MISMATCH' ? '🚨 Mismatch' : '⏳ Checking...'}
              </span>
            </div>
          </div>

          {/* ═══ PANEL 3: DRAWER STATE ═══ */}
          <div style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:8, padding:16, flexShrink:0 }}>
            <div style={{ fontSize:12, color:C.sub, textTransform:'uppercase', letterSpacing:'0.06em' }}>🔓 Drawer State</div>
            <div className={drawerAuth?'drawer-unauth':''} style={{
              borderRadius:8, padding:'16px 20px', display:'flex', alignItems:'center', gap:12, marginTop:10,
              background: drawerAuth ? 'rgba(220,38,38,0.10)' : drawerAuthorized ? 'rgba(245,158,11,0.08)' : 'rgba(31,41,55,0.6)',
              border: drawerAuth ? '1px solid rgba(220,38,38,0.4)' : drawerAuthorized ? '1px solid rgba(245,158,11,0.3)' : '1px solid #374151'
            }}>
              <span style={{ fontSize:24 }}>{drawerAuth ? '🔓' : drawerAuthorized ? '🔓' : '🔒'}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:700,
                  color: drawerAuth ? C.danger : drawerAuthorized ? C.warn : C.green }}>
                  {drawerSt === 'OPEN' ? 'OPEN' : 'CLOSED'}
                </div>
                <div style={{ fontSize:12, color: drawerAuth ? C.danger : C.sub,
                  fontStyle: drawerAuth ? 'italic' : 'normal' }}>
                  {drawerAuth ? '⚠ No POS command' : drawerAuthorized ? 'Cash Sale — Authorized' : 'Authorized'}
                </div>
              </div>
              {drawerSt === 'OPEN' && (
                <span style={{ fontFamily:mono, fontSize:16, fontWeight:700,
                  color: drawerAuth ? C.danger : C.warn }}>{Math.floor(drawerDur)}s</span>
              )}
            </div>
          </div>

        </div>{/* end right column */}
      </div>{/* end main grid */}

      {/* ═══ BOTTOM: RECENT ALERTS ═══ */}
      <div style={{ minHeight:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 4px 0' }}>
          <span style={{ fontSize:14, fontWeight:700, color:C.text }}>
            🚨 Recent Alerts {alerts.length > 0 && <span style={{ color:C.danger }}>({alerts.length})</span>}
          </span>
          {alerts.length > 0 && (
            <button onClick={() => setAlerts([])} style={{ background:'transparent', border:`1px solid ${C.border}`,
              borderRadius:5, color:C.sub, fontSize:11, padding:'4px 12px' }}>Clear All</button>
          )}
        </div>
        {alerts.length === 0 ? (
          <div style={{ textAlign:'center', padding:'24px 0', fontSize:13, color:C.muted }}>✓ No active alerts</div>
        ) : (
          <div style={{ display:'flex', gap:12, overflowX:'auto', paddingTop:12, paddingBottom:4 }}>
            {alerts.map(a => {
              const sc = sevBorder(a.sev);
              return (
                <div key={a.id} className="alert-card" style={{ minWidth:360, maxWidth:420, flexShrink:0,
                  background:C.panel, borderRadius:8, borderLeft:`3px solid ${sc}`, padding:'14px 16px' }}>
                  {/* Line 1: badge + title + time */}
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.08em', padding:'2px 6px',
                      borderRadius:3, background:`${sc}22`, color:sc, textTransform:'uppercase' }}>{a.sev}</span>
                    <span style={{ flex:1, fontSize:14, fontWeight:700, color:C.text }}>{a.title}</span>
                    <span style={{ fontFamily:mono, fontSize:11, color:C.muted, flexShrink:0 }}>{a.time}</span>
                  </div>
                  {/* Line 2: metrics */}
                  <div style={{ fontSize:11, color:C.sub, marginTop:6 }}>
                    Confidence: {Math.round(maxHandConf*100)}% &nbsp; Risk: {combinedRisk}% &nbsp; {a.zone||'Counter Zone A'}
                  </div>
                  {/* Line 3: description */}
                  <div style={{ fontSize:12, color:C.sub, marginTop:4, fontStyle:'italic' }}>{a.detail}</div>
                  {/* Line 4: actions */}
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:10 }}>
                    <button onClick={() => setAlerts(p => p.filter(x => x.id !== a.id))} style={{
                      background:'transparent', border:`1px solid ${C.border}`, borderRadius:5,
                      color:C.sub, fontSize:12, padding:'5px 14px' }}>Dismiss</button>
                    <button style={{ background:C.blue, border:'none', borderRadius:5,
                      color:'#fff', fontSize:12, fontWeight:700, padding:'5px 14px' }}>Review</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>{/* end outer grid */}
    </>
  );
}
