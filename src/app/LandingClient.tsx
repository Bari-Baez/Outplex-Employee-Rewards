'use client';

import { Suspense, useEffect, useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Zap, ChevronRight, ShieldCheck, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Lenis from 'lenis';
import { createClient } from '@/lib/supabase/client';

// ── UTILS ────────────────────────────────────────────────────────────

function getReadableAuthError(error: unknown) {
  if (error instanceof Error && /Failed to fetch/i.test(error.message))
    return 'No se pudo conectar con el servidor. Verifica tu conexión.';
  return error instanceof Error ? error.message : 'Unable to complete the login request.';
}

const URL_ERRORS: Record<string, string> = {
  unauthorized_domain: 'Acceso restringido. Solo @outplex.com autorizado.',
  auth_failed: 'La autenticación falló.',
  access_denied: 'Acceso denegado por Slack.',
};

// ── TYPES ────────────────────────────────────────────────────────────

type UserRole = 'admin' | 'moderator_a1' | 'moderator_b1' | 'employee';

type Star = {
  x: number;
  y: number;
  z: number;
  r: number;
  phase: number;
  hue: number;
};

type Nebula = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  angle: number;
  hue: number;
  alpha: number;
  pulseSpeed: number;
  phase: number;
  startThreshold: number;
};

type DemoPreset = {
  email: string;
  role: UserRole;
  label: string;
};

const DEMO_PRESETS: DemoPreset[] = [
  { email: 'it@outplex.test', role: 'admin', label: 'SR. ADMIN' },
  { email: 'a1@outplex.test', role: 'moderator_a1', label: 'L1 MOD' },
  { email: 'b1@outplex.test', role: 'moderator_b1', label: 'B1 MOD' },
  { email: 'employee@outplex.test', role: 'employee', label: 'AGENT' },
];

function SlackIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 122 122"
      role="img"
      aria-label="Slack"
      focusable="false"
    >
      <path
        d="M25.3 77.3c0 7-5.7 12.7-12.7 12.7S0 84.3 0 77.3s5.7-12.7 12.7-12.7h12.7v12.7z"
        fill="#E01E5A"
      />
      <path
        d="M31.7 77.3c0-7 5.7-12.7 12.7-12.7s12.7 5.7 12.7 12.7V109c0 7-5.7 12.7-12.7 12.7s-12.7-5.7-12.7-12.7V77.3z"
        fill="#E01E5A"
      />
      <path
        d="M44.3 25.3c-7 0-12.7-5.7-12.7-12.7S37.3 0 44.3 0s12.7 5.7 12.7 12.7v12.7H44.3z"
        fill="#36C5F0"
      />
      <path
        d="M44.3 31.7c7 0 12.7 5.7 12.7 12.7s-5.7 12.7-12.7 12.7H13c-7 0-12.7-5.7-12.7-12.7S6 31.7 13 31.7h31.3z"
        fill="#36C5F0"
      />
      <path
        d="M96.7 44.3c0-7 5.7-12.7 12.7-12.7s12.7 5.7 12.7 12.7-5.7 12.7-12.7 12.7H96.7V44.3z"
        fill="#2EB67D"
      />
      <path
        d="M90.3 44.3c0 7-5.7 12.7-12.7 12.7s-12.7-5.7-12.7-12.7V13c0-7 5.7-12.7 12.7-12.7S90.3 6 90.3 13v31.3z"
        fill="#2EB67D"
      />
      <path
        d="M77.7 96.7c7 0 12.7 5.7 12.7 12.7s-5.7 12.7-12.7 12.7S65 116.4 65 109.4V96.7h12.7z"
        fill="#ECB22E"
      />
      <path
        d="M77.7 90.3c-7 0-12.7-5.7-12.7-12.7s5.7-12.7 12.7-12.7H109c7 0 12.7 5.7 12.7 12.7s-5.7 12.7-12.7 12.7H77.7z"
        fill="#ECB22E"
      />
    </svg>
  );
}

