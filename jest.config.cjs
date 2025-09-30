/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.{ts,js}'],
  coverageDirectory: 'coverage',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  verbose: true,
  transformIgnorePatterns: [
    'node_modules/(?!(p-limit|yocto-queue|unified|remark.*|vfile.*|mdast-util.*|micromark.*|unist-util.*|zwitch|longest-streak|decode-named-character-reference|character-entities|escape-string-regexp|devlop|bail|trough|is-plain-obj|textr|typograf)/)'
  ]
};
