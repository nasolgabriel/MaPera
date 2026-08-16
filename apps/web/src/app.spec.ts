import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createSqlJsDriver } from './db/drivers/sqljsDriver'
import { seed } from './db/seed'
import { createAccountsRepo } from './db/repositories/accountsRepo'
import { createGoalsRepo } from './db/repositories/goalsRepo'
import { createInvestmentValuesRepo } from './db/repositories/investmentValuesRepo'
import { createRecurringRepo } from './db/repositories/recurringRepo'
import { createTransactionsRepo } from './db/repositories/transactionsRepo'
import type { SqlDriver } from './db/driver'
import App from './App.vue'
import { router } from './router'
import { pinSeedClock } from './test/seedClock'

// Screens call store.load() → getDb() on mount; point it at a fresh in-memory driver
// so the smoke tests never touch the real jeep-sqlite/jsdom path.
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: null as SqlDriver | null } }))
vi.mock('./db', () => ({ getDb: async () => dbRef.current }))

describe('app shell', () => {
  pinSeedClock()

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

  it('has routes for all eight screens', () => {
    const names = router.getRoutes().map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining(['budget', 'savings', 'stats', 'more', 'log', 'lock', 'caps', 'card']),
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

  it('renders investment returns + a log-value control on the savings screen (B8)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    await createAccountsRepo(dbRef.current).create({
      id: 'acc-mp2', name: 'MP2 Pag-IBIG', type: 'investment', starting_balance: 1200000, essence_color: '#7A3FD0',
      archived: false, credit_limit: null, statement_day: null, due_day: null, points_rate: null,
    })
    await createInvestmentValuesRepo(dbRef.current).create({ id: 'iv-07', account_id: 'acc-mp2', month: '2026-07', value: 1320000 })

    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/savings')
    await flushPromises() // lazy route component import + store.load()

    expect(wrapper.text()).toContain('MP2 Pag-IBIG')
    const invest = wrapper.find('.invest')
    expect(invest.exists()).toBe(true)
    expect(invest.text()).toContain('market') // §8.3 returns strip rendered
    const logBtn = wrapper.find('.log-value')
    expect(logBtn.exists()).toBe(true)
    expect(logBtn.text()).toContain('update value') // a value is already logged
  })

  // Assumes "now" is the seed month (July 2026), like the tests above.
  it('renders the credit-card health screen with the three §7.8 checks (B9)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    await createAccountsRepo(dbRef.current).create({
      id: 'acc-rcbc', name: 'RCBC Flex', type: 'credit_card', starting_balance: 0, essence_color: '#B3282D',
      archived: false, credit_limit: 3000000, statement_day: 15, due_day: 5, points_rate: 2500,
    })
    const txns = createTransactionsRepo(dbRef.current)
    const row = (id: string, amount: number, date: string) => ({
      id, amount, kind: 'expense' as const, account_id: 'acc-rcbc', to_account_id: null,
      category_id: null, date, note: null,
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    })
    await txns.create(row('txn-card-jun-1', 489000, '2026-06-10'))
    await txns.create(row('txn-card-jun-2', 120000, '2026-06-24'))
    await txns.create(row('txn-card-jul-1', 420000, '2026-07-08'))
    await txns.create({
      id: 'txn-card-pay', amount: 489000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-rcbc',
      category_id: null, date: '2026-07-05', note: 'June statement',
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    })

    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/card')
    await flushPromises() // lazy route component import + store.load()

    const panel = wrapper.find('.card-health')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('RCBC Flex')
    expect(panel.text()).toContain('5,400') // owed
    expect(panel.text()).toContain('18%') // utilization of the ₱30,000 limit
    expect(panel.text()).toContain('21%') // card spend vs the ₱20,000 seed income
    expect(panel.text()).toContain('168 pts') // floor(₱4,200 / ₱25)
    expect(panel.text()).toContain('June statement paid in full')
    expect(panel.text()).toContain('CARD HEALTHY')
    expect(panel.classes()).not.toContain('unhealthy')
  })

  it('opens card health from the Budget-home card chip, tinted when a check is red (B9)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    await createAccountsRepo(dbRef.current).create({
      id: 'acc-rcbc', name: 'RCBC Flex', type: 'credit_card', starting_balance: 0, essence_color: '#B3282D',
      archived: false, credit_limit: 3000000, statement_day: 15, due_day: 5, points_rate: 2500,
    })
    // A June statement left unpaid → paid_in_full is red, so the chip tints (§7.8).
    await createTransactionsRepo(dbRef.current).create({
      id: 'txn-card-jun-1', amount: 489000, kind: 'expense', account_id: 'acc-rcbc', to_account_id: null,
      category_id: null, date: '2026-06-10', note: null,
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    })

    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/')
    await flushPromises()

    const chip = wrapper.find('[aria-label="RCBC Flex card health"]')
    expect(chip.exists()).toBe(true)
    expect(chip.classes()).toContain('alert')

    await chip.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('card')
    expect(wrapper.text()).toContain('not cleared')
  })

  // Like the month-banner test above, this assumes "now" is the seed month (July 2026).
  it('renders the monthly dues card and opens the breakdown sheet (B6)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const rec = createRecurringRepo(dbRef.current)
    const tmpl = (o: Record<string, unknown>) =>
      JSON.stringify({ to_account_id: null, category_id: null, note: null, total_payments: null, interval_months: null, ...o })
    await rec.create({ id: 'rec-netflix', template: tmpl({ amount: 54900, kind: 'expense', account_id: 'acc-bank', note: 'Netflix' }), kind: 'subscription', frequency: 'monthly', next_due: '2026-07-15', auto_post: false, remaining_payments: null })
    await rec.create({ id: 'rec-spotify', template: tmpl({ amount: 14900, kind: 'expense', account_id: 'acc-bank', note: 'Spotify' }), kind: 'subscription', frequency: 'monthly', next_due: '2026-07-20', auto_post: false, remaining_payments: null })
    await rec.create({ id: 'rec-loan', template: tmpl({ amount: 230000, kind: 'expense', account_id: 'acc-bank', note: 'Gadget loan', total_payments: 24 }), kind: 'loan', frequency: 'monthly', next_due: '2026-07-30', auto_post: false, remaining_payments: 10 })
    await rec.create({ id: 'rec-google', template: tmpl({ amount: 97900, kind: 'expense', account_id: 'acc-bank', note: 'Google One', interval_months: 12 }), kind: 'bill', frequency: 'custom', next_due: '2026-08-10', auto_post: false, remaining_payments: null })

    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/')
    await flushPromises()

    const card = wrapper.find('.dues-card')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('Dues this month')
    expect(card.text()).toContain('2,998') // 549 + 149 + 2,300
    expect(card.text()).toContain('0 of 3 paid') // Google One is August

    await card.trigger('click')
    await flushPromises()
    const sheet = wrapper.find('[aria-label="Monthly dues"]')
    expect(sheet.exists()).toBe(true)
    expect(sheet.text()).toContain('14 of 24') // loan progress
    expect(sheet.text()).toContain('Google One lands in August') // next-month diff note
  })

  // Assumes "now" is the seed month (July 2026), like the dues/banner tests above.
  it('renders the statistics tabs and charts, and switches tab (B7)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/stats')
    await flushPromises() // lazy route component import + store.load()

    // Savings tab is first (§6.4): its saved-over-time line + rate card render.
    expect(wrapper.text()).toContain('Statistics')
    expect(wrapper.find('.line-chart').exists()).toBe(true) // savings trend line
    expect(wrapper.text()).toContain('Total saved')
    expect(wrapper.text()).toContain('Savings rate')

    // E3: the savings line is a keyboard slider — Arrow selects a month and shows a tooltip.
    const linePlot = wrapper.find('.line-chart .plot')
    expect(linePlot.attributes('role')).toBe('slider')
    await linePlot.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('.line-chart .tooltip').exists()).toBe(true)
    expect(wrapper.find('.line-chart .tooltip').text()).toContain('2026')

    // Segmented tabs switch the panel to the Net (free cash flow) view.
    const netTab = wrapper.findAll('.tab').find((b) => b.text() === 'Net')!
    await netTab.trigger('click')
    expect(wrapper.text()).toContain('Free cash flow')
    expect(wrapper.find('.month-bars').exists()).toBe(true)
  })
})
