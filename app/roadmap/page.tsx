import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  BrainCircuit,
  Check,
  Clock3,
  GitBranch,
  PlugZap,
  ShieldCheck,
  Sun,
  Waypoints,
  Workflow,
  Zap,
} from 'lucide-react';
import './roadmap.css';

export const metadata = {
  title: 'Development roadmap | EV Energy Twin AI EMS',
  description: 'See what works in the synthetic energy twin today and how it develops toward an explainable, safe, closed-loop EMS.',
};

const capabilities = [
  {
    icon: Activity,
    title: 'Replayable site twin',
    detail: 'A deterministic 24-hour workplace scenario with vehicles, charging, building demand, grid limits and a 3D campus.',
  },
  {
    icon: GitBranch,
    title: 'Six strategy baselines',
    detail: 'Immediate, Load balancing, Deadline-aware, Cheapest, Peak-aware and Total-cost-aware runs share the same scenario.',
  },
  {
    icon: Sun,
    title: 'Energy and weather views',
    detail: 'Synchronized site power, delivered energy, tariffs, regional comparisons and synthetic environmental conditions.',
  },
  {
    icon: BrainCircuit,
    title: 'Synthetic annual backtest and ML training',
    detail: 'A 365-day browser backtest compares six baselines, then trains on grouped historical weeks and applies the learned policy in the current DES.',
  },
  {
    icon: Workflow,
    title: 'Inspectable control trace',
    detail: 'A synthetic trace shows signal assessment, dispatch, virtual acknowledgement, feedback and local fallback.',
  },
  {
    icon: ShieldCheck,
    title: 'Deterministic replay lab',
    detail: 'A versioned signal flows through assessment, a separate safety check, virtual charger response and meter reconciliation.',
  },
];

const phases = [
  {
    number: '00',
    status: 'complete',
    label: 'Delivered',
    title: 'Establish the twin and simulator baseline',
    summary: 'Keep the AI EMS as a standalone project and preserve the deterministic Energy Twin as its physics and comparison baseline.',
    items: [
      'Independent static site, simulator engine and six comparable strategies.',
      'Scenario controls, synchronized charts, replay, export and a 3D workplace view.',
      'Synthetic control-loop and full-year ML training demonstrations.',
    ],
    exit: 'The site builds under its own GitHub Pages path; existing simulator behavior and browser checks pass.',
    icon: Check,
  },
  {
    number: '01',
    status: 'review',
    label: 'Review gate',
    title: 'Confirm the domain and site scope',
    summary: 'The provider-neutral ontology baseline is in place. Review the coverage register against the intended site, equipment and service requirements before adding EMS runtime behavior.',
    items: [
      'Ontology v0.2, SHACL checks, semantic fixtures and pinned adapter profiles are present.',
      'Confirm quantities, provenance, missing/stale behavior, lifecycle states and required evidence for the target site.',
      'Add any uncovered site requirement and its positive/negative fixture to the register.',
    ],
    exit: 'The scope owner signs off the coverage register; all required concepts and external boundaries have an explicit contract or a documented reason to remain provider-neutral.',
    icon: ShieldCheck,
  },
  {
    number: '02',
    status: 'prototype',
    label: 'Synthetic preview',
    title: 'Build deterministic input and event replay',
    summary: 'A synthetic reference lab now demonstrates versioned input snapshots, source provenance, event revisions, cancellation, duplicate suppression and stale-data fallback. The target-site contract still needs owner review.',
    items: [
      'Replay synthetic grid, solar, charger, connectivity and service-stress events through the existing physical simulator.',
      'Preserve source, event time, recorded time, validity, units, quality and revisions; suppress stale or conflicting input.',
      'Reproduce the same snapshot and outcome from a fixed seed; keep event-window corrections scoped to their validity.',
    ],
    exit: 'Reference fixtures and CI tests reproduce identical snapshots and cover revised, cancelled, duplicate, stale and out-of-order events. Site-specific completeness remains under review.',
    icon: Waypoints,
  },
  {
    number: '03',
    status: 'prototype',
    label: 'Rules-only preview',
    title: 'Add explainable signal assessment and recommendations',
    summary: 'Deterministic rules assess urgency and impact, recommend an existing strategy, and fall back to load balancing when assessment is unavailable or malformed.',
    items: [
      'Record event impact, flexibility estimate, confidence, rules version and concise explanation.',
      'Route the recommendation through the existing physical simulator.',
      'Check site import, session state and equipment power separately before creating command intents.',
    ],
    exit: 'Rules-only scenarios replay deterministically; unavailable and malformed assessment modes select the local fallback, and the independent validator withholds unsafe dispatch.',
    icon: BrainCircuit,
  },
  {
    number: '04',
    status: 'prototype',
    label: 'Virtual adapter preview',
    title: 'Simulate protocol commands and measured feedback',
    summary: 'The lab exercises a protocol-neutral intent and a declared virtual fixture subset without sending wire messages or implying OCPP conformance.',
    items: [
      'Create command intents with plan, session, EVSE, correlation and expiry fields.',
      'Simulate accepted, rejected, delayed, duplicate and missing acknowledgements.',
      'Keep virtual meter power and energy separate from requested and acknowledged values.',
    ],
    exit: 'Every synthetic command and feedback sample is traceable to its plan, asset and session. Profile artifacts and conformance evidence remain future work.',
    icon: PlugZap,
  },
  {
    number: '05',
    status: 'prototype',
    label: 'Scenario resilience preview',
    title: 'Close the loop and prove resilience',
    summary: 'Fixture replays cover local fallback, charger and link recovery, solar shortfall and infeasible service. Each replay is deterministic and inspectable.',
    items: [
      'Exercise stale inputs, unavailable assessment, missed acknowledgements, equipment faults and connection loss.',
      'Show recovery and service shortfall from the shared physical engine.',
      'Compare requested, acknowledged and measured behavior without claiming continuous replanning.',
    ],
    exit: 'Synthetic CI scenarios show event response, recovery and fallback while retaining limit and service evidence. Automatic multi-step replanning still needs a later implementation.',
    icon: Activity,
  },
  {
    number: '06',
    status: 'later',
    label: 'Later',
    title: 'Package stable boundaries for reuse',
    summary: 'Version the vocabulary, contracts and neutral APIs only after the standalone EMS model has stabilized.',
    items: [
      'Publish independently versioned contracts, ontology, SHACL shapes and replay metadata.',
      'Assess an explicit ChargeWeave mapping as a separate proposal; keep this EMS repository independent.',
      'Treat replay, shadow and any live adapter as separate per-boundary operating modes with their own evidence and approval gates.',
    ],
    exit: 'A reviewed portability proposal and site-specific conformance evidence exist before any real-feed or dispatch scope is considered.',
    icon: BatteryCharging,
  },
];

