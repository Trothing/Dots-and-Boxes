export type Level = 'easy' | 'medium' | 'hard';

export type MovePolicy = 'all' | 'forced-captures' | 'safe-first';
export type OrderingMode = 'none' | 'basic' | 'full';
export type EvalKind = 'medium' | 'hard';

export interface SearchSettings {
  movePolicy: MovePolicy;
  ordering: OrderingMode;
  evalKind: EvalKind;
  maxDepth: number;
  timeBudgetMs: number;
  iterative: boolean;
  pruning: boolean;
  useTT: boolean;
  ttBits: number;
  exactLimit: number;
  sacrificeSafeMax: number;
  exactTimeShare: number;
  earlyStopFactor: number;
}

export interface EvalSettings {
  mediumParityBonus: number;
  mediumParityRollout: boolean;
  controlWeightMin: number;
  controlWeightMax: number;
  controlSafeScale: number;
}

export interface AIConfig {
  easy: Record<string, never>;
  medium: SearchSettings;
  hard: SearchSettings;
  eval: EvalSettings;
}

export const AI_CONFIG: AIConfig = {
  easy: {},
  medium: {
    movePolicy: 'safe-first',
    ordering: 'basic',
    evalKind: 'medium',
    maxDepth: 4,
    timeBudgetMs: 400,
    iterative: true,
    pruning: true,
    useTT: false,
    ttBits: 16,
    exactLimit: 0,
    exactTimeShare: 0,
    sacrificeSafeMax: Infinity,
    earlyStopFactor: 0,
  },
  hard: {
    movePolicy: 'forced-captures',
    ordering: 'full',
    evalKind: 'hard',
    maxDepth: 64,
    timeBudgetMs: 1500,
    iterative: true,
    pruning: true,
    useTT: true,
    ttBits: 20,
    exactLimit: 24,
    exactTimeShare: 0.6,
    sacrificeSafeMax: 4,
    earlyStopFactor: 2.5,
  },
  eval: {
    mediumParityBonus: 0.5,
    mediumParityRollout: true,
    controlWeightMin: 0.2,
    controlWeightMax: 1,
    controlSafeScale: 10,
  },
};

export function searchSettings(level: Exclude<Level, 'easy'>, overrides: Partial<SearchSettings> = {}): SearchSettings {
  return { ...AI_CONFIG[level], ...overrides };
}
