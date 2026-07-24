import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createSqlJsDriver } from './db/drivers/sqljsDriver'
import { seed } from './db/seed'
import { createGoalsRepo } from './db/repositories/goalsRepo'
import type { SqlDriver } from './db/driver'
import App from './App.vue'
import { router } from './router'

// Screens call store.load() → getDb() on mount; point it at a fresh in-memory driver
// so the smoke tests never touch the real jeep-sqlite/jsdom path.
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as SqlDriver | null } }))
vi.mock('./db', () => ({ getDb: async () => dbRef.current }))

describe('app shell', () => {
  it('mounts and renders the Budget home route', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    })
    // B3 Budget home: month switcher header + recents label are always rendered.
    expect(wrapper.text()).toContain('recent')
    expect(wrapper.find('.month-label').exists()).toBe(true)
  })

  it('opens the A1b month banner from the month chip (E2)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    })
    await router.push('/')
    await flushPromises()

    const chip = wrapper.find('.month-chip')
    expect(chip.attributes('aria-expanded')).toBe('false')
    await chip.trigger('click')
    expect(chip.attributes('aria-expanded')).toBe('true')
    // July 2026: 2 leading blanks + 31 day buttons, padded to 35 cells.
    expect(wrapper.findAll('.banner .cell')).toHaveLength(31)
    expect(wrapper.findAll('.banner .blank')).toHaveLength(4)
  })

  it('has routes for all seven screens', () => {
    const names = router.getRoutes().map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining(['budget', 'savings', 'stats', 'more', 'log', 'lock', 'caps']),
    )
  })

  it('mounts the caps screen (B4)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    })
    await router.push('/caps')
    await flushPromises() // lazy route component import + store.load()
    expect(wrapper.text()).toContain('Budgets ·')
  })

  it('mounts the savings screen with hero + a goal ring (B5)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    await createGoalsRepo(dbRef.current).create({
      id: 'goal-laptop', name: 'Laptop fund', target_amount: 3000000,
      deadline: null, account_id: 'acc-bank', saved_amount: 1140000,
    })
    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    })
    await router.push('/savings')
    await flushPromises() // lazy route component import + store.load()
    expect(wrapper.text()).toContain('total saved')
    expect(wrapper.text()).toContain('Laptop fund')
    expect(wrapper.find('.ring').exists()).toBe(true) // GoalRing rendered
    expect(wrapper.text()).toContain('+ New goal')
  })
})
