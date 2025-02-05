import { browserConfig, setDirectoryConfigs, testingConfig } from 'eslint-config-brightspace';
import { fileURLToPath } from 'node:url';
import { includeIgnoreFile } from '@eslint/compat';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default [
	includeIgnoreFile(path.resolve(__dirname, '.gitignore')),
	...setDirectoryConfigs(
		browserConfig,
		{
			'**/test': testingConfig
		}
	)
];
