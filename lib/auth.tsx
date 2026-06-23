'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Session = {
  username: string
  booth: number | null // null for admin
  isAdmin: boolean
}

type AuthContextType = {
  session: Session | null
  login: (username: string, password: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const VALID_PASSWORD = 'BMIS1815$$#'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('election_session')
    if (stored) {
      try { setSession(JSON.parse(stored)) } catch {}
    }
  }, [])

  const login = (username: string, password: string): boolean => {
    if (password !== VALID_PASSWORD) return false

    let newSession: Session | null = null

    if (username === 'Admin') {
      newSession = { username: 'Admin', booth: null, isAdmin: true }
    } else {
      const match = username.match(/^VotingBooth([1-6])$/)
      if (!match) return false
      newSession = { username, booth: parseInt(match[1]), isAdmin: false }
    }

    setSession(newSession)
    sessionStorage.setItem('election_session', JSON.stringify(newSession))
    return true
  }

  const logout = () => {
    setSession(null)
    sessionStorage.removeItem('election_session')
  }

  return (
    <AuthContext.Provider value={{ session, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