const statusCopy: Record<string, string> = {
  complete: 'roadmap-status roadmap-status--complete',
  review: 'roadmap-status roadmap-status--review',
  next: 'roadmap-status roadmap-status--next',
  planned: 'roadmap-status roadmap-status--planned',
  prototype: 'roadmap-status roadmap-status--prototype',
  later: 'roadmap-status roadmap-status--later',
};

export default function RoadmapPage() {
  return (
    <main className="roadmap-page">
      <header className="roadmap-header">
        <Link className="roadmap-brand" href="/">
          <span className="roadmap-brand-mark"><Waypoints size={19} /></span>
          <span>FUTURE <b>EV</b></span>
          <i />
          <strong>Energy Twin</strong>
        </Link>
        <nav className="roadmap-header-links" aria-label="Simulator pages">
          <Link href="/training/">ML training lab</Link>
          <Link href="/replay/">Replay lab</Link>
          <Link className="roadmap-open-simulator" href="/"><ArrowLeft size={15} /> Back to simulator</Link>
        </nav>
      </header>

      <div className="roadmap-content">
        <section className="roadmap-hero">
          <div className="roadmap-hero-copy">
            <div className="roadmap-eyebrow"><span /> SIMULATOR DEVELOPMENT PLAN</div>
            <h1>From a replayable twin<br /><em>to a closed-loop EMS.</em></h1>
            <p>Build the system in evidence-led steps: normalize trusted inputs, produce safe recommendations, exercise protocol behavior, then reconcile commands with measured feedback.</p>
            <div className="roadmap-hero-actions">
              <Link className="roadmap-button roadmap-button--primary" href="/replay/"><Workflow size={17} /> Run synthetic replay</Link>
              <Link className="roadmap-text-link" href="/"><Activity size={17} /> Explore the simulator</Link>
              <a className="roadmap-text-link" href="#delivery-roadmap">View the delivery stages <ArrowRight size={16} /></a>
            </div>
          </div>

          <aside className="roadmap-current-card" aria-label="Current development status">
            <div className="roadmap-current-top"><span className="roadmap-pulse" /> CURRENT GATE <span>01 / 06</span></div>
            <h2>Domain scope review</h2>
            <p>The target-site scope review is still open. A synthetic event-to-feedback reference is ready to inspect, but it does not close the site-specific gate.</p>
            <div className="roadmap-next-line"><span>Review the synthetic implementation</span><b>Run the deterministic replay lab</b></div>
            <div className="roadmap-progress" role="img" aria-label="The simulator foundation is delivered, site scope remains under review, and synthetic previews cover phases two through five">
              <i className="is-done" /><i className="is-review" /><i className="is-prototype" /><i className="is-prototype" /><i className="is-prototype" /><i className="is-prototype" /><i />
            </div>
            <small>Stages describe capability gates, not calendar promises.</small>
          </aside>
        </section>

        <section className="roadmap-scope-note" role="note">
          <ShieldCheck size={21} />
          <div>
            <strong>What the demo does and does not represent</strong>
            <p>The simulator, control-loop trace, replay lab and ML lab use synthetic or replayed data. They are not connected to live weather or grid feeds, OpenADR, real meters, chargers/OCPP or a production controller.</p>
          </div>
        </section>

        <section className="roadmap-today" aria-labelledby="roadmap-today-title">
          <div className="roadmap-section-heading">
            <div><div className="roadmap-eyebrow">AVAILABLE IN THE DEMO NOW</div><h2 id="roadmap-today-title">A useful simulator foundation is already here.</h2></div>
            <Link className="roadmap-text-link" href="/training/">Open the ML training lab <ArrowRight size={16} /></Link>
          </div>
          <div className="roadmap-capabilities">
            {capabilities.map(({ icon: Icon, title, detail }, index) => (
              <article className="roadmap-capability" key={title}>
                <div className="roadmap-capability-top"><Icon size={18} /><span>0{index + 1}</span></div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </article>
            ))}
          </div>
          <div className="roadmap-year-note"><Clock3 size={16} /><p>The “365-day” training set is a set of seeded simulator replays across seasonal conditions. It is not a continuous year of site operation or real-world training data.</p></div>
        </section>

        <section className="roadmap-delivery" id="delivery-roadmap" aria-labelledby="roadmap-delivery-title">
          <div className="roadmap-section-heading roadmap-section-heading--delivery">
            <div><div className="roadmap-eyebrow">BUILD SEQUENCE</div><h2 id="roadmap-delivery-title">Move from simulation to evidence, one gate at a time.</h2></div>
            <div className="roadmap-key" aria-label="Roadmap status key">
              <span><i className="key-done" />Delivered</span>
              <span><i className="key-review" />Review gate</span>
              <span><i className="key-prototype" />Synthetic preview</span>
              <span><i className="key-planned" />Planned</span>
            </div>
          </div>

          <div className="roadmap-phase-list">
            {phases.map(({ number, status, label, title, summary, items, exit, icon: Icon }) => (
              <article className={'roadmap-phase roadmap-phase--' + status} data-status={status} key={number}>
                <div className="roadmap-phase-marker"><Icon size={18} /><span>{number}</span></div>
                <div className="roadmap-phase-card">
                  <div className="roadmap-phase-meta"><span className={statusCopy[status]}>{label}</span>{status === 'prototype' && <span className="roadmap-next-badge">SYNTHETIC REFERENCE · SCOPE GATE OPEN</span>}</div>
                  <h3>{title}</h3>
                  <p className="roadmap-phase-summary">{summary}</p>
                  <div className="roadmap-phase-build">
                    <span>Build slice</span>
                    <ul>{items.map(item => <li key={item}>{item}</li>)}</ul>
                  </div>
                  <div className="roadmap-exit">
                    <ShieldCheck size={17} />
                    <div><b>Exit evidence</b><p>{exit}</p></div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="roadmap-guardrails" aria-labelledby="roadmap-guardrails-title">
          <div className="roadmap-guardrail-heading"><ShieldCheck size={21} /><div><div className="roadmap-eyebrow">SAFETY AND EVIDENCE THROUGHOUT</div><h2 id="roadmap-guardrails-title">Recommendations can guide the plan. They cannot bypass it.</h2></div></div>
          <div className="roadmap-guardrail-grid">
            <div><Zap size={17} /><b>Deterministic limits</b><p>The planner and validator enforce site, charger, battery and service constraints.</p></div>
            <div><BrainCircuit size={17} /><b>Traceable advice</b><p>Record the input snapshot, rules/model version, recommendation and explanation.</p></div>
            <div><Activity size={17} /><b>Observed outcomes</b><p>Keep requested, acknowledged and measured power and delivered energy distinct.</p></div>
            <div><Workflow size={17} /><b>Safe fallback</b><p>Stale inputs, unavailable assessment or lost communication must not create unsafe dispatch.</p></div>
          </div>
        </section>

        <footer className="roadmap-footer">
          <span>ROADMAP SOURCE · AI EMS BUILD PLAN</span>
          <div>
            <a href="https://github.com/pli-poc/ev-flexibility-twin/blob/main/docs/ai-ems-build-plan.md" target="_blank" rel="noreferrer">Build plan <ArrowRight size={13} /></a>
            <a href="https://github.com/pli-poc/ev-flexibility-twin/blob/main/docs/ontology-coverage.md" target="_blank" rel="noreferrer">Coverage register <ArrowRight size={13} /></a>
            <a href="https://github.com/pli-poc/ev-flexibility-twin/blob/main/docs/standards-and-adapters.md" target="_blank" rel="noreferrer">Adapter policy <ArrowRight size={13} /></a>
          </div>
        </footer>
      </div>
    </main>
  );
}
