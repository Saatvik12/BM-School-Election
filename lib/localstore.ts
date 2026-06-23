// Local storage keys
const key = (booth: number, suffix: string) => `bmis_booth${booth}_${suffix}`

export type LocalVote = {
  id: string
  spl: string
  aspl: string
  timestamp: string
  synced: boolean
}

// ── Vote storage ─────────────────────────────────────────

export function getLocalVotes(booth: number): LocalVote[] {
  try {
    const raw = localStorage.getItem(key(booth, 'votes'))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveLocalVote(booth: number, vote: Omit<LocalVote, 'id'>): LocalVote {
  const votes = getLocalVotes(booth)
  const newVote: LocalVote = { ...vote, id: `${Date.now()}_${Math.random().toString(36).slice(2)}` }
  votes.push(newVote)
  localStorage.setItem(key(booth, 'votes'), JSON.stringify(votes))
  return newVote
}

export function markVotesSynced(booth: number, ids: string[]) {
  const votes = getLocalVotes(booth)
  const updated = votes.map(v => ids.includes(v.id) ? { ...v, synced: true } : v)
  localStorage.setItem(key(booth, 'votes'), JSON.stringify(updated))
}

export function clearLocalVotes(booth: number) {
  localStorage.removeItem(key(booth, 'votes'))
}

export function getUnsyncedVotes(booth: number): LocalVote[] {
  return getLocalVotes(booth).filter(v => !v.synced)
}

export function getLocalVoteCount(booth: number): number {
  return getLocalVotes(booth).length
}

export function getSyncedVoteCount(booth: number): number {
  return getLocalVotes(booth).filter(v => v.synced).length
}

export function getUnsyncedVoteCount(booth: number): number {
  return getLocalVotes(booth).filter(v => !v.synced).length
}

// ── Sync setting ─────────────────────────────────────────

export function getSyncEnabled(booth: number): boolean {
  try {
    const val = localStorage.getItem(key(booth, 'sync'))
    return val === null ? true : val === 'true'
  } catch { return true }
}

export function setSyncEnabled(booth: number, enabled: boolean) {
  localStorage.setItem(key(booth, 'sync'), String(enabled))
}

// ── SPL/ASPL tallies (derived from local votes) ──────────

export function getLocalTallies(booth: number) {
  const votes = getLocalVotes(booth)
  const spl: Record<string, number> = {}
  const aspl: Record<string, number> = {}
  votes.forEach(v => {
    spl[v.spl] = (spl[v.spl] || 0) + 1
    aspl[v.aspl] = (aspl[v.aspl] || 0) + 1
  })
  return { spl, aspl, total: votes.length }
}
