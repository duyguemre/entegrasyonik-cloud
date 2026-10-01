/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  // tsconfig module=node16 (TS6-01): ts-jest hibrit modül uyarısını (151002) bastır; tip denetimi açık kalır, emit CJS.
  transform: { '^.+\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [151002] } }] },
  testEnvironment: 'node',
  // Yük altında (paralel worker + ts-jest soğuk derleme: testler içinde lazy require/isolateModules) 5 sn varsayılan kırılgan;
  // zaman aşımı yalnızca takılı testi yakalamak içindir, hız ölçüsü değildir.
  testTimeout: 20000,
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  // Gerçek MongoDB isteyen entegrasyon testleri (tests/integration) `npm test`/`verify`/CI'da ÇALIŞMAZ;
  // yerel Mongo ile `npm run test:integration` (CLI --testPathIgnorePatterns bu listeyi ezer).
  testPathIgnorePatterns: ['[\\/]node_modules[\\/]', '[\\/]tests[\\/]integration[\\/]'],
  // ADR-0001: test-only JWT_SECRET/JWT_ISSUER (rastgele; gerçek .env değerine bağımlı değil)
  setupFiles: ['<rootDir>/tests/setup/jwt-env.js'],
  // tsconfig.json "paths" ile birebir eşleşmeli (bkz. backend/tsconfig.json)
  moduleNameMapper: {
    '^@interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@operations/(.*)$': '<rootDir>/src/operations/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1',
    '^@integration/(.*)$': '<rootDir>/src/integration/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@health/(.*)$': '<rootDir>/src/health/$1',
    '^@bootstrap/(.*)$': '<rootDir>/src/bootstrap/$1',
    '^@config$': '<rootDir>/src/config',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
    '^@platform/(.*)$': '<rootDir>/src/platform/$1',
    // tsconfig.json baseUrl "./" ile bazı dosyalar (ör. product-service.ts) bare 'src/...' importu kullanır
    // (tsc --build baseUrl'e göre bunu göreli yola çevirir; ts-jest'in izole derlemesi çevirmez) — jest için eşle.
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  // Kapsam MANDALI (B-R4): yalnızca `jest --coverage` (npm run test:cov / verify / CI) ile uygulanır.
  // Değerler 2026-09-28 ölçümünün (faz3-arayuz + B-R0; 146 suite/2412 test) alt sınırıdır: AŞAĞI çekilemez, yalnızca yukarı.
  // (Faz 0 denetim tabanı satır %54,2 / dal %35,2 idi; taban o günden bu yana yeni testlerle yükseldi.)
  coverageThreshold: {
    global: { statements: 64.0, branches: 49.6, functions: 54.8, lines: 64.5 },
  },
};
