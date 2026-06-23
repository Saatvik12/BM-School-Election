'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase, Vote, BoothStatus } from '@/lib/supabase'

type Tab = 'results' | 'booths' | 'settings'

export default function AdminDashboard() {
  const { logout } = useAuth()
  const [tab, setTab] = useState<Tab>('results')
  const [votes, setVotes] = useState<Vote[]>([])
  const [boothStatuses, setBoothStatuses] = useState<BoothStatus[]>([])
  const [electionOpen, setElectionOpen] = useState(true)
  const [togglingElection, setTogglingElection] = useState(false)
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetting, setResetting] = useState(false)

  const loadData = useCallback(async () => {
    const [votesRes, boothRes, settingsRes] = await Promise.all([
      supabase.from('votes').select('*').order('created_at'),
      supabase.from('booth_status').select('*'),
      supabase.from('election_settings').select('*').single(),
    ])
    if (votesRes.data) setVotes(votesRes.data)
    if (boothRes.data) setBoothStatuses(boothRes.data)
    if (settingsRes.data) setElectionOpen(settingsRes.data.voting_open)
  }, [])

  useEffect(() => {
    loadData()
    const channel = supabase
      .channel('admin-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'booth_status' }, () => loadData())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'election_settings' }, (p) => setElectionOpen(p.new.voting_open))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadData])

  // Derived stats
  const splCounts: Record<string, number> = {}
  const asplCounts: Record<string, number> = {}
  const boothBreakdownSpl: Record<string, Record<number, number>> = {}
  const boothBreakdownAspl: Record<string, Record<number, number>> = {}

  votes.forEach(v => {
    splCounts[v.spl] = (splCounts[v.spl] || 0) + 1
    asplCounts[v.aspl] = (asplCounts[v.aspl] || 0) + 1
    if (!boothBreakdownSpl[v.spl]) boothBreakdownSpl[v.spl] = {}
    boothBreakdownSpl[v.spl][v.booth] = (boothBreakdownSpl[v.spl][v.booth] || 0) + 1
    if (!boothBreakdownAspl[v.aspl]) boothBreakdownAspl[v.aspl] = {}
    boothBreakdownAspl[v.aspl][v.booth] = (boothBreakdownAspl[v.aspl][v.booth] || 0) + 1
  })

  const isBoothActive = (booth: BoothStatus) => {
    const diff = Date.now() - new Date(booth.last_seen).getTime()
    return diff < 60000
  }

  const handleToggleElection = async () => {
    setTogglingElection(true)
    await supabase.from('election_settings').update({ voting_open: !electionOpen }).eq('id', 1)
    setElectionOpen(!electionOpen)
    setTogglingElection(false)
  }

  const handleExportCSV = () => {
    const rows = [['Timestamp', 'Booth', 'SPL Candidate', 'ASPL Candidate']]
    votes.forEach(v => {
      const t = new Date(v.created_at)
      const ts = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}`
      rows.push([ts, String(v.booth), v.spl, v.aspl])
    })
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `election-results-${Date.now()}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const handleReset = async () => {
    if (resetStep === 0) { setResetStep(1); return }
    if (resetStep === 1) {
      if (resetConfirmText !== 'RESET') { setResetError('Type RESET exactly.'); return }
      setResetError(''); setResetStep(2); return
    }
    if (resetStep === 2) {
      if (resetPassword !== 'BMIS1815$$$') { setResetError('Incorrect password.'); return }
      setResetting(true)
      const { error: deleteError } = await supabase.from('votes').delete().gt('id', 0)
      if (deleteError) { setResetError('Delete failed: ' + deleteError.message); setResetting(false); return }
      setVotes([])
      setResetStep(0); setResetConfirmText(''); setResetPassword(''); setResetError('')
      setResetting(false)
    }
  }

  const cancelReset = () => {
    setResetStep(0); setResetConfirmText(''); setResetPassword(''); setResetError('')
  }

  const maxSpl = Math.max(...Object.values(splCounts), 1)
  const maxAspl = Math.max(...Object.values(asplCounts), 1)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      {/* Top nav */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '36px', height: '36px', background: 'var(--accent)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px' }}>Election Admin</div>
            <div style={{ fontSize: '12px', color: 'var(--muted)' }}>Dashboard</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: electionOpen ? 'var(--success)' : '#94a3b8' }} />
            <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: '500' }}>
              {electionOpen ? 'Voting Open' : 'Voting Closed'}
            </span>
          </div>
          <button className="btn-ghost" onClick={logout} style={{ padding: '8px 16px', fontSize: '13px' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          <StatCard label="Total Votes" value={votes.length} icon="🗳️" />
          <StatCard label="SPL Candidates" value={Object.keys(splCounts).length} icon="👤" />
          <StatCard label="ASPL Candidates" value={Object.keys(asplCounts).length} icon="👤" />
          <StatCard label="Active Booths" value={boothStatuses.filter(isBoothActive).length} icon="🖥️" />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '4px', marginBottom: '24px', width: 'fit-content' }}>
          {(['results', 'booths', 'settings'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.15s ease',
              background: tab === t ? 'var(--accent)' : 'transparent',
              color: tab === t ? 'white' : 'var(--muted)',
              textTransform: 'capitalize',
            }}>
              {t}
            </button>
          ))}
        </div>

        {/* Results Tab */}
        {tab === 'results' && (
          <div className="animate-fadeIn">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
              <ResultsCard title="SPL Results" counts={splCounts} max={maxSpl} total={votes.length} color="var(--accent)" />
              <ResultsCard title="ASPL Results" counts={asplCounts} max={maxAspl} total={votes.length} color="var(--success)" />
            </div>

            {/* Booth breakdown */}
            <div className="card" style={{ padding: '24px', marginBottom: '20px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '20px' }}>Booth-wise Breakdown — SPL</h3>
              <BreakdownTable breakdown={boothBreakdownSpl} />
            </div>
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '20px' }}>Booth-wise Breakdown — ASPL</h3>
              <BreakdownTable breakdown={boothBreakdownAspl} />
            </div>
          </div>
        )}

        {/* Booths Tab */}
        {tab === 'booths' && (
          <div className="animate-fadeIn">
            <div className="card" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h3 style={{ fontWeight: '700', fontSize: '16px' }}>Booth Heartbeat Monitor</h3>
                <button className="btn-ghost" onClick={loadData} style={{ padding: '8px 16px', fontSize: '13px' }}>↻ Refresh</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
                {[1,2,3,4,5,6].map(n => {
                  const booth = boothStatuses.find(b => b.booth === n)
                  const active = booth && isBoothActive(booth)
                  const lastSeen = booth ? new Date(booth.last_seen) : null
                  return (
                    <div key={n} className="card" style={{ padding: '20px', borderColor: active ? 'var(--success)' : 'var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontWeight: '700', fontSize: '15px' }}>Booth {n}</span>
                        <span style={{ fontSize: '18px' }}>{active ? '❤️' : '⚠️'}</span>
                      </div>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: active ? 'var(--success-light)' : '#f1f5f9',
                        color: active ? 'var(--success)' : 'var(--muted)',
                        padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                      }}>
                        <div className={`status-dot ${active ? 'active' : 'offline'}`} />
                        {active ? 'Active' : booth ? 'Offline' : 'Not Connected'}
                      </div>
                      {lastSeen && (
                        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--muted)' }}>
                          Last seen: {lastSeen.toLocaleTimeString()}
                        </div>
                      )}
                      <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--muted)', fontWeight: '500' }}>
                        {votes.filter(v => v.booth === n).length} votes cast
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {tab === 'settings' && (
          <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Election toggle */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px' }}>Election Status</h3>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>
                Opening or closing the election affects all booths immediately.
              </p>
              <button
                onClick={handleToggleElection}
                disabled={togglingElection}
                style={{
                  padding: '12px 28px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '700',
                  fontSize: '15px',
                  background: electionOpen ? 'var(--danger)' : 'var(--success)',
                  color: 'white',
                  transition: 'all 0.15s ease',
                  opacity: togglingElection ? 0.6 : 1,
                }}
              >
                {togglingElection ? 'Updating...' : electionOpen ? '🔒 Close Election' : '🔓 Open Election'}
              </button>
            </div>

            {/* CSV Export */}
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px' }}>Export Data</h3>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>
                Download all {votes.length} votes as a CSV file compatible with Excel.
              </p>
              <button className="btn-primary" onClick={handleExportCSV} disabled={votes.length === 0}>
                📥 Export CSV
              </button>
            </div>

            {/* Reset votes */}
            <div className="card" style={{ padding: '24px', borderColor: resetStep > 0 ? 'var(--danger)' : 'var(--border)' }}>
              <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '6px', color: 'var(--danger)' }}>Reset Votes</h3>
              <p style={{ color: 'var(--muted)', fontSize: '14px', marginBottom: '20px' }}>
                Permanently deletes all vote records. Use for test cleanup only.
              </p>

              {resetStep === 0 && (
                <button onClick={handleReset} style={{ padding: '10px 20px', borderRadius: '10px', border: '2px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
                  Reset All Votes
                </button>
              )}

              {resetStep === 1 && (
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: 'var(--foreground)' }}>
                    Type <strong>RESET</strong> to confirm:
                  </p>
                  <input type="text" value={resetConfirmText} onChange={e => setResetConfirmText(e.target.value)} placeholder="Type RESET here" style={{ marginBottom: '12px' }} />
                  {resetError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{resetError}</p>}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleReset} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'var(--danger)', color: 'white', fontWeight: '600', cursor: 'pointer' }}>Continue</button>
                    <button className="btn-ghost" onClick={cancelReset}>Cancel</button>
                  </div>
                </div>
              )}

              {resetStep === 2 && (
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '12px', color: 'var(--foreground)' }}>
                    Enter admin password to confirm:
                  </p>
                  <input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="Admin password" style={{ marginBottom: '12px' }} />
                  {resetError && <p style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '12px' }}>{resetError}</p>}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleReset} disabled={resetting} style={{ padding: '10px 20px', borderRadius: '10px', border: 'none', background: 'var(--danger)', color: 'white', fontWeight: '600', cursor: 'pointer', opacity: resetting ? 0.6 : 1 }}>
                      {resetting ? 'Deleting...' : '⚠️ Delete All Votes'}
                    </button>
                    <button className="btn-ghost" onClick={cancelReset}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{ fontSize: '28px' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--foreground)', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px', fontWeight: '500' }}>{label}</div>
      </div>
    </div>
  )
}

