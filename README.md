# 🗳️ Election System — Setup Guide

A real-time digital voting system built with Next.js + Supabase.

---

## Stack
- **Frontend:** Next.js 15 (App Router) + TypeScript
- **Backend/DB:** Supabase (Postgres + Realtime)
- **Deployment:** Vercel

---

## Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open **SQL Editor** and paste the entire contents of `supabase-setup.sql`
3. Click **Run** — this creates all tables, policies, and seed data
4. Go to **Database → Replication** and enable Realtime for:
   - `votes`
   - `booth_status`
   - `election_settings`
5. Go to **Project Settings → API** and copy your Project URL and anon key

---

## Step 2 — Edit Candidate Names

In Supabase **Table Editor**, open the `candidates` table and update names to your actual candidates. No code changes needed.

---

## Step 3 — Deploy to Vercel

1. Push this repo to GitHub
2. Go to vercel.com → New Project → Import your repo
3. Add these Environment Variables in Vercel:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
4. Deploy

---

## Step 4 — Election Day

Log into each laptop:
- Booth 1: VotingBooth1 / BMIS1815$$$
- Booth 2: VotingBooth2 / BMIS1815$$$
- (etc. up to VotingBooth6)

Admin: Admin / BMIS1815$$$

Open the election from Admin Dashboard → Settings → Open Election.

---

## Features

- Real-time vote sync (Supabase Realtime)
- SPL → ASPL slide animation voting flow
- Booth heartbeat monitor
- Open/Close election (instant effect on all booths)
- Live results with bar charts
- Booth-wise breakdown table
- CSV export
- Audible beep on vote
- Auto-reset after 3 seconds
- Immutable votes (append-only)
- Two-step reset protection

## Local Dev

cp .env.local.example .env.local
npm install
npm run dev
