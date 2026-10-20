import React, { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
    ArrowRight, Layers, ShieldCheck, Eye, GitBranch, Radar, Network, Search,
    Stethoscope, Gauge, Wrench, UserCheck, CheckCircle2
} from 'lucide-react';
import Orb from './Orb';
import { BrandMark } from './ui';

const ease = [0.16, 1, 0.3, 1];

// ============================================================================
// CuraSense landing page
// ============================================================================
export default function LandingPage() {
    return (
        <div className="min-h-screen w-full bg-canvas text-fg overflow-x-hidden">
            {/* Ambient orb (decorative, kept subtle) */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] overflow-hidden" aria-hidden>
                <div className="absolute top-[-300px] left-1/2 -translate-x-1/2 opacity-35 mix-blend-screen">
                    <div style={{ width: '1000px', height: '1000px', position: 'relative' }}>
                        <Orb hue={0} hoverIntensity={0.3} rotateOnHover forceHoverState={false} />
                    </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-canvas" />
            </div>

            <div className="relative z-10">
                <Header />
                <HeroSection />
                <WorkflowSection />
                <FeatureMatrix />
                <Footer />
            </div>
        </div>
    );
}

// ============================================================================
// Header
// ============================================================================
function Header() {
    return (
        <header className="sticky top-0 z-50 border-b border-line/60 bg-canvas/70 backdrop-blur">
            <div className="max-w-6xl mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-4">
                <BrandMark />
                <nav className="flex items-center gap-2">
                    <a href="/merchant.html" className="btn btn-ghost btn-sm hidden sm:inline-flex">Merchant portal</a>
                    <a href="/support.html" className="btn btn-primary btn-sm">
                        Launch dashboard
                        <ArrowRight />
                    </a>
                </nav>
            </div>
        </header>
    );
}

// ============================================================================
// Hero
// ============================================================================
function HeroSection() {
    return (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-20 text-center">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease }}
                className="flex flex-col items-center"
            >
                <span className="badge badge-accent h-7 px-3 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    AI incident response for e-commerce migrations
                </span>

                <h1 className="mt-6 max-w-3xl text-balance text-4xl sm:text-5xl font-semibold leading-[1.1] tracking-[-0.03em]">
                    Migrations generate thousands of tickets.
                    <span className="block text-fg-muted">CuraSense resolves them.</span>
                </h1>

                <p className="mt-5 max-w-xl text-base leading-7 text-fg-muted">
                    An agentic workflow that clusters errors, diagnoses root causes, assesses risk and drafts fixes — with human approval wherever it matters.
                </p>

                <div className="mt-8 w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <a href="/support.html" className="btn btn-primary btn-lg">
                        Open operations console
                        <ArrowRight />
                    </a>
                    <a href="/merchant.html" className="btn btn-secondary btn-lg">Submit a merchant issue</a>
                </div>
            </motion.div>
        </section>
    );
}

// ============================================================================
// Agent workflow strip
// ============================================================================
function WorkflowSection() {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-80px" });
    const steps = [
        { icon: Radar, label: 'Observe', body: 'Tickets, webhooks and monitoring APIs' },
        { icon: Network, label: 'Cluster', body: 'Group related errors into incidents' },
        { icon: Search, label: 'Retrieve', body: 'RAG over docs and past incidents' },
        { icon: Stethoscope, label: 'Diagnose', body: 'Identify the root cause with confidence' },
        { icon: Gauge, label: 'Assess risk', body: 'Score blast radius and severity' },
        { icon: Wrench, label: 'Draft fix', body: 'Propose code, config or a reply' },
        { icon: UserCheck, label: 'Approve', body: 'Human review for high-risk actions' },
    ];

    return (
        <section ref={ref} className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, ease }}
                className="card p-5 sm:p-6"
            >
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-5">
                    <div>
                        <div className="t-overline">Agent workflow</div>
                        <h2 className="t-h1 mt-1">From signal to resolution</h2>
                    </div>
                    <p className="t-meta sm:text-right max-w-xs">Every step is logged with its evidence and reasoning.</p>
                </div>
                <ol className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {steps.map(({ icon: Icon, label, body }, i) => (
                        <li key={label} className="well p-3.5">
                            <div className="flex items-center justify-between">
                                <Icon className="w-4 h-4 text-accent" />
                                <span className="t-mono text-fg-subtle">{String(i + 1).padStart(2, '0')}</span>
                            </div>
                            <div className="t-h3 mt-3">{label}</div>
                            <p className="t-meta mt-1">{body}</p>
                        </li>
                    ))}
                </ol>
            </motion.div>
        </section>
    );
}

// ============================================================================
// Feature matrix
// ============================================================================
function FeatureMatrix() {
    const features = [
        {
            icon: Layers,
            label: "The problem",
            title: "The volume problem",
            body: "Platform migrations trigger a massive spike in repetitive support tickets. The agent absorbs that noise so your team doesn't have to."
        },
        {
            icon: GitBranch,
            label: "The solution",
            title: "Resolution with oversight",
            body: "The system identifies and proposes fixes for common migration errors. You stay in control by approving them with a single click."
        },
        {
            icon: Eye,
            label: "Transparency",
            title: "Clear decision paths",
            body: "Every proposed action includes the exact data and logic used by the AI. No hidden reasoning, just clear diagnostic paths."
        },
        {
            icon: ShieldCheck,
            label: "Security",
            title: "Safety-first execution",
            body: "High-risk operations are automatically flagged for manual review, so no platform-wide change happens without human eyes."
        }
    ];

    return (
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
            <div className="mb-6">
                <div className="t-overline">How it works</div>
                <h2 className="t-h1 sm:text-2xl sm:leading-8 mt-1">Built for teams running migrations at scale</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {features.map((feature, i) => (
                    <FeatureCard key={feature.title} feature={feature} index={i} />
                ))}
            </div>
        </section>
    );
}

function FeatureCard({ feature, index }) {
    const ref = useRef(null);
    const isInView = useInView(ref, { once: true, margin: "-40px" });
    const Icon = feature.icon;

    return (
        <motion.article
            ref={ref}
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: index * 0.05, duration: 0.45, ease }}
            className="card p-5 sm:p-6 transition-colors hover:border-line-strong"
        >
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/12 ring-1 ring-inset ring-accent/25 text-accent">
                    <Icon className="w-[18px] h-[18px]" />
                </div>
                <span className="t-overline">{feature.label}</span>
            </div>
            <h3 className="t-h2 mt-4">{feature.title}</h3>
            <p className="t-body mt-1.5">{feature.body}</p>
        </motion.article>
    );
}

// ============================================================================
// Footer
// ============================================================================
function Footer() {
    return (
        <footer className="border-t border-line">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
                <BrandMark compact />
                <p className="t-meta flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    © 2026 CuraSense. Because migrations shouldn't mean mayhem.
                </p>
            </div>
        </footer>
    );
}
