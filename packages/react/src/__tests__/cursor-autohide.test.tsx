import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import tailwindcss from '@tailwindcss/postcss'
import { act, fireEvent, screen } from '@testing-library/react'
import postcss from 'postcss'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderTestPlayer } from './test-utils/render-player'

// jsdom does not run Tailwind, so the real stylesheet is compiled here and injected. That lets the
// assertions cover the CSS cascade (which element the pointer hits and which `cursor` wins), the
// part a class-name check cannot see. jsdom ignores rules inside `@layer`, so the layers are unwrapped
// (specificity and source order are unchanged, which is all these assertions rely on).
const unwrapLayers: postcss.Plugin = {
  postcssPlugin: 'unwrap-layers',
  Once(root) {
    root.walkAtRules('layer', (rule) => {
      if (rule.nodes) rule.replaceWith(rule.nodes)
      else rule.remove()
    })
  },
}
const CSS_PATH = resolve(process.cwd(), 'src/player.css') // vitest runs from the package root

let styleEl: HTMLStyleElement

beforeAll(async () => {
  const source = readFileSync(CSS_PATH, 'utf8')
  const { css } = await postcss([tailwindcss(), unwrapLayers]).process(source, { from: CSS_PATH })
  styleEl = document.createElement('style')
  styleEl.textContent = css
  document.head.appendChild(styleEl)
}, 60_000)

afterAll(() => styleEl?.remove())

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const cursorOf = (el: Element) => getComputedStyle(el).cursor

describe('cursor follows the auto-hiding controls', () => {
  it('hides the cursor over the click layer once the controls hide, and shows it again on mouse move', async () => {
    const { engine, container } = renderTestPlayer()
    const root = screen.getByTestId('vplayer-root')

    await act(async () => {
      await engine.play()
    })
    expect(root).not.toHaveClass('vplayer--controls-hidden')
    const clickLayer = () => container.querySelector('.vplayer__click-layer') as HTMLElement
    expect(getComputedStyle(clickLayer()).display).toBe('none')

    await act(async () => {
      vi.advanceTimersByTime(3200)
    })
    expect(root).toHaveClass('vplayer--controls-hidden')
    // The click layer is what the pointer hits while the controls are hidden.
    expect(getComputedStyle(clickLayer()).display).not.toBe('none')
    expect(cursorOf(clickLayer())).toBe('none')
    expect(cursorOf(root)).toBe('none')

    fireEvent.mouseMove(root)
    expect(root).not.toHaveClass('vplayer--controls-hidden')
    expect(cursorOf(root)).not.toBe('none')
    expect(getComputedStyle(clickLayer()).display).toBe('none')
  })

  it('keeps the cursor visible while playback is paused', async () => {
    const { container } = renderTestPlayer()
    const root = screen.getByTestId('vplayer-root')

    await act(async () => {
      vi.advanceTimersByTime(10_000)
    })
    expect(root).not.toHaveClass('vplayer--controls-hidden')
    expect(cursorOf(root)).not.toBe('none')
    expect(cursorOf(container.querySelector('.vplayer__click-layer') as HTMLElement)).not.toBe('none')
  })
})