function ResultsCard({ title, counts, max, total, color }: { title: string; counts: Record<string, number>; max: number; total: number; color: string }) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return (
    <div className="card" style={{ padding: '24px' }}>
      <h3 style={{ fontWeight: '700', fontSize: '16px', marginBottom: '20px' }}>{title}</h3>
      {sorted.length === 0 && <p style={{ color: 'var(--muted)', fontSize: '14px' }}>No votes yet.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {sorted.map(([name, count]) => (
          <div key={name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontWeight: '600', fontSize: '14px' }}>{name}</span>
              <span style={{ fontSize: '14px', color: 'var(--muted)' }}>
                {count} <span style={{ fontSize: '12px' }}>({total > 0 ? Math.round(count/total*100) : 0}%)</span>
              </span>
            </div>
            <div style={{ height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(count / max) * 100}%`,
                background: color,
                borderRadius: '4px',
                transition: 'width 0.4s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BreakdownTable({ breakdown }: { breakdown: Record<string, Record<number, number>> }) {
  const candidates = Object.keys(breakdown)
  if (candidates.length === 0) return <p style={{ color: 'var(--muted)', fontSize: '14px' }}>No data yet.</p>

  const booths = [1,2,3,4,5,6]
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: '700', color: 'var(--muted)', fontSize: '12px', letterSpacing: '0.5px' }}>CANDIDATE</th>
            {booths.map(b => (
              <th key={b} style={{ textAlign: 'center', padding: '8px 12px', fontWeight: '700', color: 'var(--muted)', fontSize: '12px' }}>B{b}</th>
            ))}
            <th style={{ textAlign: 'center', padding: '8px 12px', fontWeight: '700', color: 'var(--foreground)', fontSize: '12px' }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {candidates.sort().map((cand, i) => {
            const total = Object.values(breakdown[cand]).reduce((a, b) => a + b, 0)
            return (
              <tr key={cand} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : '#fafafa' }}>
                <td style={{ padding: '10px 12px', fontWeight: '600' }}>{cand}</td>
                {booths.map(b => (
                  <td key={b} style={{ textAlign: 'center', padding: '10px 12px', color: breakdown[cand][b] ? 'var(--foreground)' : 'var(--muted)' }}>
                    {breakdown[cand][b] || 0}
                  </td>
                ))}
                <td style={{ textAlign: 'center', padding: '10px 12px', fontWeight: '700', color: 'var(--accent)' }}>{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
