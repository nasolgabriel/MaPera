import { createApp } from 'vue'
import { createPinia } from 'pinia'

// §5 typography: Libre Franklin (UI) 400–800, Spline Sans Mono (numbers) 400/500.
// Bundled locally (offline-first, §3) — never loaded from a CDN.
import '@fontsource/libre-franklin/400.css'
import '@fontsource/libre-franklin/500.css'
import '@fontsource/libre-franklin/600.css'
import '@fontsource/libre-franklin/700.css'
import '@fontsource/libre-franklin/800.css'
import '@fontsource/spline-sans-mono/400.css'
import '@fontsource/spline-sans-mono/500.css'

import './theme/base.css'
import { applyTheme } from './theme/tokens'
import { router } from './router'
import App from './App.vue'

// Theme setting (light/dark/system toggle) lands in C2; light is the default until then.
applyTheme('light')

// Mount the UI immediately. SQLite initializes lazily via getDb() the first time a
// screen needs it (see db/index.ts) — the database must NEVER block or blank the app.
createApp(App).use(createPinia()).use(router).mount('#app')
