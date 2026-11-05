// Flat ESLint config — minimal rules matching existing style.
// Only flags real bugs; ignores legacy patterns already in the tree.
import js from '@eslint/js';

// Inline replacements for eslint-plugin-react helpers (plugin not installed).
// Keep zero-dependency: mark JSX identifiers as used so `no-unused-vars`
// does not false-positive on components, and stub `react-hooks/exhaustive-deps`
// so existing `eslint-disable-line` comments stay valid.
const jsxUsesVarsRule = {
  meta: { type: 'suggestion', docs: { description: 'Mark JSX variables as used' }, schema: [] },
  create(context) {
    const sourceCode = context.sourceCode;
    const mark = (node, refNode) => {
      if (!node) return;
      if (node.type === 'JSXIdentifier') sourceCode.markVariableAsUsed(node.name, refNode || node);
      else if (node.type === 'JSXMemberExpression') mark(node.object, refNode);
      else if (node.type === 'JSXNamespacedName') mark(node.namespace, refNode);
    };
    return {
      JSXOpeningElement(node) { mark(node.name, node); },
      JSXElement(node) { mark(node.openingElement.name, node.openingElement); },
    };
  },
};
const jsxUsesReactRule = {
  meta: { type: 'suggestion', docs: { description: 'Mark React as used when JSX is present' }, schema: [] },
  create(context) {
    const mark = (node) => {
      context.sourceCode.markVariableAsUsed('React', node);
    };
    return {
      JSXElement(node) { mark(node); },
      JSXFragment(node) { mark(node); },
    };
  },
};
const exhaustiveDepsStubRule = {
  meta: { type: 'suggestion', docs: { description: 'Stub for react-hooks/exhaustive-deps (plugin not installed)' }, schema: [] },
  create() { return {}; },
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],

    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        queueMicrotask: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        crypto: 'readonly',
        performance: 'readonly',
        ReadableStream: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'prefer-const': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        getComputedStyle: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        location: 'readonly',
        navigator: 'readonly',
        history: 'readonly',
        fetch: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        JSON: 'readonly',
        Math: 'readonly',
        Set: 'readonly',
        Map: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        matchMedia: 'readonly',
        ResizeObserver: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly',
        performance: 'readonly',
        EventSource: 'readonly',
        CSS: 'readonly',
        getComputedStyle: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        queueMicrotask: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'jsx-uses': { rules: { 'jsx-uses-vars': jsxUsesVarsRule, 'jsx-uses-react': jsxUsesReactRule } },
      'react-hooks': { rules: { 'exhaustive-deps': exhaustiveDepsStubRule } },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_|^e$', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'jsx-uses/jsx-uses-vars': 'error',
      'jsx-uses/jsx-uses-react': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'archive/**', 'evidence/**', 'data/**'],
  },
];
