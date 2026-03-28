Set-Location C:\vantro

# Creates 3 new API routes needed by the admin mobile screens:
# GET /api/admin/jobs
# GET /api/admin/signins
# GET /api/admin/alerts + POST dismiss
# GET /api/admin/team

New-Item -ItemType Directory -Force -Path "app\api\admin\jobs" | Out-Null
New-Item -ItemType Directory -Force -Path "app\api\admin\signins" | Out-Null
New-Item -ItemType Directory -Force -Path "app\api\admin\alerts" | Out-Null
New-Item -ItemType Directory -Force -Path "app\api\admin\team" | Out-Null

# ─── /api/admin/jobs ─────────────────────────────────────────
@'
import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const service = await createServiceClient()
  const { data: u } = await service.from("users").select("company_id, role").eq("auth_user_id", user.id).single()
  if (!u || !["admin","foreman"].includes(u.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: jobs } = await service.from("jobs").select("*").eq("company_id", u.company_id).order("created_at", { ascending: false })
  return NextResponse.json({ jobs: jobs || [] })
}
'@ | Set-Content "app\api\admin\jobs\route.ts" -Encoding UTF8

# ─── /api/admin/signins ──────────────────────────────────────
@'
import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const service = await createServiceClient()
  const { data: u } = await service.from("users").select("company_id, role").eq("auth_user_id", user.id).single()
  if (!u || !["admin","foreman"].includes(u.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const today = new Date(); today.setHours(0,0,0,0)
  const { data: signins } = await service.from("signins")
    .select("*, users(name, initials), jobs(name, address)")
    .eq("company_id", u.company_id)
    .gte("signed_in_at", today.toISOString())
    .is("signed_out_at", null)
    .order("signed_in_at", { ascending: false })
  return NextResponse.json({ signins: signins || [] })
}
'@ | Set-Content "app\api\admin\signins\route.ts" -Encoding UTF8

# ─── /api/admin/alerts ───────────────────────────────────────
@'
import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const service = await createServiceClient()
  const { data: u } = await service.from("users").select("company_id, role").eq("auth_user_id", user.id).single()
  if (!u || !["admin","foreman"].includes(u.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: alerts } = await service.from("alerts")
    .select("*, jobs(name)")
    .eq("company_id", u.company_id)
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(20)
  return NextResponse.json({ alerts: alerts || [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const service = await createServiceClient()
  const { data: u } = await service.from("users").select("company_id, role").eq("auth_user_id", user.id).single()
  if (!u || !["admin","foreman"].includes(u.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { action, id } = await request.json()
  if (action === "dismiss") {
    await service.from("alerts").update({ is_read: true }).eq("id", id).eq("company_id", u.company_id)
  }
  return NextResponse.json({ success: true })
}
'@ | Set-Content "app\api\admin\alerts\route.ts" -Encoding UTF8

# ─── /api/admin/team ─────────────────────────────────────────
@'
import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const service = await createServiceClient()
  const { data: u } = await service.from("users").select("company_id, role").eq("auth_user_id", user.id).single()
  if (!u || !["admin","foreman"].includes(u.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const { data: members } = await service.from("users").select("*").eq("company_id", u.company_id).order("name")
  return NextResponse.json({ members: members || [] })
}
'@ | Set-Content "app\api\admin\team\route.ts" -Encoding UTF8

Write-Host "Admin API routes created" -ForegroundColor Green

git add app\api\admin\
git commit -m "Add admin API routes for mobile app (jobs, signins, alerts, team)"
git push origin master

Write-Host "Pushed to GitHub - Vercel will deploy." -ForegroundColor Cyan
