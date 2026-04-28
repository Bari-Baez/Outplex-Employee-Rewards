'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Zap, ChevronRight, Lock, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Lenis from 'lenis';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/database';

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
};

// ── MAIN COMPONENT ───────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LoginPageClient />
    </Suspense>
  );
}

function LoginPageClient() {
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [activeDemoEmail, setActiveDemoEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [spaceLocked, setSpaceLocked] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);

  const searchParams = useSearchParams();
  const supabase = createClient();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const rafRef = useRef<number | null>(null);
  
  const scrollRef = useRef({ progress: 0, velocity: 0 });
  const mouseRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const timeRef = useRef(0);

  const starsRef = useRef<Star[]>([]);
  const nebulasRef = useRef<Nebula[]>([]);

  useEffect(() => {
    window.scrollTo(0, 0);
    const urlError = searchParams.get('error');
    if (urlError) {
      setError(URL_ERRORS[urlError] ?? 'Error de autenticación.');
      scrollRef.current.progress = 1;
      setSpaceLocked(true);
      setTimeout(() => {
        setLogoVisible(true);
        setShowForm(true);
      }, 500);
    }
  }, [searchParams]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const init = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
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

      nebulasRef.current = Array.from({ length: 12 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        rx: 300 + Math.random() * 600,
        ry: 200 + Math.random() * 400,
        angle: Math.random() * Math.PI * 2,
        hue: Math.random() > 0.5 ? 250 : 190, 
        alpha: 0.04 + Math.random() * 0.07,
        pulseSpeed: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      }));
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

      if (p >= 0.99 && !spaceLocked) {
        setSpaceLocked(true);
        lenisRef.current?.stop();
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(() => setLogoVisible(true), 600);
      }
    });

    const animate = (now: number) => {
      const delta = now - timeRef.current;
      timeRef.current = now;
      const t = now * 0.001;

      lenisRef.current?.raf(now);

      const W = window.innerWidth;
      const H = window.innerHeight;
      const { progress, velocity } = scrollRef.current;
      
      mouseRef.current.x += (mouseRef.current.tx - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (mouseRef.current.ty - mouseRef.current.y) * 0.05;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      // ── NEBULAS ────────────────────────────────────────────────────
      const nebAlpha = Math.min(1, Math.max(0, (progress * 1.5 - 0.2)));
      if (nebAlpha > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        nebulasRef.current.forEach((neb) => {
          const px = neb.x + Math.sin(t * 0.1 + neb.phase) * 40;
          const py = neb.y + Math.cos(t * 0.08 + neb.phase) * 30;
          const pulse = 0.8 + 0.2 * Math.sin(t * neb.pulseSpeed + neb.phase);
          const grad = ctx.createRadialGradient(px, py, 0, px, py, neb.rx * pulse);
          grad.addColorStop(0, `hsla(${neb.hue}, 80%, 40%, ${neb.alpha * nebAlpha})`);
          grad.addColorStop(0.5, `hsla(${neb.hue}, 70%, 25%, ${neb.alpha * 0.4 * nebAlpha})`);
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(px, py, neb.rx * pulse, neb.ry * pulse, neb.angle + t * 0.01, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }

      // ── EARTH ──────────────────────────────────────────────────────
      const earthA = Math.max(0, 1 - progress / 0.8);
      if (earthA > 0.001) {
        const shrink = 1 - progress * 0.8;
        const eR = H * 0.75 * shrink;
        const eX = W * 0.5;
        const eY = H * 1.0 + progress * H * 1.25;

        ctx.save();
        ctx.globalAlpha = earthA;
        const atmG = ctx.createRadialGradient(eX, eY, eR * 0.8, eX, eY, eR * 1.2);
        atmG.addColorStop(0, 'transparent');
        atmG.addColorStop(0.5, 'rgba(99, 102, 241, 0.4)');
        atmG.addColorStop(1, 'transparent');
        ctx.fillStyle = atmG;
        ctx.beginPath(); ctx.arc(eX, eY, eR * 1.2, 0, Math.PI * 2); ctx.fill();

        const bodyG = ctx.createRadialGradient(eX - eR * 0.3, eY - eR * 0.3, 0, eX, eY, eR);
        bodyG.addColorStop(0, '#312e81');
        bodyG.addColorStop(1, '#020617');
        ctx.fillStyle = bodyG;
        ctx.beginPath(); ctx.arc(eX, eY, eR, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // ── STARS (Points ONLY) ────────────────────────────────────────
      const stVis = Math.min(1, 0.2 + progress * 2.5);
      // We simulate speed by moving stars faster, but keeping them as points.
      const speedMult = 1 + Math.abs(velocity) * 0.15;

      starsRef.current.forEach((s) => {
        const dx = (mouseRef.current.x - W / 2) * s.z * 0.02;
        const dy = (mouseRef.current.y - H / 2) * s.z * 0.02;
        
        // Stars wrap around the screen. 
        // When not locked, they "fall" based on scroll progress.
        const scrollOffset = progress * H * (1 + s.z * 2);
        
        const sx = (s.x + dx + W) % W;
        const sy = (s.y - scrollOffset + dy + H * 10) % H;

        const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + s.phase);
        const alpha = stVis * (0.2 + s.z * 0.8) * twinkle;
        const color = s.hue ? `hsla(${s.hue}, 90%, 85%, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;

        // Draw star as a point/disc, no lines.
        // We might slightly increase the radius when flying fast to simulate bloom, but no streaks.
        const dynamicR = s.r * (1 + Math.min(2, Math.abs(velocity) * 0.05));
        
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, dynamicR, 0, Math.PI * 2);
        ctx.fill();

        if (s.r > 1.3 && alpha > 0.6) {
          const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, dynamicR * 5);
          glow.addColorStop(0, color.replace(/[^,]+(?=\))/, '0.2'));
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sx, sy, dynamicR * 5, 0, Math.PI * 2); ctx.fill();
        }
      });

      if (spaceLocked) {
        starsRef.current.forEach(s => {
          s.x = (s.x + delta * 0.005 * s.z + W) % W;
          s.y = (s.y + delta * 0.003 * s.z + H) % H;
        });
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', init);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lenisRef.current?.destroy();
    };
  }, [spaceLocked]);

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

  const handlePresetLogin = async (preset: { email: string; role: UserRole; label: string }) => {
    setActiveDemoEmail(preset.email);
    setDemoLoading(true);
    setError(null);
    try {
      await fetch('/api/dev/bootstrap', { method: 'POST' });
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

        <AnimatePresence>
          {!spaceLocked && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-4 z-20"
            >
              <div className="w-[1px] h-32 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent" />
              <span className="text-[10px] font-black tracking-[0.6em] text-cyan-400/70 uppercase">
                INITIATING LAUNCH SEQUENCE
              </span>
              <motion.div 
                animate={{ y: [0, 8, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {spaceLocked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 flex items-center justify-center z-30 px-6"
            >
              {!showForm ? (
                <motion.div
                  initial={{ scale: 0.2, opacity: 0, rotate: -20 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 150, damping: 20, delay: 0.2 }}
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setShowForm(true)}
                  className="group relative cursor-pointer"
                >
                  <div className="absolute inset-[-40px] border border-cyan-400/20 rounded-[40px] rotate-[15deg] animate-[spin_20s_linear_infinite] group-hover:border-cyan-400/40 transition-colors" />
                  <div className="absolute inset-[-60px] border border-indigo-400/10 rounded-[50px] rotate-[-12deg] animate-[spin_35s_linear_infinite] group-hover:border-indigo-400/30 transition-colors" />
                  
                  <div className="relative w-36 h-36 bg-slate-950/80 backdrop-blur-2xl border border-indigo-500/30 rounded-3xl p-6 shadow-[0_0_50px_-10px_rgba(99,102,241,0.4)] overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 via-transparent to-cyan-500/10" />
                    <Image src="/outplex-logo.webp" alt="Outplex" width={100} height={100} priority className="relative z-10 w-full h-auto" />
                    <div className="absolute inset-0 bg-indigo-500/20 mix-blend-screen animate-pulse" />
                  </div>

                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1 }}
                    className="absolute -bottom-16 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black tracking-[0.4em] text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.4)]"
                  >
                    IDENTIFY TO ENGAGE
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="w-full max-w-[440px]"
                >
                  <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-[32px] blur opacity-25" />
                    <div className="relative bg-slate-950/70 backdrop-blur-3xl border border-indigo-500/20 rounded-[28px] p-8 md:p-12 shadow-2xl">
                      
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
                            <Image src="/slack-white.svg" alt="" width={18} height={18} />
                            {loading ? 'Validating...' : 'Authorize via Slack'}
                          </div>
                        </button>

                        <div className="relative flex items-center justify-center">
                          <div className="w-full h-px bg-white/5" />
                          <div className="absolute px-4 bg-transparent text-[9px] font-black tracking-[0.4em] text-white/20 uppercase">Fallback</div>
                        </div>

                        <button
                          onClick={() => setShowDemo(true)}
                          disabled={loading || demoLoading}
                          className="w-full py-3.5 rounded-xl border border-white/5 hover:bg-white/5 transition-all text-[10px] font-black tracking-widest text-indigo-300/60 uppercase"
                        >
                          Maintenance Access
                        </button>
                      </div>

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
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showDemo && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center px-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowDemo(false)}
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 30 }}
                className="relative w-full max-w-sm bg-slate-900 border border-white/10 rounded-[32px] p-10 shadow-2xl"
              >
                <div className="grid grid-cols-1 gap-4">
                  {[
                    { email: 'it@outplex.test', role: 'admin' as const, label: 'SR. ADMIN' },
                    { email: 'a1@outplex.test', role: 'moderator_a1' as const, label: 'L1 MODERATOR' },
                    { email: 'b1@outplex.test', role: 'moderator_b1' as const, label: 'B1 MODERATOR' },
                    { email: 'employee@outplex.test', role: 'employee' as const, label: 'STAFF AGENT' },
                  ].map((p, i) => (
                    <button
                      key={p.role}
                      onClick={() => handlePresetLogin(p)}
                      disabled={demoLoading}
                      className="w-full flex items-center justify-between px-6 py-5 rounded-2xl bg-white/5 border border-white/5 hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all group"
                    >
                      <span className="text-[10px] font-black tracking-widest text-white/40 group-hover:text-white">{p.label}</span>
                      <ChevronRight size={14} className="text-white/20 group-hover:text-white" />
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap');
        body { background: #000; overflow: hidden; font-family: 'Space Grotesk', sans-serif; }
        .lenis-smooth { height: auto; }
      `}</style>
    </main>
  );
}
