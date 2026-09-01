/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '**/src/utils/mixamoStreamConverter.test.ts',
    '**/src/world/engine/__tests__/PhysicsEngine.test.ts',
    '**/src/world/engine/__tests__/MJCFHumanoidTemplate.test.ts',
    '**/src/world/engine/__tests__/CollisionAdapter.test.ts',
    '**/src/world/engine/__tests__/ObjectManager.test.ts',
    '**/src/world/engine/__tests__/TuningAndCalibration.test.ts',
    '**/src/world/engine/__tests__/PhysicsIntegration.test.ts',
    '**/src/world/engine/__tests__/multiAgentComposition.test.ts',
    '**/src/world/engine/__tests__/road2Gates.test.ts',
    '**/src/world/engine/__tests__/road3WalkGate.test.ts',
    '**/src/world/engine/__tests__/gaitPhaseMap.test.ts',
    '**/src/world/engine/__tests__/comReflexController.test.ts',
    '**/src/world/engine/__tests__/reflexLeanA.test.ts',
    '**/src/world/engine/__tests__/motorControllerPerStep.test.ts',
    '**/src/world/engine/__tests__/road4ComReflex.test.ts',
    '**/src/world/engine/__tests__/reactionMassController.test.ts',
    '**/src/world/agent/__tests__/identityManager.test.ts',
    '**/src/world/agent/__tests__/PromptAssembler.test.ts',
    '**/src/world/agent/__tests__/motorCodex.test.ts',
    '**/src/utils/__tests__/hdf5Writer.test.ts'
  ],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: { module: 'esnext', moduleResolution: 'bundler', esModuleInterop: true, skipLibCheck: true, checkJs: false, allowJs: true, target: 'ES2022', lib: ['ES2022', 'DOM'], types: ['node', 'jest'] } }],
    '^.+\\.m?js$': ['ts-jest', { useESM: true, tsconfig: { module: 'esnext', moduleResolution: 'bundler', esModuleInterop: true, skipLibCheck: true, checkJs: false, allowJs: true, target: 'ES2022', lib: ['ES2022', 'DOM'], types: ['node', 'jest'] } }],
  },
  transformIgnorePatterns: [
    // Transpile ESM deps so jest executes them as modules:
    //  - three/examples/jsm loaders (GLTFLoader.js etc.)
    //  - @mujoco/mujoco WASM glue (mujoco.js uses import.meta)
    'node_modules/(?!(three|@mujoco)/)',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
