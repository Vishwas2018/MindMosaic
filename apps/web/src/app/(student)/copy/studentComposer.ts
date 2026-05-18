// Microcopy for student composer screens — /practice + /exam-sim (v1.1-S5).
// ADR-0039 + UI_CONTRACT §13.8 (all user-facing strings from copy.ts).
// §N Trap 2: page title says "Practice Exam" but API sends mode='exam'. Do not change.

export const STUDENT_COMPOSER_COPY = {
  practice: {
    pageTitle: 'Practice Exam',
    pageDescription: 'Compose an exam from a question bank pathway.',
    submitBtn: 'Start Practice Exam',
    submittingBtn: 'Starting…',
  },
  examSim: {
    pageTitle: 'Simulation Exam',
    pageDescription: 'Exam conditions: no back navigation, answers revealed at submit.',
    submitBtn: 'Start Simulation Exam',
    submittingBtn: 'Starting…',
  },
  simulationBannerText: 'Simulation exam — no back navigation, answers revealed at submit',
  form: {
    bankPickSection: 'Bank',
    pathwayLabel: 'Pathway',
    pathwayPlaceholder: 'Select a pathway',
    pathwayRequired: 'Please select a pathway',
    configureSection: 'Configure',
    itemCountLabel: 'Number of items',
    itemCountHint: '5–80',
    difficultySection: 'Difficulty distribution',
    easyLabel: 'Easy',
    midLabel: 'Mid',
    hardLabel: 'Hard',
    difficultyHint: 'Counts must sum to number of items',
    diffSumError: (target: number) => `Easy + Mid + Hard must sum to ${target}`,
    timeLimitLabel: 'Time limit',
    simulationToggleLabel: 'Simulation mode',
    simulationToggleHint: 'No back navigation — answers revealed at submit',
    assignSection: 'Start',
    submitError: 'Failed to start session. Please try again.',
  },
  states: {
    loadingPathways: 'Loading pathways…',
    emptyPathwaysHeading: 'No pathways available',
    emptyPathwaysDescription: 'Contact your teacher to get access to a question bank.',
    errorHeading: 'Failed to load pathways',
    errorRetry: 'Try again',
    upgradeHeading: 'Upgrade required',
    upgradeDescription: 'This feature requires a higher plan.',
    upgradeCta: 'Upgrade',
  },
  nav: {
    practice: 'Practice',
    examSim: 'Simulation',
  },
} as const

export type StudentComposerCopy = typeof STUDENT_COMPOSER_COPY
