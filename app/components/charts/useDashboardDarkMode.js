'use client'

/**
 * useDashboardDarkMode — subscribe al mismo flag que el shell del dashboard.
 * Fuente de verdad: app/dashboard/layout.js:27-32 (localStorage 'dashboard_dark_mode').
 * Se dispara el evento 'dashboard_dark_mode:changed' en el toggle del shell.
 */

import { useSyncExternalStore } from 'react'

const KEY   = 'dashboard_dark_mode'
const EVENT = `${KEY}:changed`

function subscribe(cb) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => cb()
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

function getSnapshot() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(KEY) === '1'
}

function getServerSnapshot() { return false }

export function useDashboardDarkMode() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export function tokensChart(dark) {
  return dark
    ? {
        bg:        'transparent',
        text:      '#f6f2ea',
        textDim:   '#a8a399',
        axis:      '#555050',
        grid:      '#333131',
        barFill:   '#c9a86a',
        barFillAlt:'#4d8070',
        lineStroke:'#f2d79a',
        target:    '#8a8a8a',
        empty:     '#767070',
        tooltipBg: '#2a2a2a',
        tooltipText:'#f6f2ea',
        warn:      '#f6a35b',
      }
    : {
        bg:        'transparent',
        text:      '#2a2723',
        textDim:   '#8b8278',
        axis:      '#bfb8ab',
        grid:      '#eceadf',
        barFill:   '#4a3c2a',
        barFillAlt:'#4a8c6f',
        lineStroke:'#9b7a3a',
        target:    '#888',
        empty:     '#bfb8ab',
        tooltipBg: '#2a2723',
        tooltipText:'#f6f2ea',
        warn:      '#c47a2e',
      }
}
