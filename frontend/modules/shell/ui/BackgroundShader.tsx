'use client';

import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

export function BackgroundShader() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const requestRef = useRef<number | undefined>(undefined);
  const runningRef = useRef(false);
  const resizeHandlerRef = useRef<(() => void) | null>(null);

  const stop = () => {
    if (resizeHandlerRef.current) {
      window.removeEventListener('resize', resizeHandlerRef.current);
      resizeHandlerRef.current = null;
    }

    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = undefined;
    }

    if (rendererRef.current) {
      rendererRef.current.dispose();
      if (containerRef.current?.contains(rendererRef.current.domElement)) {
        containerRef.current.removeChild(rendererRef.current.domElement);
      }
      rendererRef.current = null;
    }

    materialRef.current?.dispose();
    materialRef.current = null;
    runningRef.current = false;
  };

  const start = () => {
    if (!containerRef.current) return;
    if (runningRef.current) return;

    // --- SETUP ---
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- SHADER ---
    const uniforms = {
      u_time: { value: 0 },
      u_res: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      u_theme: { value: 0.0 }, // kept for future-proofing
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float u_time;
        uniform vec2 u_res;
        uniform float u_theme;
        varying vec2 vUv;

        float random (in vec2 _st) {
            return fract(sin(dot(_st.xy, vec2(12.9898,78.233)))*43758.5453123);
        }

        float noise (in vec2 _st) {
            vec2 i = floor(_st);
            vec2 f = fract(_st);
            float a = random(i);
            float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0));
            float d = random(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        float fbm ( in vec2 _st) {
            float v = 0.0;
            float a = 0.5;
            vec2 shift = vec2(100.0);
            mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
            for (int i = 0; i < 5; ++i) {
                v += a * noise(_st);
                _st = rot * _st * 2.0 + shift;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 st = gl_FragCoord.xy/u_res.xy;
            st.x *= u_res.x/u_res.y;
            
            vec3 color = vec3(0.0);
            
            vec2 q = vec2(0.);
            q.x = fbm( st + 0.00*u_time);
            q.y = fbm( st + vec2(1.0));

            vec2 r = vec2(0.);
            r.x = fbm( st + 1.0*q + vec2(1.7,9.2)+ 0.15*u_time );
            r.y = fbm( st + 1.0*q + vec2(8.3,2.8)+ 0.126*u_time);

            float f = fbm(st+r);

            // Palette adapted for Outplex (Deep night, indigo, vibrant violet)
            vec3 dark1 = vec3(0.02, 0.02, 0.05); // Deep background
            vec3 dark2 = vec3(0.05, 0.03, 0.1);  // Slightly lighter
            vec3 darkAccent = vec3(0.42, 0.36, 0.98); // Indigo glow

            vec3 color_mix = mix(dark1, dark2, length(q));
            color = mix(color_mix, darkAccent, length(r) * 0.35);

            gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    materialRef.current = material;

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    // --- RENDER LOOP ---
    const animate = (t: number) => {
      if (!rendererRef.current || !materialRef.current) return;
      materialRef.current.uniforms.u_time.value = t * 0.001;
      rendererRef.current.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);

    // --- RESIZE ---
    const handleResize = () => {
      if (!rendererRef.current || !materialRef.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      rendererRef.current.setSize(w, h);
      materialRef.current.uniforms.u_res.value.set(w, h);
    };
    resizeHandlerRef.current = handleResize;
    window.addEventListener('resize', handleResize);

    runningRef.current = true;
  };

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dashboard-dark');
    if (!isDark) start();

    const onTheme = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: string }>).detail;
      const nextIsDark = detail?.theme === 'dark';
      if (nextIsDark) {
        stop();
      } else {
        start();
      }
    };

    window.addEventListener('outplex-theme', onTheme as EventListener);

    return () => {
      window.removeEventListener('outplex-theme', onTheme as EventListener);
      stop();
    };
     
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden" 
      id="canvas-bg"
      style={{ background: 'var(--bg-base)' }}
    />
  );
}
