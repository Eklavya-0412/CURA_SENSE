import React, { useRef } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { Shield } from 'lucide-react';
import Orb from './Orb';

// Spring configs
const springConfig = { type: "spring", stiffness: 300, damping: 30 };
const floatSpring = { type: "spring", stiffness: 120, damping: 20 };

// ============================================================================
// AETHER LANDING PAGE - Scrollable Monochrome Interface
// ============================================================================
export default function LandingPage() {
    return (
        <div className="min-h-screen w-full bg-[#09090b] text-[#fafafa] overflow-x-hidden">
            {/* Ambient Blue Aura */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[30%] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[#3b82f6] opacity-[0.03] blur-[200px] rounded-full" />
                <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#60a5fa] opacity-[0.02] blur-[150px] rounded-full" />

                {/* Antigravity Orb */}
                <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 opacity-60 mix-blend-screen">
                    <div style={{ width: '1080px', height: '1080px', position: 'relative' }}>
                        <Orb
                            hue={0}
                            hoverIntensity={0.5}
                            rotateOnHover
                            forceHoverState={false}
                        />
                    </div>
                </div>
            </div>

            {/* Content Stack */}
            <div className="relative z-10 flex flex-col items-center">
                <Header />
                <HeroSection />
                <FeatureMatrix />
                <div className="h-64" /> {/* Blank spacer */}
                <Footer />
            </div>
        </div>
    );
}

// ============================================================================
// MINIMAL HEADER - Logo + Glowing CTA
// ============================================================================
function Header() {
    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, ...springConfig }}
            className="fixed top-0 left-0 right-0 z-50 w-full p-5"
        >
            <div className="flex items-center justify-between">
                {/* Official CuraSense Logo */}
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[rgba(59,130,246,0.08)] rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.15)]">
                        <Shield className="w-5 h-5 text-[#3b82f6]" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">CuraSense</span>
                </div>

                {/* CTA Button - Top right corner */}
                <motion.a
                    href="/support.html"
                    className="px-24 py-10 bg-[#09090b] border border-[#3b82f6] text-white rounded-lg font-semibold text-sm shadow-[0_0_20px_rgba(59,130,246,0.3)] tracking-wide flex items-center justify-center transition-all hover:shadow-[0_0_35px_rgba(59,130,246,0.5)] hover:scale-105"
                    style={{ minWidth: '160px', minHeight: '48px', padding: '12px 24px' }}
                >
                    Launch Dashboard
                </motion.a>
            </div>
        </motion.header>
    );
}

// ============================================================================
// HERO SECTION - Full Viewport Height
// ============================================================================
function HeroSection() {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start start", "end start"]
    });

    const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
    const y = useTransform(scrollYProgress, [0, 0.5], [0, -100]);
    const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

    return (
        <section
            ref={ref}
            className="w-full min-h-screen flex flex-col items-center justify-center px-8 relative"
        >
            <motion.div
                style={{ opacity, y, scale }}
                className="text-center"
            >
                {/* Headline */}
                <motion.h1
                    initial={{ opacity: 0, y: 25 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, ...springConfig }}
                    className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight max-w-4xl"
                >
                    E-commerce migrations
                    <br />
                    <span className="text-[#71717a]">generate thousands of tickets.</span>
                    <br />
                    <span className="bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] bg-clip-text text-transparent">
                        Beyond Sensing, Enables Recovery.
                    </span>
                </motion.h1>
            </motion.div>
        </section>
    );
}

// ============================================================================
// FEATURE MATRIX - Vertical Scroll Reveal
// ============================================================================
function FeatureMatrix() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-100px" });

    const features = [
        {
            label: "THE PROBLEM",
            title: "The Volume Problem",
            body: "Platform migrations trigger a massive spike in repetitive support tickets. Our agent absorbs that noise so your team doesn't have to."
        },
        {
            label: "THE SOLUTION",
            title: "Resolution with Oversight",
            body: "The system identifies and proposes fixes for common migration errors. You maintain control by approving them with a single click."
        },
        {
            label: "TRANSPARENCY",
            title: "Clear Decision Paths",
            body: "Every proposed action includes the exact data and logic used by the AI. No hidden reasoning, just clear diagnostic paths."
        },
        {
            label: "SECURITY",
            title: "Safety-First Execution",
            body: "High-risk operations are automatically flagged for manual review, ensuring no platform-wide changes happen without human eyes."
        }
    ];

    return (
        <section ref={ref} className="w-full max-w-3xl mx-auto px-8 py-32">
            {/* Section Header */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={springConfig}
                className="text-center mb-48"
            >
                <h2 className="text-3xl md:text-4xl font-bold">How It Works</h2>
            </motion.div>

            {/* Vertical Feature Stack */}
            <div className="flex flex-col gap-16">
                {features.map((feature, i) => (
                    <FeatureCard key={i} feature={feature} index={i} />
                ))}
            </div>
        </section>
    );
}

function FeatureCard({ feature, index }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-50px" });

    return (
        <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 50 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: index * 0.1, ...floatSpring }}
            whileHover={{
                y: -4,
                boxShadow: "0 20px 50px rgba(59,130,246,0.12), 0 8px 30px rgba(0,0,0,0.5)"
            }}
            className="bg-[#18181b] border border-[#27272a] rounded-xl p-10 flex flex-col items-center text-center shadow-[0_8px_30px_rgba(59,130,246,0.06),_0_4px_20px_rgba(0,0,0,0.4)] transition-colors hover:border-[#3f3f46]"
        >
            {/* Label */}
            <span className="text-[10px] font-semibold tracking-[0.15em] text-[#52525b] uppercase">
                {feature.label}
            </span>

            {/* Title */}
            <h3 className="text-2xl font-bold mt-3 mb-4 text-[#fafafa]">
                {feature.title}
            </h3>

            {/* Body */}
            <p className="text-base text-[#a1a1aa] leading-relaxed max-w-lg">
                {feature.body}
            </p>
        </motion.div>
    );
}

// ============================================================================
// FOOTER
// ============================================================================
function Footer() {
    return (
        <footer className="w-full max-w-5xl mx-auto px-8 pt-48 pb-24 text-center">
            <p className="text-xs text-[#52525b]">
                © 2026 MigraGuard. Because migrations shouldn't mean mayhem.
            </p>
        </footer>
    );
}
