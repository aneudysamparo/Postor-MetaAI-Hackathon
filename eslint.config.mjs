// Shared ESLint flat config for every package in the monorepo.
// Encodes the repo readability rules: no `=== true`, no nested ternaries,
// no magic numbers, meaningful code the judges can review.
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Comparison operators and boolean literals that must never be combined,
// e.g. `isReady === true` or `false !== isEnabled`. Name the boolean instead.
const equalityOperators = ['===', '!=='];
const booleanLiterals = ['true', 'false'];
const booleanComparisonSelectors = equalityOperators.flatMap((operator) =>
  booleanLiterals.flatMap((literal) => [
    `BinaryExpression[operator="${operator}"][left.value=${literal}]`,
    `BinaryExpression[operator="${operator}"][right.value=${literal}]`,
  ]),
);

const booleanComparisonRules = booleanComparisonSelectors.map((selector) => ({
  selector,
  message: 'Do not compare against true/false. Name the condition instead, e.g. `if (isReady)`.',
}));

export default [
  { ignores: ['**/dist/', '**/node_modules/', 'storage/'] },
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error',
      'no-restricted-syntax': ['error', ...booleanComparisonRules],
      'no-magic-numbers': [
        'warn',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreNumericLiteralTypes: true,
          enforceConst: true,
          detectObjects: false,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
