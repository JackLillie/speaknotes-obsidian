import { dirname } from "path";
import { fileURLToPath } from "url";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: __dirname,
				project: "./tsconfig.json",
			},
		},
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
			"@typescript-eslint/no-explicit-any": "error",
		},
	},
	{
		ignores: ["node_modules/**", "main.js", "*.mjs"],
	}
);