// ── MAIN CLIENT COMPONENT ─────────────────────────────────────────────

export function LandingClient({
  variant = 'home',
  initialError = null,
}: {
  variant?: 'home' | 'login';
  initialError?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [activeDemoEmail, setActiveDemoEmail] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [showForm, setShowForm] = useState(variant === 'login');
  const [spaceLocked, setSpaceLocked] = useState(variant === 'login');
  const [logoVisible, setLogoVisible] = useState(variant === 'login');
  const [progress, setProgress] = useState(variant === 'login' ? 1 : 0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const rafRef = useRef<number | null>(null);
  
  const scrollRef = useRef({ progress: variant === 'login' ? 1 : 0, velocity: 0 });
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const timeRef = useRef(0);

  const starsRef = useRef<Star[]>([]);
  const nebulasRef = useRef<Nebula[]>([]);
  const dampedProgressRef = useRef(variant === 'login' ? 1 : 0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);

      const W = window.innerWidth;
      const H = window.innerHeight;

      const starCount = Math.floor((W * H) / 4500);
      starsRef.current = Array.from({ length: starCount }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        z: Math.random(), 
        r: 0.4 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.8 ? (Math.random() > 0.5 ? 210 : 45) : 0, 
      }));

      nebulasRef.current = Array.from({ length: 15 }, () => {
        const side = Math.random() > 0.5 ? 1 : -1;
        return {
          x: W / 2 + (side * (W * 0.2 + Math.random() * W * 0.4)),
          y: Math.random() * H,
          rx: 500 + Math.random() * 900,
          ry: 400 + Math.random() * 700,
          angle: Math.random() * Math.PI * 2,
          hue: Math.random() > 0.5 ? 240 + Math.random() * 40 : 180 + Math.random() * 40, 
          alpha: 0.02 + Math.random() * 0.04,
          pulseSpeed: 0.05 + Math.random() * 0.15,
          phase: Math.random() * Math.PI * 2,
          startThreshold: Math.random() * 0.35,
        };
      });
    };

    init();
    window.addEventListener('resize', init);

    lenisRef.current = new Lenis({
      duration: 1.6,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
    });

    lenisRef.current.on('scroll', (e: { progress: number; velocity: number }) => {
      const p = e.progress;
      scrollRef.current.progress = p;
      scrollRef.current.velocity = e.velocity;
      setProgress(p);

      if (p >= 0.99 && !spaceLocked) {
        setSpaceLocked(true);
        lenisRef.current?.stop();
        window.scrollTo(0, document.body.scrollHeight);
        setProgress(1);
        setLogoVisible(true);
      }
    });

    const animate = (now: number) => {
      const delta = now - timeRef.current;
      timeRef.current = now;
      const t = now * 0.001;

      lenisRef.current?.raf(now);

      const W = window.innerWidth;
      const H = window.innerHeight;
      const { progress: actualProgress, velocity } = scrollRef.current;
      
      const dampFactor = velocity > 5 ? 0.04 : 0.08; 
      dampedProgressRef.current += (actualProgress - dampedProgressRef.current) * dampFactor;
      const progress = dampedProgressRef.current;

      mouseRef.current.x += (mouseRef.current.tx - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.ty - mouseRef.current.y) * 0.05;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // ── NEBULAS ────────────────────────────────────────────────────
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      nebulasRef.current.forEach((neb) => {
        const localProg = Math.min(1, Math.max(0, (progress - neb.startThreshold) * 1.8));
        const localAlpha = localProg * localProg * (3 - 2 * localProg);

        if (localAlpha > 0) {
          const parallaxY = progress * H * 0.3;
          const px = neb.x + Math.sin(t * 0.05 + neb.phase) * 60;
          const py = (neb.y - parallaxY + H * 5) % H + Math.cos(t * 0.04 + neb.phase) * 40;
          
          const pulse = 0.9 + 0.1 * Math.sin(t * neb.pulseSpeed + neb.phase);
          const finalRx = neb.rx * (0.8 + localAlpha * 0.2) * pulse;
          const finalRy = neb.ry * (0.8 + localAlpha * 0.2) * pulse;

          const grad = ctx.createRadialGradient(px, py, 0, px, py, finalRx);
          const baseColor = `hsla(${neb.hue}, 70%, 30%, ${neb.alpha * localAlpha})`;
          const midColor = `hsla(${neb.hue}, 60%, 15%, ${neb.alpha * 0.3 * localAlpha})`;
          
          grad.addColorStop(0, baseColor);
          grad.addColorStop(0.6, midColor);
          grad.addColorStop(1, 'transparent');
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(px, py, finalRx, finalRy, neb.angle + t * 0.005, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();

      // ── EARTH ──────────────────────────────────────────────────────
      const earthFade = Math.max(0, 1 - progress / 0.85);
      const smoothEarthA = earthFade * earthFade * (3 - 2 * earthFade);

      if (smoothEarthA > 0.001) {
        const shrink = 1 - Math.pow(progress, 1.5) * 0.85;
        const eR = H * 0.75 * shrink;
        const eX = W * 0.5;
        const eY = H * 1.0 + Math.pow(progress, 1.2) * H * 1.5;

        ctx.save();
        ctx.globalAlpha = smoothEarthA;
        const atmG = ctx.createRadialGradient(eX, eY, eR * 0.8, eX, eY, eR * 1.3);
        atmG.addColorStop(0, 'transparent');
        atmG.addColorStop(0.4, 'rgba(99, 102, 241, 0.4)');
        atmG.addColorStop(0.7, 'rgba(99, 102, 241, 0.1)');
        atmG.addColorStop(1, 'transparent');
        ctx.fillStyle = atmG;
        ctx.beginPath(); ctx.arc(eX, eY, eR * 1.3, 0, Math.PI * 2); ctx.fill();

        const bodyG = ctx.createRadialGradient(eX - eR * 0.3, eY - eR * 0.3, 0, eX, eY, eR);
        bodyG.addColorStop(0, '#312e81');
        bodyG.addColorStop(1, '#020617');
        ctx.fillStyle = bodyG;
        ctx.beginPath(); ctx.arc(eX, eY, eR, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // ── STARS (Points ONLY) ────────────────────────────────────────
      const stAlphaBase = Math.min(1, 0.1 + progress * 2.0);
      const smoothStAlpha = stAlphaBase * stAlphaBase * (3 - 2 * stAlphaBase);

      starsRef.current.forEach((s) => {
        s.x = (s.x + delta * 0.005 * s.z + W) % W;
        s.y = (s.y + delta * 0.003 * s.z + H) % H;

        const dx = (mouseRef.current.x - W / 2) * s.z * 0.02;
        const dy = (mouseRef.current.y - H / 2) * s.z * 0.02;
        const scrollOffset = progress * H * (1 + s.z * 2.5);
        
        const sx = (s.x + dx + W) % W;
        const sy = (s.y - scrollOffset + dy + H * 10) % H;

        const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + s.phase);
        const alpha = smoothStAlpha * (0.1 + s.z * 0.9) * twinkle;
        const color = s.hue ? `hsla(${s.hue}, 90%, 85%, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;

        const velocityStretch = Math.min(15, Math.abs(velocity) * 0.1);
        const dynamicR = s.r * (1 + Math.min(1.5, Math.abs(velocity) * 0.02));
        
        ctx.fillStyle = color;
        
        if (velocityStretch > 1.5) {
          ctx.beginPath();
          ctx.lineWidth = dynamicR;
          ctx.lineCap = 'round';
          ctx.strokeStyle = color;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx, sy + velocityStretch * (velocity > 0 ? -1 : 1));
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, dynamicR, 0, Math.PI * 2);
          ctx.fill();
        }

        if (s.r > 1.3 && alpha > 0.6) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, dynamicR * 5);
          glow.addColorStop(0, color.replace(/[^,]+(?=\))/, '0.2'));
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sx, sy, dynamicR * 5, 0, Math.PI * 2); ctx.fill();
        }
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    if (variant === 'login') {
      window.scrollTo(0, document.body.scrollHeight);
    }
    
    return () => {
      window.removeEventListener('resize', init);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenisRef.current?.destroy();
    };
  }, [spaceLocked, variant]);

  const bootstrapDemoUsers = async () => {
    try {
      await fetch('/api/dev/bootstrap', { method: 'POST' });
    } catch {
      // best-effort
    }
  };

  const handleSlackLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'slack_oidc',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'openid profile email',
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(getReadableAuthError(err));
      setLoading(false);
    }
  };

  const handlePresetLogin = async (preset: DemoPreset) => {
    setActiveDemoEmail(preset.email);
    setDemoLoading(true);
    setError(null);
    try {
      await bootstrapDemoUsers();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: preset.email,
        password: 'password123',
      });

      if (signInError) throw signInError;

      void fetch('/api/dev/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: preset.email, role: preset.role }),
      });

      window.location.href = '/dashboard';
    } catch (err) {
      setError(getReadableAuthError(err));
      setDemoLoading(false);
    }
  };

  return (
    <main 
      className="relative min-h-screen selection:bg-indigo-500/30 overflow-hidden"
      onMouseMove={(e) => {
        mouseRef.current.tx = e.clientX;
        mouseRef.current.ty = e.clientY;
      }}
    >
      <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />
      
      <div className="relative z-10">
        <div style={{ height: '650vh' }} className="pointer-events-none" />

        {/* Scroll Progress Indicator / Launch Sequence */}
        <div 
          className="fixed inset-0 pointer-events-none flex items-center justify-center z-20"
          style={{ opacity: Math.max(0, 1 - progress * 2.5) }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-[1px] h-32 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent" />
            <span className="text-[10px] font-black tracking-[0.6em] text-cyan-400/70 uppercase text-center">
              INITIATING LAUNCH SEQUENCE
              <br />
              <span className="text-[8px] tracking-[0.2em] font-normal opacity-60">SCROLL DOWN TO ENGAGE</span>
            </span>
            <motion.div 
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"
            />
            <ChevronDown size={20} className="text-cyan-400/50 animate-bounce" />
          </motion.div>
        </div>

        {/* LOGO REVEAL (Interactive Card) */}
        <div 
          className={`fixed inset-0 flex items-center justify-center z-30 px-6 ${spaceLocked ? '' : 'pointer-events-none'}`}
          style={{ 
            opacity: Math.min(1, Math.max(0, (progress - 0.8) * 5)),
            transform: `scale(${0.7 + Math.min(0.3, (progress - 0.8) * 1.5)}) translateY(${30 * (1 - progress)}px)`,
            filter: `blur(${Math.max(0, (1 - progress) * 15)}px)`
          }}
        >
          <AnimatePresence mode="wait">
            {!showForm ? (
              <motion.div
                key="logo-card"
                exit={{ scale: 1.5, opacity: 0, filter: 'blur(30px)' }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => spaceLocked && setShowForm(true)}
                className="group relative cursor-pointer"
              >
                <div className="absolute inset-[-40px] border border-cyan-400/20 rounded-[40px] rotate-[15deg] animate-[spin_20s_linear_infinite] group-hover:border-cyan-400/40 transition-colors" />
                <div className="absolute inset-[-60px] border border-indigo-400/10 rounded-[50px] rotate-[-12deg] animate-[spin_35s_linear_infinite] group-hover:border-indigo-400/30 transition-colors" />
                
                <div className="relative w-36 h-36 bg-slate-950/80 backdrop-blur-2xl border border-indigo-500/30 rounded-3xl p-6 shadow-[0_0_50px_-10px_rgba(99,102,241,0.4)] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-cyan-500/10" />
                  <Image src="/outplex-logo.webp" alt="Outplex" width={100} height={100} priority className="relative z-10 w-full h-auto" />
                  <div className="absolute inset-0 bg-indigo-500/20 mix-blend-screen animate-pulse" />
                </div>

                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black tracking-[0.4em] text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.4)]">
                  IDENTIFY TO ENGAGE
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="login-form"
                initial={{ scale: 0.9, opacity: 0, y: 30, filter: 'blur(10px)' }}
                animate={{ scale: 1, opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ 
                  duration: 0.8, 
                  ease: [0.16, 1, 0.3, 1],
                  opacity: { duration: 0.4 }
                }}
                className="w-full max-w-[440px]"
              >
                <div className="relative group" onClick={(e) => e.stopPropagation()}>
                  <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-[32px] blur opacity-25" />
                  <div className="relative bg-slate-950/70 backdrop-blur-3xl border border-indigo-500/20 rounded-[28px] p-8 md:p-12 shadow-2xl">
                    
                    <button
                      type="button"
                      className="absolute top-4 right-4 p-2 text-white/30 hover:text-white transition-colors"
                      onClick={() => setShowForm(false)}
                    >
                      <X size={20} />
                    </button>

                    <header className="flex items-center justify-between mb-10">
                      <div className="flex gap-1.5">
                        {[0, 1, 2].map((i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-cyan-400' : 'bg-slate-800'}`} />
                        ))}
                      </div>
                      <div className="text-indigo-300/60 tracking-[0.3em] font-black text-[9px] uppercase">Secure Node Access</div>
                    </header>

                    <div className="space-y-8">
                      <div className="text-center">
                        <h1 className="text-2xl font-black text-white tracking-tight mb-2">Welcome Back</h1>
                        <p className="text-indigo-300/50 text-xs font-medium uppercase tracking-widest">Identify yourself to engage</p>
                      </div>

                      <button
                        onClick={handleSlackLogin}
                        disabled={loading || demoLoading}
                        className="w-full relative group overflow-hidden py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 transition-colors"
                      >
                        <div className="relative z-10 flex items-center justify-center gap-3 text-xs font-black text-white tracking-widest uppercase">
                          <SlackIcon size={18} />
                          {loading ? 'Validating...' : 'Authorize via Slack'}
                        </div>
                      </button>

                      <div className="relative flex items-center justify-center">
                        <div className="w-full h-px bg-white/5" />
                        <div className="absolute px-4 bg-transparent text-[9px] font-black tracking-[0.4em] text-white/20 uppercase">Fallback</div>
                      </div>

                      <button
                        onClick={() => setShowDemo(v => !v)}
                        disabled={loading || demoLoading}
                        className="w-full py-3.5 rounded-xl border border-white/5 hover:bg-white/5 transition-all text-[10px] font-black tracking-widest text-indigo-300/60 uppercase"
                      >
                        {showDemo ? 'Close Demo Menu' : 'Maintenance Access'}
                      </button>

                      {showDemo && (
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          {DEMO_PRESETS.map((preset) => (
                            <button
                              key={preset.role}
                              type="button"
                              className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/10 text-[9px] font-bold text-indigo-200 transition-all uppercase tracking-tighter"
                              onClick={() => handlePresetLogin(preset)}
                              disabled={demoLoading}
                            >
                              {demoLoading && activeDemoEmail === preset.email ? '...' : preset.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {error && (
                      <div className="mt-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-[10px] text-center uppercase tracking-widest">
                        {error}
                      </div>
                    )}

                    <footer className="mt-12 flex items-center justify-between text-[8px] font-black text-white/20 tracking-[0.3em] uppercase">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={10} className="text-indigo-500/40" />
                        Enclave Active
                      </div>
                      <span>Core v2.8.5-CX</span>
                    </footer>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
        body { 
          background: #000; 
          font-family: 'Space Grotesk', sans-serif;
          margin: 0;
          padding: 0;
        }
        .lenis-smooth { height: auto; }
      `}</style>
    </main>
  );
}
