import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'

describe('app shell', () => {
  it('mounts and renders the Budget home route', async () => {
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
      global: { plugins: [createPinia(), router] },
    })
    expect(wrapper.text()).toContain('Budget')
  })

  it('has routes for all six screens', () => {
    const names = router.getRoutes().map((r) => r.name)
    expect(names).toEqual(
      expect.arrayContaining(['budget', 'savings', 'stats', 'more', 'log', 'lock']),
    )
  })
})
