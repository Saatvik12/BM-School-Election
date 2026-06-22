'use client'

import { useAuth } from '@/lib/auth'
import dynamic from 'next/dynamic'

const LoginScreen = dynamic(() => import('@/components/LoginScreen'), { ssr: false })
const VotingBooth = dynamic(() => import('@/components/VotingBooth'), { ssr: false })
const AdminDashboard = dynamic(() => import('@/components/AdminDashboard'), { ssr: false })

export default function Home() {
  const { session } = useAuth()

  if (!session) return <LoginScreen />
  if (session.isAdmin) return <AdminDashboard />
  return <VotingBooth />
}
