import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default [
	includeIgnoreFile(path.resolve(__dirname, '.gitignore')),
	...compat.extends('brightspace/browser-config'),
	...compat.extends('brightspace/testing-config').map(config => ({
		...config,
		files: ['**/test/**/*'],
	})),
];
