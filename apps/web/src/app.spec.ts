import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createSqlJsDriver } from './db/drivers/sqljsDriver'
import { seed } from './db/seed'
import { createAccountsRepo } from './db/repositories/accountsRepo'
import { createGoalsRepo } from './db/repositories/goalsRepo'
import { createInvestmentValuesRepo } from './db/repositories/investmentValuesRepo'
import { createRecurringRepo } from './db/repositories/recurringRepo'
import { createSavedItemsRepo } from './db/repositories/savedItemsRepo'
import { createDiscountLogsRepo } from './db/repositories/discountLogsRepo'
import { createBudgetsRepo } from './db/repositories/budgetsRepo'
import { createSweepsRepo } from './db/repositories/sweepsRepo'
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

  it('has routes for all eleven screens', () => {
    const names = router.getRoutes().map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'budget', 'savings', 'stats', 'more', 'log', 'lock', 'caps', 'card', 'items', 'discounts', 'growth',
      ]),
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

  it('suggests a saved item while typing, autofills it, and counts the use (B10)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/log')
    await flushPromises()

    await wrapper.find('.note').setValue('Lig')
    await flushPromises()
    const suggestions = wrapper.findAll('.suggestion')
    expect(suggestions).toHaveLength(2)
    expect(suggestions[0]!.text()).toContain('Ligo Sardines')
    expect(suggestions[0]!.text()).toContain('used 23×')
    expect(suggestions[1]!.text()).toContain('Ligaya Bakery pandesal')

    await suggestions[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.amount-display').text()).toContain('26.00')
    expect(wrapper.findAll('.suggestion')).toHaveLength(0)
    expect((wrapper.find('.note').element as HTMLInputElement).value).toBe('Ligo Sardines')

    await wrapper.find('.save').trigger('click')
    await flushPromises()
    const item = await createSavedItemsRepo(dbRef.current).getById('si-sardines')
    expect(item).toMatchObject({ use_count: 24, last_price: 2600, last_used_at: '2026-07-14' })
    const logged = (await createTransactionsRepo(dbRef.current).list()).find((t) => t.note === 'Ligo Sardines')
    expect(logged!.saved_item_id).toBe('si-sardines')
    expect(logged!.category_id).toBe('cat-food')
  })

  it('saves a fresh log as a library item when the toggle is on (B10)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/log')
    await flushPromises()

    await wrapper.find('.note').setValue('Kopiko 3-in-1')
    await flushPromises()
    expect(wrapper.findAll('.suggestion')).toHaveLength(0)
    await wrapper.findAll('.key').find((k) => k.text() === '9')!.trigger('click')
    await wrapper.findAll('.key').find((k) => k.text() === '00')!.trigger('click')
    await wrapper.find('.as-item-box').setValue(true)
    await wrapper.find('.save').trigger('click')
    await flushPromises()

    const items = await createSavedItemsRepo(dbRef.current).list()
    const created = items.find((i) => i.name === 'Kopiko 3-in-1')!
    expect(created).toMatchObject({ usual_price: 900, use_count: 1, last_price: 900 })
  })

  it('mounts the saved-items library from More (B10)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/more')
    await flushPromises()
    expect(wrapper.text()).toContain('Saved items')

    await router.push('/items')
    await flushPromises()
    expect(wrapper.findAll('.item')).toHaveLength(3)
    expect(wrapper.text()).toContain('Ligo Sardines')
    expect(wrapper.text()).toContain('155g easy-open')
    expect(wrapper.text()).toContain('used 23×')

    await wrapper.findAll('.item')[0]!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.sheet[aria-label="Edit saved item"]').exists()).toBe(true)
  })

  it('discounts a fare, logs it, and counts the yearly saving (B11)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/more')
    await flushPromises()
    expect(wrapper.text()).toContain('Fare discounts')

    await router.push('/discounts')
    await flushPromises()
    expect(wrapper.findAll('.role')).toHaveLength(3)
    expect(wrapper.findAll('.mode')).toHaveLength(2)

    await wrapper.find('.base-input').setValue('15')
    await flushPromises()
    const card = wrapper.find('.result')
    expect(card.find('.rule-line').text()).toBe('student fare · 20% off · rounds to ₱0.25')
    expect(card.find('.discounted').text()).toContain('12.00')
    expect(card.find('.kept').text()).toContain('3.00')

    await wrapper.find('.log-btn').trigger('click')
    await flushPromises()

    const logged = (await createTransactionsRepo(dbRef.current).list()).find(
      (t) => t.discount_rule_id === 'fare-jeepney-student',
    )
    expect(logged!.amount).toBe(1200)
    expect(logged!.kind).toBe('expense')
    const logs = await createDiscountLogsRepo(dbRef.current).list()
    expect(logs[0]!.base_amount).toBe(1500)
    expect(wrapper.find('.yearly').text()).toBe('saved ₱ 3 with discounts this year')
  })

  it('switches role and mode to a different rule (B11)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/discounts')
    await flushPromises()

    await wrapper.findAll('.role').find((b) => b.text() === 'Senior')!.trigger('click')
    await wrapper.findAll('.mode').find((b) => b.text() === 'Bus / Train')!.trigger('click')
    await wrapper.find('.base-input').setValue('13')
    await flushPromises()

    expect(wrapper.find('.rule-line').text()).toContain('senior fare')
    expect(wrapper.find('.discounted').text()).toContain('10.50')
    expect(wrapper.find('.kept').text()).toContain('2.50')
  })

  it('opens Growth from the Savings hero and shows streak, level, milestones (B12)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    // Two consecutive saving weeks: W28 and W29 (seed clock = Tue 2026-07-14).
    for (const [id, date] of [['c-w28', '2026-07-07'], ['c-w29', '2026-07-13']] as const) {
      await createTransactionsRepo(dbRef.current).create({
        id, amount: 100000, kind: 'transfer', account_id: 'acc-cash', to_account_id: 'acc-bank',
        category_id: null, date, note: null,
        discount_rule_id: null, recurring_id: null, saved_item_id: null,
      })
    }
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/savings')
    await flushPromises()

    expect(wrapper.text()).toContain('2-week streak')
    await wrapper.find('.hero-growth').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('growth'))
    await flushPromises()

    expect(wrapper.text()).toContain('Saving streak')
    expect(wrapper.text()).toContain('2 weeks')
    expect(wrapper.findAll('.bars .bar')).toHaveLength(2)
    expect(wrapper.text()).toContain('a week counts when you add to savings')
    expect(wrapper.text()).toContain('Milestones')
  })

  it('sweeps last month’s leftover into savings and marks the week ×2 (B12)', async () => {
    dbRef.current = await createSqlJsDriver()
    await seed(dbRef.current)
    await createBudgetsRepo(dbRef.current).create({
      id: 'bud-food-jun', category_id: 'cat-food', month: '2026-06', cap_amount: 1000000,
    })
    await createTransactionsRepo(dbRef.current).create({
      id: 'txn-jun-food', amount: 880000, kind: 'expense', account_id: 'acc-bank', to_account_id: null,
      category_id: 'cat-food', date: '2026-06-10', note: null,
      discount_rule_id: null, recurring_id: null, saved_item_id: null,
    })
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    await router.push('/growth')
    await flushPromises()

    expect(wrapper.text()).toContain('June ended ₱1,200 under budget.')
    await wrapper.find('.sweep-btn').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('counts ×2 toward your streak')

    await wrapper.find('.sweep').trigger('click')
    await flushPromises()

    expect(await createSweepsRepo(dbRef.current).list()).toMatchObject([{ month: '2026-06' }])
    expect(wrapper.find('.sweep-card').exists()).toBe(false)
    expect(wrapper.text()).toContain('2 weeks')
    expect(wrapper.find('.bar.swept').exists()).toBe(true)
  })
})
