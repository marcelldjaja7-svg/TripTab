import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'TripTab'

export default defineConfig({
  // Relative assets for local/LAN; absolute repo path on GitHub Pages so ?t= invite links resolve.
  base: process.env.GITHUB_PAGES ? `/${repoName}/` : './',
  plugins: [react(), tailwindcss()],
  server: { host: true },
  preview: { host: true },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
