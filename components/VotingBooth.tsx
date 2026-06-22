'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase, Candidate } from '@/lib/supabase'

type VotingStep = 'welcome' | 'spl' | 'aspl' | 'loading' | 'success' | 'closed'

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    oscillator.frequency.value = 880
    oscillator.type = 'sine'
    gainNode.gain.setValueAtTime(0.8, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.6)
  } catch {}
}

export default function VotingBooth() {
  const { session, logout } = useAuth()
  const [step, setStep] = useState<VotingStep>('welcome')
  const [direction, setDirection] = useState<'right' | 'left'>('right')
  const [splCandidates, setSplCandidates] = useState<Candidate[]>([])
  const [asplCandidates, setAsplCandidates] = useState<Candidate[]>([])
  const [selectedSpl, setSelectedSpl] = useState<string>('')
  const [selectedAspl, setSelectedAspl] = useState<string>('')
  const [pendingSpl, setPendingSpl] = useState<string>('')
  const [pendingAspl, setPendingAspl] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [electionOpen, setElectionOpen] = useState(true)

  const loadCandidates = useCallback(async () => {
    const { data } = await supabase
      .from('candidates')
      .select('*')
      .eq('active', true)
      .order('display_order')
    if (data) {
      setSplCandidates(data.filter((c: Candidate) => c.position === 'SPL'))
      setAsplCandidates(data.filter((c: Candidate) => c.position === 'ASPL'))
    }
  }, [])

  const checkElectionStatus = useCallback(async () => {
    const { data } = await supabase
      .from('election_settings')
      .select('voting_open')
      .single()
    if (data) {
      setElectionOpen(data.voting_open)
      if (!data.voting_open) setStep('closed')
    }
  }, [])

  useEffect(() => {
    loadCandidates()
    checkElectionStatus()

    const settingsChannel = supabase
      .channel('election-settings')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'election_settings' }, (payload) => {
        const open = payload.new.voting_open
        setElectionOpen(open)
        if (!open) setStep('closed')
        else if (step === 'closed') setStep('welcome')
      })
      .subscribe()

    return () => { supabase.removeChannel(settingsChannel) }
  }, [loadCandidates, checkElectionStatus])

  // Heartbeat
  useEffect(() => {
    if (!session?.booth) return
    const sendHeartbeat = async () => {
      await supabase.from('booth_status').upsert(
        { booth: session.booth, last_seen: new Date().toISOString() },
        { onConflict: 'booth' }
      )
    }
    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 30000)
    return () => clearInterval(interval)
  }, [session])

  const handleProceedToVoting = () => {
    if (!electionOpen) { setStep('closed'); return }
    setStep('spl')
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
    setSelectedAspl(pendingAspl)
    setStep('loading')
    await submitVote(selectedSpl, pendingAspl)
  }

  const submitVote = async (spl: string, aspl: string) => {
    const { error } = await supabase.from('votes').insert({
      booth: session!.booth,
      spl,
      aspl,
    })

    if (error) {
      alert('Failed to record vote. Please try again.')
      setStep('spl')
      setSelectedSpl('')
      setSelectedAspl('')
      setPendingSpl('')
      setPendingAspl('')
      setSubmitting(false)
      return
    }

    setStep('success')
    playBeep()

    setTimeout(() => {
      setStep('welcome')
      setSelectedSpl('')
      setSelectedAspl('')
      setPendingSpl('')
      setPendingAspl('')
      setSubmitting(false)
    }, 3000)
  }

  const handleBack = () => {
    setDirection('left')
    setPendingSpl('')
    setPendingAspl('')
    setStep('spl')
  }

  // ── LOADING ──────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={spinnerStyle} />
          <p style={{ marginTop: '24px', fontSize: '18px', fontWeight: '600', color: 'var(--foreground)' }}>
            Recording Vote...
          </p>
          <p style={{ marginTop: '8px', color: 'var(--muted)', fontSize: '14px' }}>Please wait</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── SUCCESS ──────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div style={fullScreen}>
        <div className="animate-fadeIn" style={{ textAlign: 'center' }}>
          <div style={{
            width: '80px', height: '80px',
            background: 'var(--success-light)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4"/>
              <circle cx="12" cy="12" r="9"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: '700', color: 'var(--foreground)', letterSpacing: '-0.5px' }}>
            Vote Recorded
          </h2>
          <p style={{ marginTop: '10px', fontSize: '16px', color: 'var(--muted)' }}>
            Thank you for voting.
          </p>
          <div style={{
            marginTop: '32px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px 24px',
            display: 'inline-block',
            fontSize: '14px',
            color: 'var(--muted)',
          }}>
            <strong style={{ color: 'var(--foreground)' }}>SPL:</strong> {selectedSpl} &nbsp;·&nbsp;
            <strong style={{ color: 'var(--foreground)' }}>ASPL:</strong> {selectedAspl}
          </div>
          <p style={{ marginTop: '24px', fontSize: '13px', color: '#94a3b8' }}>
            Returning to home screen in 3 seconds...
          </p>
        </div>
      </div>
    )
  }

  // ── CLOSED ───────────────────────────────────────────────
  if (step === 'closed') {
    return (
      <div style={fullScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px', height: '64px',
            background: '#fef3c7',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '700' }}>Election is currently closed.</h2>
          <p style={{ marginTop: '10px', color: 'var(--muted)', fontSize: '15px' }}>
            Please wait for the administrator to open voting.
          </p>
          <button className="btn-ghost" onClick={logout} style={{ marginTop: '28px' }}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  // ── WELCOME ──────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <div style={{ ...fullScreen, flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={topBar}>
          <BoothBadge booth={session?.booth} />
          <button className="btn-ghost" onClick={logout} style={{ padding: '8px 16px', fontSize: '13px' }}>
            Sign Out
          </button>
        </div>

        <div className="animate-fadeIn" style={{ textAlign: 'center', padding: '24px', maxWidth: '520px', width: '100%' }}>
          {/* Icon */}
          <div style={{
            width: '72px', height: '72px',
            background: 'var(--accent)',
            borderRadius: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
          }}>
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4"/>
              <circle cx="12" cy="12" r="9"/>
            </svg>
          </div>

          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--foreground)', letterSpacing: '-1px', lineHeight: 1.1 }}>
            BMIS Elections
          </h1>
          <p style={{ fontSize: '20px', fontWeight: '600', color: 'var(--accent)', marginTop: '6px' }}>
            2026 – 27
          </p>
          <p style={{ marginTop: '16px', color: 'var(--muted)', fontSize: '15px', lineHeight: 1.6 }}>
            You are voting from <strong style={{ color: 'var(--foreground)' }}>Booth {session?.booth}</strong>.<br />
            Please press the button below when you are ready to vote.
          </p>

          <button
            className="btn-primary"
            onClick={handleProceedToVoting}
            style={{ marginTop: '36px', padding: '16px 40px', fontSize: '16px', borderRadius: '12px' }}
          >
            Proceed to Voting →
          </button>
        </div>
      </div>
    )
  }

  // ── VOTING (SPL / ASPL) ──────────────────────────────────
  const isSpl = step === 'spl'
  const candidates = isSpl ? splCandidates : asplCandidates
  const pendingSelection = isSpl ? pendingSpl : pendingAspl
  const setPending = isSpl ? setPendingSpl : setPendingAspl
  const animClass = direction === 'right' ? 'animate-slideInRight' : 'animate-slideInLeft'

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8f9fc 0%, #eef2ff 100%)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={topBar}>
        <BoothBadge booth={session?.booth} />
        <button className="btn-ghost" onClick={logout} style={{ padding: '8px 16px', fontSize: '13px' }}>
          Sign Out
        </button>
      </div>

      {/* Progress */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <StepPill active={true} done={!isSpl} number={1} label="SPL" />
            <div style={{ flex: 1, height: '2px', background: isSpl ? 'var(--border)' : 'var(--accent)', borderRadius: '2px', transition: 'background 0.3s ease' }} />
            <StepPill active={!isSpl} done={false} number={2} label="ASPL" />
          </div>
          <p style={{ fontSize: '13px', color: 'var(--muted)', textAlign: 'center', marginTop: '4px' }}>
            Step {isSpl ? '1' : '2'} of 2
          </p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div className={animClass} style={{ width: '100%', maxWidth: '560px' }} key={step}>
          <div className="card" style={{ padding: '32px' }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{
                display: 'inline-block',
                background: 'var(--accent-light)',
                color: 'var(--accent)',
                fontSize: '12px',
                fontWeight: '700',
                letterSpacing: '0.8px',
                padding: '4px 10px',
                borderRadius: '6px',
              }}>
                {isSpl ? 'STUDENT PUPIL LEADER' : 'ASSISTANT STUDENT PUPIL LEADER'}
              </span>
            </div>

            <h2 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--foreground)', marginTop: '12px', letterSpacing: '-0.3px' }}>
              {isSpl ? 'Select your SPL candidate' : 'Now select your ASPL candidate'}
            </h2>

            {!isSpl && (
              <p style={{ marginTop: '6px', fontSize: '14px', color: 'var(--muted)' }}>
                SPL vote: <strong style={{ color: 'var(--accent)' }}>{selectedSpl}</strong>
              </p>
            )}

            {/* Candidate cards */}
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {candidates.map((candidate, i) => {
                const isSelected = pendingSelection === candidate.name
                return (
                  <button
                    key={candidate.id}
                    onClick={() => setPending(candidate.name)}
                    style={{
                      background: isSelected ? 'var(--accent)' : 'var(--card)',
                      border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: '14px',
                      padding: '20px 24px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      transition: 'all 0.18s ease',
                      transform: isSelected ? 'translateY(-2px)' : 'none',
                      boxShadow: isSelected ? '0 6px 20px rgba(99,102,241,0.25)' : 'none',
                    }}
                  >
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: isSelected ? 'rgba(255,255,255,0.25)' : 'var(--accent-light)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      fontWeight: '700', fontSize: '15px',
                      color: isSelected ? 'white' : 'var(--accent)',
                      transition: 'all 0.18s ease',
                    }}>
                      {String.fromCharCode(65 + i)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '17px', color: isSelected ? 'white' : 'var(--foreground)', transition: 'color 0.18s ease' }}>
                        {candidate.name}
                      </div>
                      <div style={{ fontSize: '13px', color: isSelected ? 'rgba(255,255,255,0.7)' : 'var(--muted)', marginTop: '2px', transition: 'color 0.18s ease' }}>
                        Candidate {i + 1}
                      </div>
                    </div>
                    {isSelected && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 12l2 2 4-4"/>
                        <circle cx="12" cy="12" r="9"/>
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Confirm button */}
            <button
              className="btn-primary"
              onClick={isSpl ? handleSplConfirm : handleAsplConfirm}
              disabled={!pendingSelection || submitting}
              style={{ marginTop: '20px', width: '100%', justifyContent: 'center', padding: '14px', fontSize: '15px' }}
            >
              {pendingSelection
                ? `Confirm: ${pendingSelection} →`
                : isSpl ? 'Select a candidate to continue' : 'Select a candidate to submit'}
            </button>

            {!isSpl && (
              <button
                className="btn-ghost"
                onClick={handleBack}
                style={{ marginTop: '10px', width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
                Back to SPL selection
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────

function BoothBadge({ booth }: { booth: number | null | undefined }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '32px', height: '32px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>
        </svg>
      </div>
      <span style={{ fontWeight: '700', fontSize: '15px', color: 'var(--foreground)' }}>Booth {booth}</span>
    </div>
  )
}

function StepPill({ active, done, number, label }: { active: boolean; done: boolean; number: number; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%',
        background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.3s ease',
        flexShrink: 0,
      }}>
        {done ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M5 12l4 4 9-9"/></svg>
        ) : (
          <span style={{ fontSize: '13px', fontWeight: '700', color: active ? 'white' : 'var(--muted)' }}>{number}</span>
        )}
      </div>
      <span style={{ fontSize: '13px', fontWeight: '600', color: active ? 'var(--foreground)' : 'var(--muted)' }}>{label}</span>
    </div>
  )
}

const fullScreen: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, #f8f9fc 0%, #eef2ff 100%)',
}

const topBar: React.CSSProperties = {
  padding: '16px 24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.8)',
  backdropFilter: 'blur(8px)',
  position: 'sticky' as const,
  top: 0,
  zIndex: 10,
  width: '100%',
}

const spinnerStyle: React.CSSProperties = {
  width: '48px',
  height: '48px',
  border: '4px solid var(--border)',
  borderTop: '4px solid var(--accent)',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
  margin: '0 auto',
}
