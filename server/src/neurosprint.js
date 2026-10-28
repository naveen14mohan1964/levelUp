// NeuroSprint engine: 5-phase cognitive learning system designed to overcome reading resistance.
// Combines:
// 1. Bayesian Prediction Trap (violating intuition -> ACC & Dopamine prediction error)
// 2. 120-Second Limbic Contract (strict micro-commitment timer removing avoidance)
// 3. Monochunking (max 35-word cards, zero scroll, preventing cognitive load saturation)
// 4. Enactive Interactive Simulation (motor-sensory state manipulation instead of passive text)
// 5. Protégé Effect Socratic PR Review (coaching a junior avatar -> activating social reasoning)

const gemini = require('./gemini');

// High-speed instant curated packs for core architectural & engineering concepts
const CURATED_PACKS = {
  // Caching / System Design
  cache: {
    match: /cache|caching|redis|memcached|stampede|thundering/i,
    trap: {
      question: "Traffic jumps 20×. You add a distributed Redis cache with a 60-second TTL to protect your database. What happens at second 61?",
      options: [
        "The cache automatically warms up and DB load stays flat at 5%.",
        "Thousands of concurrent requests see a cache miss at the exact same millisecond and crush the DB (Cache Stampede).",
        "Redis slows down to shed load, preventing DB requests."
      ],
      correctIndex: 1,
      shockFact: "At TTL expiry, 10,000 concurrent threads hit a cache miss simultaneously. They all query the DB together, causing a catastrophic 100% CPU lockup."
    },
    monochunks: [
      {
        title: "The Illusion of Safety",
        text: "Caching protects read-heavy databases during steady state. But when popular keys expire, protection drops to zero instantly.",
        anchor: "Cache Hit: 99.9%  ->  Cache Expired: 0%"
      },
      {
        title: "The Stampede Mechanism",
        text: "Without locking, every incoming thread detects a cache miss and initiates its own expensive DB query concurrently.",
        anchor: "10,000 requests * 50ms query = DB crash"
      },
      {
        title: "The Senior Mitigation",
        text: "Use a Mutex/SingleFlight lock so only 1 thread queries the DB while others await, or refresh the cache probabilistically before expiry (XFetch).",
        anchor: "Pattern: Mutex on Miss or Soft TTL"
      }
    ],
    simulation: {
      kind: "cache",
      title: "Cache Stampede Sandbox",
      description: "Increase traffic and expire the key to watch the database CPU threshold explode.",
      sliderLabel: "Concurrent Requests",
      min: 10,
      max: 1000,
      initial: 50,
      toggleLabel: "Enable SingleFlight Mutex",
      causality: "With Mutex OFF, 100% of expired traffic hits SQL Server. With Mutex ON, exactly 1 query touches the DB while 999 wait."
    },
    prReview: {
      juniorComment: "Hey senior! I noticed DB load was high so I cached user profiles in Redis. Can you review this fetch method before I merge?",
      filename: "UserProfileService.cs",
      code: `var cached = await _redis.GetStringAsync(key);\nif (cached != null) return Deserialize(cached);\nvar profile = await _db.Users.FindAsync(key); // Line 3: Direct DB fallback\nawait _redis.SetStringAsync(key, Serialize(profile), TimeSpan.FromMinutes(5));\nreturn profile;`,
      vulnerableLine: 3,
      bugDescription: "Missing distributed mutex or probabilistic early refresh on cache miss.",
      mitigationChoices: [
        "Wrap the DB query in a distributed lock or semaphore (SingleFlight) so only one thread executes the query.",
        "Increase the Redis memory limit from 4GB to 16GB."
      ],
      correctChoiceIndex: 0,
      explanation: "Without a lock, 1,000 concurrent requests finding `cached == null` will all execute `_db.Users.FindAsync` at the same time."
    },
    takeaway: "A cache without stampede protection is a time bomb waiting for key expiration."
  },

  // Two-way doors / Engineering Judgement
  doors: {
    match: /door|decision|irreversib|reversib|judgement|adr|trade-off/i,
    trap: {
      question: "A tech lead spends 3 weeks in architecture reviews deciding whether to use snake_case or camelCase in an internal microservice DTO. What went wrong?",
      options: [
        "Nothing, consistency across internal microservices is critical.",
        "They treated a reversible Two-Way Door as an irreversible One-Way Door, burning massive engineering salary on zero risk.",
        "They should have used gRPC binary formatting instead."
      ],
      correctIndex: 1,
      shockFact: "Over-analyzing reversible decisions is the #1 killer of team velocity. If reversing an error takes under 2 hours, deciding should take under 10 minutes."
    },
    monochunks: [
      {
        title: "One-Way vs Two-Way",
        text: "Type 1 decisions are irreversible (schema on live tables, public APIs). Type 2 decisions are easily walked back (internal layouts, flags).",
        anchor: "Cost of Reversal = Time to Decide"
      },
      {
        title: "The Velocity Trap",
        text: "Bureaucratic teams apply heavy Type 1 committee processes to Type 2 two-way doors, paralyzing momentum.",
        anchor: "70% Information Rule (Bezos)"
      },
      {
        title: "Senior Judgement",
        text: "Make two-way door decisions rapidly with high conviction. Save deliberate, slow consensus for irreversible one-way commitments.",
        anchor: "Action: Feature Flag & Move Forward"
      }
    ],
    simulation: {
      kind: "decision",
      title: "Decision Cost & Reversibility Sandbox",
      description: "Adjust decision reversibility and deliberation time to observe project velocity vs risk impact.",
      sliderLabel: "Days Spent Deliberating",
      min: 1,
      max: 30,
      initial: 14,
      toggleLabel: "Protected by Feature Flag (Two-Way Door)",
      causality: "When protected by a feature flag, deliberation past day 2 produces negative ROI—launch and measure real data instead."
    },
    prReview: {
      juniorComment: "Senior, we need to choose our caching vendor. I wrote an ADR proposing 4 weeks of benchmarking before writing any code. Good to approve?",
      filename: "ADR-014-cache-vendor.md",
      code: `Status: Proposed\nScope: Internal service response cache\nPlan: 4-week benchmark across Redis, Memcached, Dragonfly, Garnet\nRollback plan: Service uses standard IDistributedCache abstraction.`,
      vulnerableLine: 3,
      bugDescription: "Over-deliberation on a two-way door: the code already uses the IDistributedCache abstraction!",
      mitigationChoices: [
        "Reject 4-week benchmark. Pick Redis today behind IDistributedCache; swapping implementations later takes 2 hours if ever needed.",
        "Approve the benchmark and add 2 more database vendors to evaluate."
      ],
      correctChoiceIndex: 0,
      explanation: "Because IDistributedCache isolates callers, the decision is a classic two-way door. Pick the industry standard and move fast."
    },
    takeaway: "Decide two-way doors with 70% information; preserve slow deliberation strictly for one-way doors."
  },

  // Connection pools / Concurrency
  pool: {
    match: /pool|connection|thread|deadlock|concurren|mutex|lock/i,
    trap: {
      question: "Under 10× traffic spike, your API response times climb to 8 seconds. A junior dev suggests increasing DB connection pool from 20 to 500. What happens?",
      options: [
        "Throughput increases by 25× because 500 queries run in parallel.",
        "The database CPU hits 100% from OS thread context-switching and locks freeze, collapsing throughput to near zero.",
        "Database memory usage increases, but latency drops."
      ],
      correctIndex: 1,
      shockFact: "More connections != more speed! A 16-core CPU can only execute 16 threads concurrently. 500 connections cause CPU thrashing, destroying throughput."
    },
    monochunks: [
      {
        title: "The Physical Boundary",
        text: "A database server is bound by disk I/O and CPU cores. Spawning 500 active connection threads starves the CPU cache.",
        anchor: "Optimal Pool = (CPU Cores * 2) + Disk Count"
      },
      {
        title: "The Context-Switch Tax",
        text: "When 500 threads fight for 8 CPU cores, the operating system spends more time switching context than executing SQL queries.",
        anchor: "Thread Thrashing: 90% CPU on overhead"
      },
      {
        title: "The Queueing Paradox",
        text: "A small connection pool (e.g., 20) with requests queueing in memory serves requests faster than a bloated pool that chokes the database.",
        anchor: "Small Pool = Predictable Sub-10ms Latency"
      }
    ],
    simulation: {
      kind: "pool",
      title: "Connection Pool & Thread Thrashing Sandbox",
      description: "Increase connection pool size beyond CPU core limits to watch context switching destroy database throughput.",
      sliderLabel: "Connection Pool Max Size",
      min: 5,
      max: 200,
      initial: 20,
      toggleLabel: "Cap Pool to Physical Core Limit (16)",
      causality: "When pool size exceeds 3× core count, throughput plunges due to CPU context switching and lock contention."
    },
    prReview: {
      juniorComment: "Senior, during load testing some requests timed out waiting for a connection, so I set MaxPoolSize=1000 in the connection string!",
      filename: "appsettings.json",
      code: `{\n  "ConnectionStrings": {\n    "Default": "Server=sql01;Database=App;MaxPoolSize=1000;Connect Timeout=60;" // Line 3\n  }\n}`,
      vulnerableLine: 3,
      bugDescription: "Dangerous connection pool inflation that will overwhelm the SQL instance under surge.",
      mitigationChoices: [
        "Revert MaxPoolSize to 25-50. Optimize slow queries and add in-memory queueing with circuit breaker instead.",
        "Increase Connect Timeout from 60 to 300 seconds so requests wait even longer."
      ],
      correctChoiceIndex: 0,
      explanation: "Inflating connection pools shifts bottleneck to the database CPU, turning a transient spike into total outage."
    },
    takeaway: "Keep connection pools small and tight. True concurrency is bounded by CPU cores, not socket handles."
  }
};

