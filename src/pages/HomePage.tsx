import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'motion/react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import agronomistImg from '../assets/images/agronomist_field_review_1794548286484.jpg';
import heroCropsImg from '../assets/images/hero_healthy_crops_1794548267372.jpg';
import leafMacroImg from '../assets/images/leaf_macro_inspection_1794548304079.jpg';
import type { PageId } from '../types';

interface HomePageProps {
  onScrollTo: (sectionId: PageId) => void;
}

export function HomePage({ onScrollTo }: HomePageProps) {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  const [activeStage, setActiveStage] = useState<0 | 1 | 2>(0);
  const [heroVideoFailed, setHeroVideoFailed] = useState(false);

  const heroSectionRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: heroScrollProgress } = useScroll({
    target: heroSectionRef,
    offset: ['start start', 'end start'],
  });

  const heroVideoScale = useTransform(heroScrollProgress, [0, 1], shouldReduceMotion ? [1, 1] : [1, 1.12]);
  const heroVideoY = useTransform(heroScrollProgress, [0, 1], shouldReduceMotion ? [0, 0] : [0, 64]);
  const heroOverlayOpacity = useTransform(heroScrollProgress, [0, 0.85], [0.46, 0.86]);
  const heroContentY = useTransform(heroScrollProgress, [0, 0.8], shouldReduceMotion ? [0, 0] : [0, -40]);
  const heroContentOpacity = useTransform(heroScrollProgress, [0, 0.7], [1, 0]);

  const detectionStages = [
    {
      index: '01',
      title: t('home.step1Title'),
      description: t('home.step1Desc'),
      image: heroCropsImg,
      imageAlt: 'Healthy irrigated agricultural crop rows in sunlight',
      targetSection: 'scan-plant' as PageId,
      targetLabel: t('nav.detect'),
    },
    {
      index: '02',
      title: t('home.step2Title'),
      description: t('home.step2Desc'),
      image: leafMacroImg,
      imageAlt: 'Close-up botanical inspection of plant leaf lesions and chlorosis',
      targetSection: 'plant-monitoring' as PageId,
      targetLabel: t('nav.monitoring'),
    },
    {
      index: '03',
      title: t('home.step3Title'),
      description: t('home.step3Desc'),
      image: agronomistImg,
      imageAlt: 'Agronomist inspecting crop health and regional guidance',
      targetSection: 'outbreak-map' as PageId,
      targetLabel: t('nav.map'),
    },
  ];

  return (
    <div id="home" className="bg-sr-canvas text-sr-text transition-colors">
      {/* Full-Screen Cinematic Plant Video Hero (Zero Upload or Camera Controls Here) */}
      <div
        ref={heroSectionRef}
        className="relative min-h-[100svh] w-full overflow-hidden bg-[#0D1A11] text-white flex flex-col justify-end"
      >
        <motion.div
          style={{ scale: heroVideoScale, y: heroVideoY }}
          className="absolute inset-0 w-full h-full will-change-transform"
        >
          {heroVideoFailed ? (
            <img
              src="/videos/hero-plant-poster.jpg"
              alt="Growing green crop seedlings in agricultural soil"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <video
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              poster="/videos/hero-plant-poster.jpg"
              onError={() => setHeroVideoFailed(true)}
              className="w-full h-full object-cover"
            >
              <source src="/videos/hero-plant.mp4" type="video/mp4" />
            </video>
          )}
        </motion.div>

        <motion.div
          style={{ opacity: heroOverlayOpacity }}
          aria-hidden="true"
          className="absolute inset-0 bg-[#08120B]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-[#09150D]/75 via-[#09150D]/25 to-[#09150D]/90"
        />

        <motion.div
          style={{ y: heroContentY, opacity: heroContentOpacity }}
          className="relative z-10 max-w-[1200px] w-full mx-auto px-5 sm:px-8 pt-28 pb-14 sm:pb-20"
        >
          <p className="text-xs sm:text-sm font-medium tracking-[0.18em] text-[#B7D6AE]">
            {t('home.brandTitle')} · {t('home.eyebrow')}
          </p>

          <h1 className="mt-4 max-w-4xl [text-wrap:balance]">
            <button
              type="button"
              onClick={() => onScrollTo('scan-plant')}
              className="font-editorial text-left text-[clamp(2.4rem,5.4vw,4.6rem)] font-semibold leading-[1.04] tracking-[-0.015em] text-white hover:text-[#EAF2E6] transition-colors cursor-pointer"
            >
              {t('home.heroTitle')}
            </button>
          </h1>

          <p className="mt-5 text-base sm:text-lg leading-relaxed text-[#E2EBE0] max-w-2xl">
            {t('home.heroSubtitle')}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onScrollTo('scan-plant')}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 text-sm font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{t('home.goToScanCta')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onScrollTo('plant-monitoring')}
              className="inline-flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/25 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{t('nav.monitoring')}</span>
            </button>
          </div>

          <div className="mt-12 pt-6 border-t border-white/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-[#C7D7C2]">
            <span>{t('home.supportedNote')}</span>
            <button
              type="button"
              onClick={() => onScrollTo('scan-plant')}
              className="inline-flex items-center gap-2 text-xs font-medium text-white/90 hover:text-white cursor-pointer self-start sm:self-auto"
            >
              <span>{t('home.scrollExplore')}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>

      {/* Concise Editorial Overview & 3-Stage Visual Story */}
      <div className="bg-sr-footer text-sr-footer-text py-20 sm:py-24 border-b border-sr-border transition-colors">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6 space-y-5">
            <p className="text-xs tracking-[0.18em] text-[#9CC192] font-medium">
              {t('home.storyProblemKicker')}
            </p>
            <h2 className="font-editorial text-[clamp(2rem,3.6vw,3.1rem)] font-semibold leading-[1.08] tracking-[-0.01em] text-white [text-wrap:balance]">
              {t('home.storyProblemTitle')}
            </h2>
            <p className="text-base leading-relaxed text-sr-footer-text max-w-xl">
              {t('home.storyProblemDesc')}
            </p>
            <div className="pt-2 flex flex-wrap gap-6 text-sm">
              <button
                type="button"
                onClick={() => onScrollTo('scan-plant')}
                className="inline-flex items-center gap-2 font-semibold text-[#B7D6AE] hover:text-white cursor-pointer"
              >
                <span>{t('nav.detect')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onScrollTo('outbreak-map')}
                className="inline-flex items-center gap-2 font-semibold text-sr-footer-text hover:text-white cursor-pointer"
              >
                <span>{t('nav.map')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative rounded-2xl overflow-hidden border border-white/15 bg-black/30">
              <img
                src={leafMacroImg}
                alt="Close-up botanical inspection of leaf surface structure"
                className="w-full h-[320px] sm:h-[380px] object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 via-black/65 to-transparent">
                <p className="text-xs sm:text-sm text-[#DCE7D8] leading-relaxed">
                  {t('home.storyProblemCaption')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Workflow Preview */}
      <div className="bg-sr-canvas text-sr-text py-20 sm:py-24 border-b border-sr-border transition-colors">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs tracking-[0.18em] text-sr-accent-ink font-semibold">
              {t('home.storyMethodKicker')}
            </p>
            <h2 className="font-editorial mt-2.5 text-[clamp(1.9rem,3.5vw,2.9rem)] font-semibold leading-[1.1] text-sr-text">
              {t('home.howTitle')}
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-5 space-y-3">
              {detectionStages.map((stage, idx) => {
                const selected = activeStage === idx;
                return (
                  <button
                    key={stage.index}
                    type="button"
                    onClick={() => setActiveStage(idx as 0 | 1 | 2)}
                    className={`w-full text-left p-5 rounded-xl border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-sr-surface-alt sr-surface-glass border-sr-accent'
                        : 'bg-sr-surface sr-surface-glass border-sr-border hover:border-sr-border-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className={`font-mono font-semibold ${selected ? 'text-sr-accent-ink' : 'text-sr-muted'}`}>
                        {stage.index}
                      </span>
                      <span className="font-medium text-sr-muted">{stage.targetLabel}</span>
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-sr-text">{stage.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-sr-muted">{stage.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7">
              <div className="relative rounded-2xl overflow-hidden border border-sr-border bg-sr-surface-alt h-[340px] sm:h-[420px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={detectionStages[activeStage].index}
                    initial={shouldReduceMotion ? undefined : { opacity: 0, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0"
                  >
                    <img
                      src={detectionStages[activeStage].image}
                      alt={detectionStages[activeStage].imageAlt}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    <div className="absolute bottom-0 inset-x-0 p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                      <div>
                        <p className="text-xs tracking-[0.16em] text-[#C8DFC2]">
                          {detectionStages[activeStage].index} · {detectionStages[activeStage].targetLabel}
                        </p>
                        <p className="font-editorial mt-1.5 text-2xl sm:text-3xl font-semibold">
                          {detectionStages[activeStage].title}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onScrollTo(detectionStages[activeStage].targetSection)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <span>{detectionStages[activeStage].targetLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
