import { createRouter, createWebHashHistory } from 'vue-router'

// Hash history: safe inside Capacitor's WebView (no server-side routing).
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'budget', component: () => import('../screens/BudgetScreen.vue') },
    { path: '/savings', name: 'savings', component: () => import('../screens/SavingsScreen.vue') },
    { path: '/growth', name: 'growth', component: () => import('../screens/GrowthScreen.vue') },
    { path: '/stats', name: 'stats', component: () => import('../screens/StatisticsScreen.vue') },
    { path: '/more', name: 'more', component: () => import('../screens/MoreScreen.vue') },
    { path: '/caps', name: 'caps', component: () => import('../screens/CapsScreen.vue') },
    { path: '/card', name: 'card', component: () => import('../screens/CreditCardScreen.vue') },
    { path: '/items', name: 'items', component: () => import('../screens/SavedItemsScreen.vue') },
    { path: '/discounts', name: 'discounts', component: () => import('../screens/DiscountsScreen.vue') },
    { path: '/log', name: 'log', component: () => import('../screens/LogSheetScreen.vue') },
    { path: '/lock', name: 'lock', component: () => import('../screens/LockScreen.vue') },
  ],
})