/**
 * Returns a curated pack if one matches, or calls Gemini to generate a neurocognitive sprint pack.
 */
async function getSprintPack({ track, lessonId, title, learn, check, build }) {
  const query = `${title || ''} ${learn || ''} ${check || ''}`;
  
  // 1. Try curated packs first for instant sub-millisecond response
  for (const pack of Object.values(CURATED_PACKS)) {
    if (pack.match.test(query)) {
      return { source: 'curated', ...pack };
    }
  }

  // 2. Dynamic generation with Gemini if API key is present
  if (gemini.isConfigured()) {
    try {
      const prompt = `You are a world-class cognitive neuroscientist and staff software engineer.
Design an intense, interactive 120-second "NeuroSprint" learning module for the following engineering lesson.

Topic: ${title}
Context: ${learn || 'N/A'}
Checkpoint: ${check || 'N/A'}

Rules based on neuroscience:
1. TRAP: Must start with a counter-intuitive question with 3 options where intuitive common sense fails and leads to production failure.
2. MONOCHUNKS: Exactly 3 atomic cards. Each card MUST be strictly 35 words or less with 1 punchy anchor formula/rule. Zero fluff.
3. SIMULATION: An interactive sandbox definition with 1 slider and 1 toggle showing causality.
4. PR_REVIEW: A 4-line realistic code snippet where a junior dev makes a subtle mistake related to this concept. The user must spot the flaw.
5. TAKEAWAY: One golden punchline.`;

      const schema = {
        type: 'OBJECT',
        properties: {
          trap: {
            type: 'OBJECT',
            properties: {
              question: { type: 'STRING' },
              options: { type: 'ARRAY', items: { type: 'STRING' } },
              correctIndex: { type: 'INTEGER' },
              shockFact: { type: 'STRING' }
            },
            required: ['question', 'options', 'correctIndex', 'shockFact']
          },
          monochunks: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                text: { type: 'STRING' },
                anchor: { type: 'STRING' }
              },
              required: ['title', 'text', 'anchor']
            }
          },
          simulation: {
            type: 'OBJECT',
            properties: {
              kind: { type: 'STRING' },
              title: { type: 'STRING' },
              description: { type: 'STRING' },
              sliderLabel: { type: 'STRING' },
              min: { type: 'INTEGER' },
              max: { type: 'INTEGER' },
              initial: { type: 'INTEGER' },
              toggleLabel: { type: 'STRING' },
              causality: { type: 'STRING' }
            },
            required: ['kind', 'title', 'description', 'sliderLabel', 'min', 'max', 'initial', 'toggleLabel', 'causality']
          },
          prReview: {
            type: 'OBJECT',
            properties: {
              juniorComment: { type: 'STRING' },
              filename: { type: 'STRING' },
              code: { type: 'STRING' },
              vulnerableLine: { type: 'INTEGER' },
              bugDescription: { type: 'STRING' },
              mitigationChoices: { type: 'ARRAY', items: { type: 'STRING' } },
              correctChoiceIndex: { type: 'INTEGER' },
              explanation: { type: 'STRING' }
            },
            required: ['juniorComment', 'filename', 'code', 'vulnerableLine', 'bugDescription', 'mitigationChoices', 'correctChoiceIndex', 'explanation']
          },
          takeaway: { type: 'STRING' }
        },
        required: ['trap', 'monochunks', 'simulation', 'prReview', 'takeaway']
      };

      const result = await gemini.generate([{ text: prompt }], { schema, thinking: 'low', timeoutMs: 12_000 });
      return { source: 'ai', ...result };
    } catch (e) {
      console.warn('NeuroSprint Gemini fallback triggered:', e.message);
    }
  }

  // 3. Fallback generic neuro-pack synthesized from checkpoint & title
  return {
    source: 'fallback',
    trap: {
      question: `What is the single most common reason engineers fail when applying "${title}" in production?`,
      options: [
        "They implement the standard pattern without accounting for failure modes, edge constraints, or scale limits.",
        "The syntax is too difficult to compile in modern compilers.",
        "They didn't use an external third-party microservice for it."
      ],
      correctIndex: 0,
      shockFact: `90% of architectural incidents occur not from knowing the pattern, but from misjudging the trade-offs under real-world constraints.`
    },
    monochunks: [
      {
        title: "The Problem Space",
        text: learn ? learn.slice(0, 160) + "..." : `Mastering ${title} requires isolating the root friction before choosing a solution.`,
        anchor: "Constraint -> Pattern -> Trade-Off"
      },
      {
        title: "The Core Invariant",
        text: check ? check.slice(0, 160) : "Always identify what cannot change before optimizing what can.",
        anchor: "Invariant = Ground Truth"
      },
      {
        title: "Production Discipline",
        text: build ? build.slice(0, 160) + "..." : "Verify the behavior with tests and clear rollback plans before deploying.",
        anchor: "Test -> Verify -> Ship"
      }
    ],
    simulation: {
      kind: "state",
      title: `${title} Dynamic Sandbox`,
      description: "Experiment with operational load and safeguards to observe system stability.",
      sliderLabel: "System Complexity & Load",
      min: 1,
      max: 100,
      initial: 25,
      toggleLabel: "Enable Architectural Safeguards",
      causality: "When safeguards are disabled and complexity spikes, error rate increases exponentially."
    },
    prReview: {
      juniorComment: `Hey senior! I just finished the implementation for ${title}. Can you do a quick sanity check?`,
      filename: "FeatureImplementation.cs",
      code: `// Implementation for ${title}\npublic void Execute() {\n  var result = RunInternal(); // Line 3: Missing guard and error boundary\n  return result;\n}`,
      vulnerableLine: 3,
      bugDescription: "Unprotected execution without input validation, timeouts, or failure isolation.",
      mitigationChoices: [
        "Wrap the execution in boundary validation, explicit timeout, and appropriate error handling.",
        "Remove the method and inline all logic directly into the controller."
      ],
      correctChoiceIndex: 0,
      explanation: "Senior engineering is about handling failure paths cleanly, not just the happy path."
    },
    takeaway: `True engineering judgement in ${title} is knowing when NOT to apply complexity.`
  };
}

module.exports = { getSprintPack, CURATED_PACKS };
