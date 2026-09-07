import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "./app.js";
import type { AuthDatabase, UserRole } from "./middleware/auth.js";

const users: Record<string, { id: number; firebase_uid: string; email: string; role: UserRole; created_at: string }> = {
  manager: { id: 1, firebase_uid: "manager", email: "manager@example.com", role: "manager", created_at: "2026-01-01T00:00:00Z" },
  user: { id: 2, firebase_uid: "user", email: "user@example.com", role: "user", created_at: "2026-01-01T00:00:00Z" },
  influencer: { id: 3, firebase_uid: "influencer", email: "influencer@example.com", role: "influencer", created_at: "2026-01-01T00:00:00Z" },
  admin: { id: 4, firebase_uid: "admin", email: "admin@example.com", role: "admin", created_at: "2026-01-01T00:00:00Z" },
};

function createTestApp() {
  const queries: Array<{ text: string; values?: unknown[] }> = [];
  const database: AuthDatabase = {
    async query(text, values) {
      queries.push({ text, values });
      if (text.includes("FROM users")) {
        return { rows: [users[String(values?.[0])] ?? null].filter(Boolean) };
      }
      if (text.includes("FROM influencer_profiles ORDER BY")) {
        return { rows: [{ id: 10, display_name: "Creator", niche: "Tech", instagram_url: "https://instagram.com/creator" }] };
      }
      if (text.includes("FROM user_profiles")) return { rows: [] };
      if (text.includes("FROM influencer_profiles")) return { rows: [] };
      if (text.includes("INSERT INTO user_profiles")) return { rows: [{ first_name: "Ada", last_name: "Lovelace", completed_at: "2026-01-01T00:00:00Z" }] };
      if (text.includes("INSERT INTO influencer_profiles")) return { rows: [{ display_name: "Creator", niche: "Tech", completed_at: "2026-01-01T00:00:00Z" }] };
      return { rows: [] };
    },
  };
  const verifyToken = (async (token: string) => ({ uid: token })) as Parameters<typeof createApp>[1];
  return { app: createApp(database, verifyToken), queries };
}

test("requires a Firebase bearer token", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/influencers");
  assert.equal(response.status, 401);
});

test("rejects a verified Firebase user missing from PostgreSQL", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/influencers").set("Authorization", "Bearer unknown");
  assert.equal(response.status, 401);
});

test("allows all authenticated roles to list influencers", async () => {
  for (const role of ["admin", "manager", "user", "influencer"] as const) {
    const { app } = createTestApp();
    const response = await request(app).get("/api/influencers").set("Authorization", `Bearer ${role}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.influencers[0].instagram_url, "https://instagram.com/creator");
  }
});

test("does not allow admins to submit onboarding", async () => {
  const { app } = createTestApp();
  const response = await request(app).put("/api/onboarding/me/profile")
    .set("Authorization", "Bearer admin")
    .send({ first_name: "Ada", last_name: "Lovelace" });
  assert.equal(response.status, 403);
});

test("enforces role access for influencer onboarding", async () => {
  const { app } = createTestApp();
  const response = await request(app).put("/api/onboarding/me/influencer")
    .set("Authorization", "Bearer user")
    .send({ display_name: "Creator", niche: "Tech", instagram_url: "https://instagram.com/creator" });
  assert.equal(response.status, 403);
});

test("rejects client-supplied ownership fields", async () => {
  const { app, queries } = createTestApp();
  const response = await request(app).put("/api/onboarding/me/profile")
    .set("Authorization", "Bearer user")
    .send({ user_id: 1, first_name: "Ada", last_name: "Lovelace" });
  assert.equal(response.status, 400);
  assert.equal(queries.filter((query) => query.text.includes("INSERT INTO user_profiles")).length, 0);
});

test("validates required influencer fields and social URLs", async () => {
  const { app } = createTestApp();
  const response = await request(app).put("/api/onboarding/me/influencer")
    .set("Authorization", "Bearer influencer")
    .send({ display_name: "Creator", niche: "Tech", instagram_url: "javascript:alert(1)" });
  assert.equal(response.status, 400);
});

test("upserts common onboarding using the authenticated database user id", async () => {
  const { app, queries } = createTestApp();
  const response = await request(app).put("/api/onboarding/me/profile")
    .set("Authorization", "Bearer manager")
    .send({ first_name: "Ada", last_name: "Lovelace" });
  assert.equal(response.status, 200);
  const write = queries.find((query) => query.text.includes("INSERT INTO user_profiles"));
  assert.deepEqual(write?.values, [1, "Ada", "Lovelace", null, null]);
});

test("completes user onboarding for the authenticated user id", async () => {
  const { app, queries } = createTestApp();
  const response = await request(app).put("/api/onboarding/me/profile")
    .set("Authorization", "Bearer user")
    .send({ first_name: "Grace", last_name: "Hopper", phone: "555-0100", timezone: "UTC" });

  assert.equal(response.status, 200);
  assert.equal(response.body.profile.completed_at, "2026-01-01T00:00:00Z");
  const write = queries.find((query) => query.text.includes("INSERT INTO user_profiles"));
  assert.deepEqual(write?.values, [2, "Grace", "Hopper", "555-0100", "UTC"]);
});

test("completes manager onboarding", async () => {
  const { app } = createTestApp();
  const response = await request(app).put("/api/onboarding/me/profile")
    .set("Authorization", "Bearer manager")
    .send({ first_name: "Katherine", last_name: "Johnson" });

  assert.equal(response.status, 200);
  assert.equal(response.body.profile.completed_at, "2026-01-01T00:00:00Z");
});

test("completes influencer common and influencer onboarding for the authenticated user id", async () => {
  const { app, queries } = createTestApp();
  const commonResponse = await request(app).put("/api/onboarding/me/profile")
    .set("Authorization", "Bearer influencer")
    .send({ first_name: "Maya", last_name: "Chen" });
  const influencerResponse = await request(app).put("/api/onboarding/me/influencer")
    .set("Authorization", "Bearer influencer")
    .send({
      display_name: "Maya Creates",
      niche: "Technology",
      bio: "Technology creator",
      instagram_url: "https://instagram.com/mayacreates",
      follower_count: 12000,
      engagement_rate: 4.5,
    });

  assert.equal(commonResponse.status, 200);
  assert.equal(influencerResponse.status, 200);
  assert.equal(commonResponse.body.profile.completed_at, "2026-01-01T00:00:00Z");
  assert.equal(influencerResponse.body.influencerProfile.completed_at, "2026-01-01T00:00:00Z");
  const write = queries.find((query) => query.text.includes("INSERT INTO influencer_profiles"));
  assert.equal(write?.values?.[0], 3);
  assert.equal(write?.values?.[4], "https://instagram.com/mayacreates");

  const statusResponse = await request(app).get("/api/onboarding/me")
    .set("Authorization", "Bearer influencer");
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.body.applicable, true);
});

test("reports admin onboarding as not applicable", async () => {
  const { app } = createTestApp();
  const response = await request(app).get("/api/onboarding/me").set("Authorization", "Bearer admin");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok", applicable: false, completed: true });
});