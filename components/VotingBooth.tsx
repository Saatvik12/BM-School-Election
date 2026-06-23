'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase, Candidate } from '@/lib/supabase'
import {
  saveLocalVote, getLocalVotes, getUnsyncedVotes, markVotesSynced,
  clearLocalVotes, getLocalTallies, getSyncEnabled, setSyncEnabled,
  getLocalVoteCount, getUnsyncedVoteCount, getSyncedVoteCount, LocalVote
} from '@/lib/localStore'

type VotingStep = 'welcome' | 'spl' | 'aspl' | 'loading' | 'success' | 'closed'

const PASSWORD = 'BMIS1815$$#'

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880; osc.type = 'sine'
    gain.gain.setValueAtTime(0.8, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.6)
  } catch {}
}

// ── Booth Settings Panel ─────────────────────────────────

function BoothSettings({ booth, onClose }: { booth: number; onClose: () => void }) {
  const [syncEnabled, setSyncEnabledState] = useState(() => getSyncEnabled(booth))
  const [localVotes, setLocalVotes] = useState<LocalVote[]>([])
  const [tallies, setTallies] = useState<{ spl: Record<string, number>; aspl: Record<string, number>; total: number }>({ spl: {}, aspl: {}, total: 0 })
  const [resetMode, setResetMode] = useState(false)
  const [resetOptions, setResetOptions] = useState({ database: false, allLocal: false })
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const refresh = useCallback(() => {
    setLocalVotes(getLocalVotes(booth))
    setTallies(getLocalTallies(booth))
  }, [booth])

  useEffect(() => { refresh() }, [refresh])

  const toggleSync = () => {
    const next = !syncEnabled
    setSyncEnabled(booth, next)
    setSyncEnabledState(next)
  }

  const handleManualSync = async () => {
    const unsynced = getUnsyncedVotes(booth)
    if (unsynced.length === 0) { setSyncMsg('Nothing to sync.'); return }
    setSyncing(true); setSyncMsg('')
    try {
      const rows = unsynced.map(v => ({ booth, spl: v.spl, aspl: v.aspl, created_at: v.timestamp }))
      const { error } = await supabase.from('votes').insert(rows)
      if (error) { setSyncMsg('Sync failed: ' + error.message) }
      else {
        markVotesSynced(booth, unsynced.map(v => v.id))
        setSyncMsg(`✓ Synced ${unsynced.length} vote${unsynced.length > 1 ? 's' : ''}`)
        refresh()
      }
    } catch { setSyncMsg('Sync failed: network error') }
    setSyncing(false)
  }

  const handleReset = async () => {
    if (resetPassword !== PASSWORD) { setResetError('Incorrect password.'); return }
    if (!resetOptions.database && !resetOptions.allLocal) { setResetError('Select at least one option.'); return }
    setResetting(true); setResetError('')
    if (resetOptions.database) {
      await supabase.from('votes').delete().eq('booth', booth)
    }
    if (resetOptions.allLocal) {
      clearLocalVotes(booth)
    }
    refresh()
    setResetting(false)
    setResetMode(false)
    setResetPassword('')
    setResetOptions({ database: false, allLocal: false })
  }

  const splEntries = Object.entries(tallies.spl).sort((a, b) => b[1] - a[1])
  const asplEntries = Object.entries(tallies.aspl).sort((a, b) => b[1] - a[1])
  const unsynced = getUnsyncedVoteCount(booth)
  const synced = getSyncedVoteCount(booth)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15,23,42,0.6)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: 'white', borderRadius: '20px',
        width: '100%', maxWidth: '600px',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--foreground)' }}>Booth {booth} Settings</h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '2px' }}>Local records & sync control</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--border)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            {[
              { label: 'Total Local', value: getLocalVoteCount(booth), color: 'var(--accent)' },
              { label: 'Synced', value: synced, color: 'var(--success)' },
              { label: 'Unsynced', value: unsynced, color: unsynced > 0 ? 'var(--warning)' : 'var(--muted)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--background)', borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: '800', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px', fontWeight: '500' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Sync toggle */}
          <div style={{ background: syncEnabled ? 'var(--accent-light)' : '#fef3c7', borderRadius: '12px', padding: '16px', border: `1px solid ${syncEnabled ? 'var(--accent)' : 'var(--warning)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--foreground)' }}>
                  {syncEnabled ? '🟢 Sync Enabled' : '🟡 Sync Disabled'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
                  {syncEnabled ? 'Votes upload to database in real time' : 'Votes saved locally only, queued for later'}
                </div>
              </div>
              <button onClick={toggleSync} style={{
                padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: '600', fontSize: '13px',
                background: syncEnabled ? 'var(--danger)' : 'var(--success)',
                color: 'white',
              }}>
                {syncEnabled ? 'Turn Off' : 'Turn On'}
              </button>
            </div>
            {unsynced > 0 && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--warning)', fontWeight: '600' }}>
                  ⚠ {unsynced} vote{unsynced > 1 ? 's' : ''} waiting to sync
                </span>
                <button onClick={handleManualSync} disabled={syncing} style={{
                  padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontWeight: '600', fontSize: '13px', background: 'var(--accent)', color: 'white',
                  opacity: syncing ? 0.6 : 1,
                }}>
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            )}
            {syncMsg && <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--success)', fontWeight: '600' }}>{syncMsg}</p>}
          </div>

          {/* Local tallies */}
          <div style={{ borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', background: 'var(--background)', borderBottom: '1px solid var(--border)', fontWeight: '700', fontSize: '14px' }}>
              📊 Local Vote Tally — Booth {booth}
            </div>
            <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)', letterSpacing: '0.5px', marginBottom: '10px' }}>SPL</p>
                {splEntries.length === 0 && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No votes yet</p>}
                {splEntries.map(([name, count]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
                    <span style={{ fontWeight: '500' }}>{name}</span>
                    <span style={{ fontWeight: '700', color: 'var(--accent)' }}>{count}</span>
                  </div>
                ))}
              </div>
              <div>
                <p style={{ fontSize: '12px', fontWeight: '700', color: 'var(--muted)', letterSpacing: '0.5px', marginBottom: '10px' }}>ASPL</p>
                {asplEntries.length === 0 && <p style={{ fontSize: '13px', color: 'var(--muted)' }}>No votes yet</p>}
                {asplEntries.map(([name, count]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '14px' }}>
                    <span style={{ fontWeight: '500' }}>{name}</span>
                    <span style={{ fontWeight: '700', color: 'var(--success)' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Reset section */}
          {!resetMode ? (
            <button onClick={() => setResetMode(true)} style={{
              padding: '12px', borderRadius: '10px',
              border: '2px solid var(--danger)', background: 'transparent',
              color: 'var(--danger)', fontWeight: '600', cursor: 'pointer', fontSize: '14px',
            }}>
              🗑 Reset Votes for This Booth
            </button>
          ) : (
            <div style={{ borderRadius: '12px', border: '2px solid var(--danger)', padding: '16px' }}>
              <p style={{ fontWeight: '700', fontSize: '14px', color: 'var(--danger)', marginBottom: '14px' }}>Select what to reset:</p>
              {[
                { key: 'database', label: 'Synced votes in database (Booth ' + booth + ' only)', sub: 'Deletes this booth\'s rows from Supabase' },
                { key: 'allLocal', label: 'All locally stored votes on this device', sub: 'Clears this laptop\'s local records' },
              ].map(opt => (
                <label key={opt.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={resetOptions[opt.key as keyof typeof resetOptions]}
                    onChange={e => setResetOptions(prev => ({ ...prev, [opt.key]: e.target.checked }))}
                    style={{ marginTop: '3px', accentColor: 'var(--danger)', width: '16px', height: '16px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{opt.label}</div>
                    <div style={{ fontSize: '12px', color: 'var(--muted)' }}>{opt.sub}</div>
                  </div>
                </label>
              ))}
              <input
                type="password"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Enter admin password to confirm"
                style={{ marginBottom: '10px', marginTop: '4px' }}
              />
              {resetError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '10px' }}>{resetError}</p>}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleReset} disabled={resetting} style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  background: 'var(--danger)', color: 'white', fontWeight: '600', cursor: 'pointer',
                  opacity: resetting ? 0.6 : 1, fontSize: '14px',
                }}>
                  {resetting ? 'Resetting...' : 'Confirm Reset'}
                </button>
                <button className="btn-ghost" onClick={() => { setResetMode(false); setResetError(''); setResetPassword('') }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main VotingBooth ────────────────────────────────────

export default function VotingBooth() {
  const { session, logout } = useAuth()
  const [step, setStep] = useState<VotingStep>('welcome')
  const [direction, setDirection] = useState<'right' | 'left'>('right')
  const [splCandidates, setSplCandidates] = useState<Candidate[]>([])
  const [asplCandidates, setAsplCandidates] = useState<Candidate[]>([])
  const [selectedSpl, setSelectedSpl] = useState('')
  const [pendingSpl, setPendingSpl] = useState('')
  const [pendingAspl, setPendingAspl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [electionOpen, setElectionOpen] = useState(true)
  const [syncEnabled, setSyncEnabledState] = useState(true)
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsPassword, setSettingsPassword] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [localCount, setLocalCount] = useState(0)
  const syncRef = useRef(syncEnabled)

  const booth = session!.booth!

  useEffect(() => { syncRef.current = syncEnabled }, [syncEnabled])

  const refreshLocalCount = useCallback(() => {
    setLocalCount(getLocalVoteCount(booth))
    setSyncEnabledState(getSyncEnabled(booth))
  }, [booth])

  const loadCandidates = useCallback(async () => {
    const { data } = await supabase.from('candidates').select('*').eq('active', true).order('display_order')
    if (data) {
      setSplCandidates(data.filter((c: Candidate) => c.position === 'SPL'))
      setAsplCandidates(data.filter((c: Candidate) => c.position === 'ASPL'))
    }
  }, [])

  const checkElectionStatus = useCallback(async () => {
    const { data } = await supabase.from('election_settings').select('voting_open').single()
    if (data) {
      setElectionOpen(data.voting_open)
      if (!data.voting_open) setStep('closed')
    }
  }, [])

  // Try to sync any unsynced votes
  const trySyncPending = useCallback(async () => {
    if (!getSyncEnabled(booth)) return
    const unsynced = getUnsyncedVotes(booth)
    if (unsynced.length === 0) return
    try {
      const rows = unsynced.map(v => ({ booth, spl: v.spl, aspl: v.aspl, created_at: v.timestamp }))
      const { error } = await supabase.from('votes').insert(rows)
      if (!error) {
        markVotesSynced(booth, unsynced.map(v => v.id))
        refreshLocalCount()
      }
    } catch {}
  }, [booth, refreshLocalCount])

  useEffect(() => {
    refreshLocalCount()
    loadCandidates()
    checkElectionStatus()

    const channel = supabase.channel('election-settings-booth')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'election_settings' }, (payload) => {
        const open = payload.new.voting_open
        setElectionOpen(open)
        if (!open) setStep('closed')
        else setStep(prev => prev === 'closed' ? 'welcome' : prev)
      })
      .subscribe()

    // Try syncing pending votes on load and every 30s
    trySyncPending()
    const syncInterval = setInterval(trySyncPending, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(syncInterval)
    }
  }, [loadCandidates, checkElectionStatus, refreshLocalCount, trySyncPending])

  // Heartbeat
  useEffect(() => {
    const sendHeartbeat = async () => {
      await supabase.from('booth_status').upsert({ booth, last_seen: new Date().toISOString() }, { onConflict: 'booth' })
    }
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 30000)
    return () => clearInterval(interval)
  }, [booth])

  const submitVote = async (spl: string, aspl: string) => {
    const timestamp = new Date().toISOString()

    // Always save locally first
    const localVote = saveLocalVote(booth, { spl, aspl, timestamp, synced: false })
    refreshLocalCount()

    // Try to sync if enabled
    if (getSyncEnabled(booth)) {
      try {
        const { error } = await supabase.from('votes').insert({ booth, spl, aspl, created_at: timestamp })
        if (!error) {
          markVotesSynced(booth, [localVote.id])
          refreshLocalCount()
        }
      } catch {}
    }

    setStep('success')
    playBeep()

    setTimeout(() => {
      setStep('welcome')
      setSelectedSpl('')
      setPendingSpl('')
      setPendingAspl('')
      setSubmitting(false)
    }, 3000)
  }

  const handleSplConfirm = () => {
    if (!pendingSpl) return
    setSelectedSpl(pendingSpl)
    setPendingSpl('')
    setDirection('right')
    setStep('aspl')
  }

  const handleAsplConfirm = async () => {
    if (!pendingAspl || submitting) return
    setSubmitting(true)
    setStep('loading')
    await submitVote(selectedSpl, pendingAspl)
  }

  const handleBack = () => {
    setDirection('left')
    setPendingSpl('')
    setPendingAspl('')
    setStep('spl')
  }

  const handleSettingsSubmit = () => {
    if (settingsPassword === PASSWORD) {
      setShowSettingsPrompt(false)
      setShowSettings(true)
      setSettingsPassword('')
      setSettingsError('')
    } else {
      setSettingsError('Incorrect password.')
    }
  }

  const unsynced = getUnsyncedVoteCount(booth)

  // ── LOADING ─────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={spinnerStyle} />
          <p style={{ marginTop: '24px', fontSize: '18px', fontWeight: '600' }}>Recording Vote...</p>
          <p style={{ marginTop: '8px', color: 'var(--muted)', fontSize: '14px' }}>Please wait</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── SUCCESS ─────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div style={fullScreen}>
        <div className="animate-fadeIn" style={{ textAlign: 'center' }}>
          <div style={{ width: '80px', height: '80px', background: 'var(--success-light)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '700', letterSpacing: '-0.5px' }}>Vote Recorded</h2>
          <p style={{ marginTop: '10px', fontSize: '16px', color: 'var(--muted)' }}>Thank you for voting.</p>
          <p style={{ marginTop: '24px', fontSize: '13px', color: '#94a3b8' }}>Returning to home screen in 3 seconds...</p>
        </div>
      </div>
    )
  }

  // ── CLOSED ──────────────────────────────────────────────
  if (step === 'closed') {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '700' }}>Election is currently closed.</h2>
          <p style={{ marginTop: '10px', color: 'var(--muted)', fontSize: '15px' }}>Please wait for the administrator to open voting.</p>
          <button className="btn-ghost" onClick={logout} style={{ marginTop: '28px' }}>Sign Out</button>
        </div>
      </div>
    )
  }

  const isSpl = step === 'spl'
  const candidates = isSpl ? splCandidates : asplCandidates
  const pendingSelection = isSpl ? pendingSpl : pendingAspl
  const setPending = isSpl ? setPendingSpl : setPendingAspl
  const animClass = direction === 'right' ? 'animate-slideInRight' : 'animate-slideInLeft'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8f9fc 0%, #eef2ff 100%)', display: 'flex', flexDirection: 'column' }}>

      {/* Settings overlay */}
      {showSettings && (
        <BoothSettings booth={booth} onClose={() => { setShowSettings(false); refreshLocalCount() }} />
      )}

      {/* Settings password prompt */}
      {showSettingsPrompt && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: '0 24px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontWeight: '700', fontSize: '18px', marginBottom: '6px' }}>Booth Settings</h3>
            <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>Enter admin password to continue</p>
            <input type="password" value={settingsPassword} onChange={e => setSettingsPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSettingsSubmit()}
              placeholder="Password" autoFocus style={{ marginBottom: '12px' }} />
            {settingsError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{settingsError}</p>}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-primary" onClick={handleSettingsSubmit} style={{ flex: 1, justifyContent: 'center' }}>Unlock</button>
              <button className="btn-ghost" onClick={() => { setShowSettingsPrompt(false); setSettingsPassword(''); setSettingsError('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div style={topBar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
            </svg>
          </div>
          <span style={{ fontWeight: '700', fontSize: '15px' }}>Booth {booth}</span>
          {/* Offline sync badge */}
          {!syncEnabled && (
            <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px', border: '1px solid #fcd34d' }}>
              ⚡ OFFLINE MODE
            </span>
          )}
          {syncEnabled && unsynced > 0 && (
            <span style={{ background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '11px', fontWeight: '700', padding: '3px 8px', borderRadius: '20px' }}>
              ↑ {unsynced} queued
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-ghost" onClick={() => setShowSettingsPrompt(true)} style={{ padding: '8px 14px', fontSize: '13px' }}>
            ⚙ Settings
          </button>
          <button className="btn-ghost" onClick={logout} style={{ padding: '8px 14px', fontSize: '13px' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Offline mode banner */}
      {!syncEnabled && (
        <div style={{ background: '#fef3c7', borderBottom: '1px solid #fcd34d', padding: '10px 24px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: '#92400e' }}>
          ⚡ Offline Mode is ON — Votes are being saved locally and will sync when re-enabled
        </div>
      )}

      {/* WELCOME */}
      {step === 'welcome' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div className="animate-fadeIn" style={{ textAlign: 'center', maxWidth: '520px', width: '100%' }}>
            <div style={{ width: '72px', height: '72px', background: 'var(--accent)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', boxShadow: '0 8px 24px rgba(99,102,241,0.3)' }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
              </svg>
            </div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', letterSpacing: '-1px', lineHeight: 1.1 }}>BMIS Elections</h1>
            <p style={{ fontSize: '20px', fontWeight: '600', color: 'var(--accent)', marginTop: '6px' }}>2026 – 27</p>
            <p style={{ marginTop: '16px', color: 'var(--muted)', fontSize: '15px', lineHeight: 1.6 }}>
              You are voting from <strong style={{ color: 'var(--foreground)' }}>Booth {booth}</strong>.<br />
              Press the button below when you are ready to vote.
            </p>
            <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--muted)' }}>
              🗳 {localCount} vote{localCount !== 1 ? 's' : ''} recorded on this device today
            </p>
            <button className="btn-primary" onClick={() => { if (!electionOpen) { setStep('closed'); return } setStep('spl') }}
              style={{ marginTop: '36px', padding: '16px 40px', fontSize: '16px', borderRadius: '12px' }}>
              Proceed to Voting →
            </button>
          </div>
        </div>
      )}

      {/* SPL / ASPL */}
      {(step === 'spl' || step === 'aspl') && (
        <>
          <div style={{ padding: '24px 24px 0' }}>
            <div style={{ maxWidth: '560px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <StepPill active={true} done={!isSpl} number={1} label="SPL" />
                <div style={{ flex: 1, height: '2px', background: isSpl ? 'var(--border)' : 'var(--accent)', borderRadius: '2px', transition: 'background 0.3s ease' }} />
                <StepPill active={!isSpl} done={false} number={2} label="ASPL" />
              </div>
              <p style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center', marginTop: '4px' }}>Step {isSpl ? '1' : '2'} of 2</p>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div className={animClass} style={{ width: '100%', maxWidth: '560px' }} key={step}>
              <div className="card" style={{ padding: '32px' }}>
                <span style={{ display: 'inline-block', background: 'var(--accent-light)', color: 'var(--accent)', fontSize: '12px', fontWeight: '700', letterSpacing: '0.8px', padding: '4px 10px', borderRadius: '6px' }}>
                  {isSpl ? 'STUDENT PUPIL LEADER' : 'ASSISTANT STUDENT PUPIL LEADER'}
                </span>
                <h2 style={{ fontSize: '22px', fontWeight: '700', marginTop: '12px', letterSpacing: '-0.3px' }}>
                  {isSpl ? 'Select your SPL candidate' : 'Now select your ASPL candidate'}
                </h2>
                {!isSpl && (
                  <p style={{ marginTop: '6px', fontSize: '14px', color: 'var(--muted)' }}>
                    SPL vote: <strong style={{ color: 'var(--accent)' }}>{selectedSpl}</strong>
                  </p>
                )}
                <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {candidates.map((candidate, i) => {
                    const isSelected = pendingSelection === candidate.name
                    return (
                      <button key={candidate.id} onClick={() => setPending(candidate.name)} style={{
                        background: isSelected ? 'var(--accent)' : 'var(--card)',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: '14px', padding: '20px 24px', cursor: 'pointer',
                        textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: '16px',
                        transition: 'all 0.18s ease',
                        transform: isSelected ? 'translateY(-2px)' : 'none',
                        boxShadow: isSelected ? '0 6px 20px rgba(99,102,241,0.25)' : 'none',
                      }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '700', fontSize: '15px', color: isSelected ? 'white' : 'var(--accent)', transition: 'all 0.18s ease' }}>
                          {String.fromCharCode(65 + i)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '17px', color: isSelected ? 'white' : 'var(--foreground)', transition: 'color 0.18s ease' }}>{candidate.name}</div>
                          <div style={{ fontSize: '13px', color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--muted)', marginTop: '2px' }}>Candidate {i + 1}</div>
                        </div>
                        {isSelected && (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
                <button className="btn-primary" onClick={isSpl ? handleSplConfirm : handleAsplConfirm}
                  disabled={!pendingSelection || submitting}
                  style={{ marginTop: '20px', width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px' }}>
                  {pendingSelection ? `Confirm: ${pendingSelection} →` : 'Select a candidate to continue'}
                </button>
                {!isSpl && (
                  <button className="btn-ghost" onClick={handleBack} style={{ marginTop: '10px', width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                    Back to SPL selection
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StepPill({ active, done, number, label }: { active: boolean; done: boolean; number: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s ease', flexShrink: 0 }}>
        {done ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M5 12l4 4 9-9"/></svg>
          : <span style={{ fontSize: '13px', fontWeight: '700', color: active ? 'white' : 'var(--muted)' }}>{number}</span>}
      </div>
      <span style={{ fontSize: '13px', fontWeight: '600', color: active ? 'var(--foreground)' : 'var(--muted)' }}>{label}</span>
    </div>
  )
}

const fullScreen: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'linear-gradient(135deg, #f8f9fc 0%, #eef2ff 100%)',
}
const topBar: React.CSSProperties = {
  padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.8)',
  backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 10, width: '100%',
}
const spinnerStyle: React.CSSProperties = {
  width: '48px', height: '48px', border: '4px solid var(--border)',
  borderTop: '4px solid var(--accent)', borderRadius: '50%',
  animation: 'spin 0.8s linear infinite', margin: '0 auto',
}
