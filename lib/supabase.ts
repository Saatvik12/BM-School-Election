import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Candidate = {
  id: number
  position: 'SPL' | 'ASPL'
  name: string
  display_order: number
  active: boolean
}

export type Vote = {
  id: number
  booth: number
  spl: string
  aspl: string
  created_at: string
}

export type BoothStatus = {
  booth: number
  last_seen: string
}

export type ElectionSettings = {
  id: number
  voting_open: boolean
}
