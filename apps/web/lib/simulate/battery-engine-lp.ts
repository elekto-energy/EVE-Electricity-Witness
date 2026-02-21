/**
 * battery-engine-lp.ts — Optimal battery dispatch via Linear Programming
 *
 * Solves the full cost-minimization problem:
 *
 *   min  Σ spot[t] × grid[t]  +  effectRate × peak
 *
 *   s.t. grid[t] = load[t] + charge[t] - discharge[t]        ∀t
 *        soc[t+1] = soc[t] + charge[t]×η - discharge[t]/η    ∀t
 *        0 ≤ soc[t] ≤ capacity                                ∀t
 *        0 ≤ charge[t] ≤ maxKw × dt                           ∀t
 *        0 ≤ discharge[t] ≤ maxKw × dt                        ∀t
 *        grid[t] ≥ 0                                           ∀t
 *        peak ≥ grid[t] / dt                                   ∀t
 *        soc[N] = soc[0]                   (cycle constraint)
 *
 * This is a pure LP (no integer variables). Solved with glpk.js.
 *
 * Variables per interval: charge, discharge, soc, grid = 4
 * Plus 1 global peak variable
 * Total: 4N + 1 variables, ~5N constraints
 *
 * PT15M month (2976 intervals): ~11,905 vars, ~14,881 constraints → <2s
 * PT60M year (8760 intervals):  ~35,041 vars, ~43,801 constraints → ~5-10s
 */

// glpk.js is a factory function that returns a promise
import GLPK_FACTORY from "glpk.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BatteryLPInput {
  /** Spot prices per interval, in SEK/kWh (NOT öre) */
  prices: number[];
  /** Load per interval, in kWh */
  load: number[];
  /** Battery capacity in kWh */
  capacityKwh: number;
  /** Max charge/discharge power in kW */
  maxKw: number;
  /** Round-trip efficiency, e.g. 0.90 */
  efficiency: number;
  /** Duration of each interval in hours (0.25 for PT15M, 1.0 for PT60M) */
  intervalHours: number;
  /** Effect rate in SEK per kW per month (used in objective) */
  effectRateKrPerKw: number;
}

export interface BatteryLPResult {
  /** Optimized grid import per interval, kWh */
  adjustedLoad: number[];
  /** Charge per interval, kWh */
  charge: number[];
  /** Discharge per interval, kWh */
  discharge: number[];
  /** SoC per interval, kWh */
  soc: number[];
  /** Peak grid power after optimization, kW */
  peakKwAfter: number;
  /** Peak grid power before optimization (from raw load), kW */
  peakKwBefore: number;
  /** Total grid import after optimization, kWh */
  totalGridKwh: number;
  /** Solver status */
  status: "optimal" | "infeasible" | "error";
  /** Solve time in ms */
  solveTimeMs: number;
  /** Number of LP variables */
  numVars: number;
  /** Number of LP constraints */
  numConstraints: number;
}

// ─── Solver ───────────────────────────────────────────────────────────────────

