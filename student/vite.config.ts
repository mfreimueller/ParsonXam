import process from 'node:process';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves this app under /parsonxam, so builds get BASE_PATH=/parsonxam.
const base = (process.argv.includes('dev') ? '' : (process.env.BASE_PATH ?? '')) as '' | `/${string}`;

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Pages answers unknown paths with 404.html, which is how deep links reach the app.
			adapter: adapter({ fallback: '404.html' }),
			paths: { base }
		})
	],
	server: {
		port: 5173,
		proxy: { '/api': 'http://localhost:3000' }
	}
});
