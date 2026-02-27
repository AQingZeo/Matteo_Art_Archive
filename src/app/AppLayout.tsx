import { Outlet } from 'react-router-dom'

/**
 * Root layout. Single container for SPA; no full reloads.
 * Optional: wrap with global state (state machine) provider.
 */
export function AppLayout() {
  return (
    <div className="app-layout">
      <Outlet />
    </div>
  )
}
