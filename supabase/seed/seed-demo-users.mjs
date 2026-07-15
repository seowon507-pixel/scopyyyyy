#!/usr/bin/env node
import { DEMO_USERS } from "./demo-data.mjs";

const apply = process.argv.includes("--apply");

function printAccounts() {
  console.log("scopy demo accounts");
  DEMO_USERS.forEach((user) => {
    console.log(`- ${user.persona} / ${user.targetRole}`);
    console.log(`  email: ${user.email}`);
    console.log(`  password: ${user.password}`);
  });
}

async function request(url, serviceKey, path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = text; }
  }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : data?.message || data?.msg;
    throw new Error(`${response.status} ${detail || response.statusText}`);
  }
  return data;
}

async function listUsers(url, serviceKey) {
  const result = await request(url, serviceKey, "/auth/v1/admin/users?page=1&per_page=1000");
  return Array.isArray(result?.users) ? result.users : [];
}

async function ensureUser(url, serviceKey, demo, existingUsers) {
  const existing = existingUsers.find((user) => user.email?.toLowerCase() === demo.email.toLowerCase());
  const body = {
    email: demo.email,
    password: demo.password,
    email_confirm: true,
    user_metadata: {
      display_name: demo.displayName,
      persona: demo.persona,
      target_role: demo.targetRole,
      is_demo: true,
    },
  };
  if (existing) {
    await request(url, serviceKey, `/auth/v1/admin/users/${existing.id}`, { method: "PUT", body: JSON.stringify(body) });
    return existing.id;
  }
  const created = await request(url, serviceKey, "/auth/v1/admin/users", { method: "POST", body: JSON.stringify(body) });
  return created.id;
}

async function upsertWorkspace(url, serviceKey, userId, payload) {
  await request(url, serviceKey, "/rest/v1/user_workspaces?on_conflict=user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, payload }),
  });
}

async function main() {
  printAccounts();
  if (!apply) {
    console.log("\nDry run only. Use --apply with administrator environment variables to create the accounts.");
    return;
  }

  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const existingUsers = await listUsers(url, serviceKey);
  for (const demo of DEMO_USERS) {
    const userId = await ensureUser(url, serviceKey, demo, existingUsers);
    await upsertWorkspace(url, serviceKey, userId, demo.payload);
    console.log(`seeded: ${demo.email} (${userId})`);
  }
  console.log("Demo users and workspaces are ready.");
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
