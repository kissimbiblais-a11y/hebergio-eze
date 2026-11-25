import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'hosted_sites/**/*', 'node_modules/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
