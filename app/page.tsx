"use client";

import { useEffect, useRef, useState } from "react";

const TOTAL_FRAMES = 300;

export default function Home() {
  const navItems = ["EXPLORE", "FEATURES", "STORIES", "RESOURCES"];

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const imagesRef = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAMES).fill(null));
  const isLoadedRef = useRef<boolean[]>(new Array(TOTAL_FRAMES).fill(false));

  const currentFrameRef = useRef<number>(0);
  const targetFrameRef = useRef<number>(0);
  const lastRenderedIndexRef = useRef<number>(-1);
  const animFrameIdRef = useRef<number | null>(null);

  // Helper to format frame path: frame_0001.webp -> frame_0300.webp
  const getFrameSrc = (index: number) => {
    const frameNum = String(index + 1).padStart(4, "0");
    return `/frames/frame_${frameNum}.webp`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. High-DPI Canvas Sizing & Responsive Adjustment
    const updateCanvasSize = () => {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = window.innerWidth;
      const height = window.innerHeight;

      const physicalWidth = Math.round(width * dpr);
      const physicalHeight = Math.round(height * dpr);

      if (canvas.width !== physicalWidth || canvas.height !== physicalHeight) {
        canvas.width = physicalWidth;
        canvas.height = physicalHeight;
        renderFrame(Math.round(currentFrameRef.current));
      }
    };

    // 2. Render Frame with Cover Aspect Ratio
    const renderFrame = (frameIndex: number) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      // Find target or nearest loaded frame
      let imgToDraw: HTMLImageElement | null = null;
      if (imagesRef.current[frameIndex]?.complete && imagesRef.current[frameIndex]?.naturalWidth > 0) {
        imgToDraw = imagesRef.current[frameIndex];
      } else {
        const maxDist = Math.max(frameIndex, TOTAL_FRAMES - 1 - frameIndex);
        for (let d = 1; d <= maxDist; d++) {
          const prev = frameIndex - d;
          if (prev >= 0 && imagesRef.current[prev]?.complete && imagesRef.current[prev]?.naturalWidth > 0) {
            imgToDraw = imagesRef.current[prev];
            break;
          }
          const next = frameIndex + d;
          if (next < TOTAL_FRAMES && imagesRef.current[next]?.complete && imagesRef.current[next]?.naturalWidth > 0) {
            imgToDraw = imagesRef.current[next];
            break;
          }
        }
      }

      if (!imgToDraw) return;

      const cWidth = canvas.width;
      const cHeight = canvas.height;
      if (cWidth === 0 || cHeight === 0) return;

      const iWidth = imgToDraw.naturalWidth || 1280;
      const iHeight = imgToDraw.naturalHeight || 720;

      // Cover calculation
      const ratio = Math.max(cWidth / iWidth, cHeight / iHeight);
      const drawWidth = iWidth * ratio;
      const drawHeight = iHeight * ratio;
      const drawX = (cWidth - drawWidth) / 2;
      const drawY = (cHeight - drawHeight) / 2;

      ctx.drawImage(imgToDraw, drawX, drawY, drawWidth, drawHeight);
      lastRenderedIndexRef.current = frameIndex;
    };

    updateCanvasSize();

    // 3. Progressive Frame Preloader
    let activeQueue: number[] = [];
    let isQueueRunning = false;
    const MAX_CONCURRENT = 8;
    let currentlyLoading = 0;

    const loadSingleFrame = (index: number): Promise<void> => {
      return new Promise((resolve) => {
        if (imagesRef.current[index]) {
          resolve();
          return;
        }

        const img = new Image();
        img.src = getFrameSrc(index);
        imagesRef.current[index] = img;

        img.onload = () => {
          isLoadedRef.current[index] = true;
          // If this frame is the current frame or closest to current target, redraw
          const activeTarget = Math.round(currentFrameRef.current);
          if (Math.abs(activeTarget - index) <= 1) {
            renderFrame(activeTarget);
          }
          resolve();
        };

        img.onerror = () => {
          resolve();
        };
      });
    };

    const processQueue = () => {
      if (isQueueRunning) return;
      isQueueRunning = true;

      const pump = () => {
        while (currentlyLoading < MAX_CONCURRENT && activeQueue.length > 0) {
          const nextIdx = activeQueue.shift()!;
          currentlyLoading++;
          loadSingleFrame(nextIdx).then(() => {
            currentlyLoading--;
            pump();
          });
        }
        if (currentlyLoading === 0 && activeQueue.length === 0) {
          isQueueRunning = false;
        }
      };

      pump();
    };

    // Priority 1: Frame 0 (instant first paint)
    loadSingleFrame(0).then(() => {
      renderFrame(0);
    });

    // Priority 2: Keyframe stride (every 10th frame) for fast scrubbing
    const keyframes: number[] = [];
    for (let i = 10; i < TOTAL_FRAMES; i += 10) {
      keyframes.push(i);
    }
    if (!keyframes.includes(TOTAL_FRAMES - 1)) {
      keyframes.push(TOTAL_FRAMES - 1);
    }

    // Priority 3: Remaining frames
    const remainingFrames: number[] = [];
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      if (!keyframes.includes(i)) {
        remainingFrames.push(i);
      }
    }

    activeQueue = [...keyframes, ...remainingFrames];
    processQueue();

    // 4. Scroll Tracking
    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scrollableHeight = rect.height - window.innerHeight;
      if (scrollableHeight <= 0) return;

      // Calculate progress between 0 and 1
      const progress = Math.min(Math.max(-rect.top / scrollableHeight, 0), 1);
      targetFrameRef.current = progress * (TOTAL_FRAMES - 1);

      // Dynamically prioritize loading frames around current scroll target if not loaded
      const targetIdx = Math.round(targetFrameRef.current);
      const urgentNeighbors: number[] = [];
      for (let offset = -4; offset <= 8; offset++) {
        const idx = targetIdx + offset;
        if (idx >= 0 && idx < TOTAL_FRAMES && !isLoadedRef.current[idx]) {
          urgentNeighbors.push(idx);
        }
      }

      if (urgentNeighbors.length > 0) {
        // Unshift urgent frames to the front of queue
        activeQueue = [
          ...urgentNeighbors,
          ...activeQueue.filter((idx) => !urgentNeighbors.includes(idx)),
        ];
        processQueue();
      }
    };

    // 5. Reduced Motion Check
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = mediaQuery.matches;

    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
    };
    mediaQuery.addEventListener("change", handleMotionChange);

    // 6. Smooth Lerp Animation Loop
    const tick = () => {
      const target = targetFrameRef.current;

      if (prefersReducedMotion) {
        currentFrameRef.current = target;
      } else {
        const diff = target - currentFrameRef.current;
        if (Math.abs(diff) < 0.002) {
          currentFrameRef.current = target;
        } else {
          // Apple-style linear interpolation (lerp)
          currentFrameRef.current += diff * 0.1;
        }
      }

      const frameToDraw = Math.round(currentFrameRef.current);
      if (frameToDraw !== lastRenderedIndexRef.current) {
        renderFrame(frameToDraw);
      }

      animFrameIdRef.current = requestAnimationFrame(tick);
    };

    // Initialize initial scroll position & run loop
    handleScroll();
    animFrameIdRef.current = requestAnimationFrame(tick);

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateCanvasSize);

    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateCanvasSize);
      mediaQuery.removeEventListener("change", handleMotionChange);
    };
  }, []);

  return (
    <main ref={containerRef} className="relative w-full h-[400vh] bg-[#0a0612]">
      {/* Sticky Fullscreen Pinned Viewport */}
      <div className="sticky top-0 h-screen w-full flex flex-col justify-between items-center text-white overflow-hidden select-none">
        {/* Cinematic Scroll-Linked HTML5 Canvas Background */}
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
        />

        {/* Cinematic atmospheric overlays for violet/purple tone depth and contrast */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#090514]/70 via-transparent to-[#07030d]/85 pointer-events-none z-[1]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,_rgba(139,92,246,0.18),transparent_65%)] pointer-events-none z-[1]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_45%,_rgba(6,3,10,0.65)_100%)] pointer-events-none z-[1]" />

        {/* 1. Header */}
        <header className="w-full max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 pt-8 pb-4 flex items-center justify-between z-20">
          {/* Brand Name */}
          <div className="flex-1 flex items-center">
            <a
              href="#"
              className="text-lg sm:text-xl font-medium tracking-tight text-white/95 hover:text-white transition-opacity"
            >
              Violet Evergarden<span className="text-xs font-normal align-top ml-0.5 opacity-80">™</span>
            </a>
          </div>

          {/* Center Menu Links Pill */}
          <nav
            aria-label="Main Navigation"
            className="hidden md:flex items-center gap-7 lg:gap-8 px-6 py-2 rounded-full border border-white/15 bg-white/[0.05] backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.25)]"
          >
            {navItems.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className="text-[11px] font-medium tracking-[0.2em] text-white/70 hover:text-white transition-colors duration-200"
              >
                {item}
              </a>
            ))}
          </nav>

          {/* Outlined Pill CTA */}
          <div className="flex-1 flex justify-end">
            <a
              href="#get-started"
              className="px-5 sm:px-6 py-2 rounded-full border border-white/20 bg-white/[0.04] hover:bg-white/10 backdrop-blur-sm text-[11px] font-medium tracking-[0.18em] text-white/90 hover:text-white transition-all duration-200 active:scale-95"
            >
              GET STARTED
            </a>
          </div>
        </header>

        {/* 2. Hero Title (Placed in upper-center, letting silhouette breathe in middle) */}
        <section className="w-full max-w-5xl mx-auto px-6 pt-8 sm:pt-12 md:pt-16 text-center z-10">
          <h1 className="text-3xl md:text-5xl font-extralight tracking-wide text-white/95 leading-[1.2] drop-shadow-[0_2px_18px_rgba(0,0,0,0.5)]">
            Travel without limits.
            <span className="block mt-1 sm:mt-2 font-extralight text-white/90">
              Discover with intelligence.
            </span>
          </h1>
        </section>

        {/* Visual Center Breather: Natural silhouette viewing window */}
        <div className="flex-1 min-h-[140px] sm:min-h-[200px] md:min-h-[260px] w-full pointer-events-none" />

        {/* 3. Lower Content: Description, CTA, and Footer Note */}
        <section className="w-full max-w-4xl mx-auto px-6 pb-8 sm:pb-12 flex flex-col items-center text-center z-10">
          {/* Centered 2-line Description */}
          <p className="max-w-xl text-sm sm:text-base font-light text-zinc-200/90 leading-relaxed tracking-normal drop-shadow-[0_2px_12px_rgba(0,0,0,0.75)]">
            Our AI-powered journeys adapt to you — your pace, your mood, your sense of wonder. Every trip is personalized, effortless, and truly yours.
          </p>

          {/* White Rounded Pill CTA */}
          <div className="mt-7 sm:mt-8">
            <button
              type="button"
              className="px-8 sm:px-9 py-3 sm:py-3.5 rounded-full bg-white hover:bg-zinc-100 text-zinc-950 font-medium text-sm sm:text-[15px] tracking-tight shadow-[0_4px_30px_rgba(255,255,255,0.3)] hover:shadow-[0_4px_40px_rgba(255,255,255,0.45)] hover:scale-[1.03] active:scale-[0.98] transition-all duration-200 cursor-pointer"
            >
              Build my trip now
            </button>
          </div>

          {/* Footer Note with Lock Icon */}
          <div className="mt-5 sm:mt-6 flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] tracking-[0.22em] text-white/50 font-medium uppercase drop-shadow">
            <svg
              className="w-3 h-3 text-white/60 -mt-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>PRIVACY-FIRST. NO DATA RESOLD.</span>
          </div>
        </section>
      </div>
    </main>
  );
}