export async function optimizeBatteryLP(input: BatteryLPInput): Promise<BatteryLPResult> {
  const t0 = Date.now();

  const { prices, load, capacityKwh, maxKw, efficiency, intervalHours, effectRateKrPerKw } = input;
  const n = prices.length;
  const η = efficiency;
  const dt = intervalHours;
  const maxEnergy = maxKw * dt; // max kWh per interval

  // Validate inputs
  if (n === 0) throw new Error("Empty price/load arrays");
  if (load.length !== n) throw new Error(`Price/load length mismatch: ${n} vs ${load.length}`);
  if (capacityKwh <= 0) throw new Error("Battery capacity must be > 0");
  if (maxKw <= 0) throw new Error("Max power must be > 0");
  if (η <= 0 || η > 1) throw new Error("Efficiency must be in (0, 1]");

  // Pre-optimization peak (for comparison)
  const peakKwBefore = Math.max(...load.map(l => l / dt));

  // Initialize GLPK
  const glpk = await GLPK_FACTORY();

  // We use N+1 SoC variables: soc_0 through soc_N
  // soc_t represents state BEFORE interval t actions
  // soc_N represents state AFTER last interval

  const objective: { name: string; direction: number; vars: Array<{ name: string; coef: number }> } = {
    name: "total_cost",
    direction: glpk.GLP_MIN,
    vars: [],
  };

  const subjectTo: Array<{
    name: string;
    vars: Array<{ name: string; coef: number }>;
    bnds: { type: number; lb: number; ub: number };
  }> = [];

  const bounds: Array<{
    name: string;
    type: number;
    lb: number;
    ub: number;
  }> = [];

  // ─── Objective: min Σ spot[t] × grid[t] + effectRate × peak ───────────

  for (let t = 0; t < n; t++) {
    objective.vars.push({ name: `grid_${t}`, coef: prices[t] });
  }
  objective.vars.push({ name: "peak", coef: effectRateKrPerKw });

  // ─── Constraints ──────────────────────────────────────────────────────

  for (let t = 0; t < n; t++) {

    // Grid balance: grid[t] = load[t] + charge[t] - discharge[t]
    // Rewritten: grid[t] - charge[t] + discharge[t] = load[t]
    subjectTo.push({
      name: `grid_bal_${t}`,
      vars: [
        { name: `grid_${t}`, coef: 1 },
        { name: `charge_${t}`, coef: -1 },
        { name: `discharge_${t}`, coef: 1 },
      ],
      bnds: { type: glpk.GLP_FX, lb: load[t], ub: load[t] },
    });

    // Peak: peak ≥ grid[t] / dt
    // Rewritten: peak - grid[t]/dt ≥ 0
    subjectTo.push({
      name: `peak_${t}`,
      vars: [
        { name: "peak", coef: 1 },
        { name: `grid_${t}`, coef: -1 / dt },
      ],
      bnds: { type: glpk.GLP_LO, lb: 0, ub: 0 },
    });
  }

  // SoC dynamics: soc[t+1] = soc[t] + charge[t]×η - discharge[t]/η
  // Rewritten: soc[t+1] - soc[t] - charge[t]×η + discharge[t]/η = 0
  for (let t = 0; t < n; t++) {
    subjectTo.push({
      name: `soc_dyn_${t}`,
      vars: [
        { name: `soc_${t + 1}`, coef: 1 },
        { name: `soc_${t}`, coef: -1 },
        { name: `charge_${t}`, coef: -η },
        { name: `discharge_${t}`, coef: 1 / η },
      ],
      bnds: { type: glpk.GLP_FX, lb: 0, ub: 0 },
    });
  }

  // Cycle constraint: soc[0] = soc[N]
  subjectTo.push({
    name: "soc_cycle",
    vars: [
      { name: "soc_0", coef: 1 },
      { name: `soc_${n}`, coef: -1 },
    ],
    bnds: { type: glpk.GLP_FX, lb: 0, ub: 0 },
  });

  // ─── Bounds ───────────────────────────────────────────────────────────

  for (let t = 0; t < n; t++) {
    bounds.push({ name: `charge_${t}`, type: glpk.GLP_DB, lb: 0, ub: maxEnergy });
    bounds.push({ name: `discharge_${t}`, type: glpk.GLP_DB, lb: 0, ub: maxEnergy });
    bounds.push({ name: `grid_${t}`, type: glpk.GLP_LO, lb: 0, ub: 0 }); // ≥ 0, no upper
  }

  // N+1 SoC variables (soc_0 through soc_N)
  for (let t = 0; t <= n; t++) {
    bounds.push({ name: `soc_${t}`, type: glpk.GLP_DB, lb: 0, ub: capacityKwh });
  }

  bounds.push({ name: "peak", type: glpk.GLP_LO, lb: 0, ub: 0 }); // ≥ 0, no upper

  // ─── Solve ────────────────────────────────────────────────────────────

  const lp = {
    name: "battery_dispatch",
    objective,
    subjectTo,
    bounds,
  };

  const numVars = 4 * n + (n + 1) + 1; // grid, charge, discharge, soc × (N+1), peak
  const numConstraints = subjectTo.length;

  let result;
  try {
    result = await glpk.solve(lp, { msglev: glpk.GLP_MSG_OFF });
  } catch (e: any) {
    return {
      adjustedLoad: [...load],
      charge: new Array(n).fill(0),
      discharge: new Array(n).fill(0),
      soc: new Array(n).fill(0),
      peakKwAfter: peakKwBefore,
      peakKwBefore,
      totalGridKwh: load.reduce((s, v) => s + v, 0),
      status: "error",
      solveTimeMs: Date.now() - t0,
      numVars,
      numConstraints,
    };
  }

  const solveTimeMs = Date.now() - t0;

  // Check status
  if (result.result.status !== glpk.GLP_OPT) {
    return {
      adjustedLoad: [...load],
      charge: new Array(n).fill(0),
      discharge: new Array(n).fill(0),
      soc: new Array(n).fill(0),
      peakKwAfter: peakKwBefore,
      peakKwBefore,
      totalGridKwh: load.reduce((s, v) => s + v, 0),
      status: "infeasible",
      solveTimeMs,
      numVars,
      numConstraints,
    };
  }

  // ─── Extract results ──────────────────────────────────────────────────

  const vars = result.result.vars;
  const adjustedLoad = new Array<number>(n);
  const charge = new Array<number>(n);
  const discharge = new Array<number>(n);
  const soc = new Array<number>(n);

  for (let t = 0; t < n; t++) {
    adjustedLoad[t] = vars[`grid_${t}`] ?? load[t];
    charge[t] = vars[`charge_${t}`] ?? 0;
    discharge[t] = vars[`discharge_${t}`] ?? 0;
    soc[t] = vars[`soc_${t}`] ?? 0;
  }

  const peakKwAfter = vars["peak"] ?? peakKwBefore;
  const totalGridKwh = adjustedLoad.reduce((s, v) => s + v, 0);

  return {
    adjustedLoad,
    charge,
    discharge,
    soc,
    peakKwAfter,
    peakKwBefore,
    totalGridKwh,
    status: "optimal",
    solveTimeMs,
    numVars,
    numConstraints,
  };
}
