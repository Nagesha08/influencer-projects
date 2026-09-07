import express, { type Express } from "express";
import cors from "cors";
import { requireRole, createRequireAuth, type AuthDatabase, type AuthenticatedRequest, type UserRole } from "./middleware/auth.js";
import { validateCommonProfile, validateInfluencerProfile } from "./validation.js";

type TokenVerifier = Parameters<typeof createRequireAuth>[1];
const onboardingRoles: UserRole[] = ["manager", "user", "influencer"];

export function createApp(database: AuthDatabase, verifyToken: TokenVerifier): Express {
  const app = express();
  const requireAuth = createRequireAuth(database, verifyToken);
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok", service: "backend", timestamp: new Date().toISOString() }));
  app.get("/health/db", async (_req, res) => {
    try {
      await database.query("SELECT 1");
      res.status(200).json({ status: "ok", database: "postgresql", message: "PostgreSQL connection successful" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error";
      res.status(500).json({ status: "error", database: "postgresql", message: "PostgreSQL connection failed", details: message });
    }
  });
  app.get("/api/test-db", async (_req, res) => {
    try {
      const result = await database.query("SELECT NOW() as now");
      res.status(200).json({ status: "ok", serverTime: result.rows[0]?.now });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown database error";
      res.status(500).json({ status: "error", message: "Database query failed", details: message });
    }
  });
  app.get("/api/me", requireAuth, (req: AuthenticatedRequest, res) => res.status(200).json({ status: "ok", user: req.user }));
  app.get("/api/resources", requireAuth, (_req, res) => res.status(200).json({ status: "ok", resource: "normal-resource" }));
  app.get("/api/admin/users", requireAuth, requireRole("admin"), (_req, res) => {
    res.status(200).json({ status: "ok", resource: "user-management" });
  });
  app.get("/api/manager/resources", requireAuth, requireRole("admin", "manager"), (_req, res) => {
    res.status(200).json({ status: "ok", resource: "assigned-resource-management" });
  });

  app.get("/api/onboarding/me", requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      res.status(401).json({ status: "error", message: "Authentication required" });
      return;
    }
    if (req.user?.role === "admin") {
      res.status(200).json({ status: "ok", applicable: false, completed: true });
      return;
    }
    const common = await database.query("SELECT first_name, last_name, phone, timezone, completed_at FROM user_profiles WHERE user_id = $1", [req.user?.id]);
    const influencerProfile = req.user.role === "influencer"
      ? (await database.query("SELECT * FROM influencer_profiles WHERE user_id = $1", [req.user.id])).rows[0]
      : undefined;
    res.status(200).json({
      status: "ok",
      applicable: true,
      completed: Boolean(common.rows[0]?.completed_at && (req.user.role !== "influencer" || influencerProfile?.completed_at)),
      profile: common.rows[0] ?? null,
      influencerProfile: influencerProfile ?? null,
    });
  });

  app.put("/api/onboarding/me/profile", requireAuth, requireRole(...onboardingRoles), async (req: AuthenticatedRequest, res) => {
    const error = validateCommonProfile(req.body);
    if (error) { res.status(400).json({ status: "error", message: error }); return; }
    const { first_name, last_name, phone = null, timezone = null } = req.body;
    const result = await database.query(
      `INSERT INTO user_profiles (user_id, first_name, last_name, phone, timezone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name, phone = EXCLUDED.phone, timezone = EXCLUDED.timezone,
         completed_at = NOW(), updated_at = NOW()
       RETURNING first_name, last_name, phone, timezone, completed_at`,
      [req.user?.id, first_name.trim(), last_name.trim(), phone, timezone]
    );
    res.status(200).json({ status: "ok", profile: result.rows[0] });
  });

  app.put("/api/onboarding/me/influencer", requireAuth, requireRole("influencer"), async (req: AuthenticatedRequest, res) => {
    const error = validateInfluencerProfile(req.body);
    if (error) { res.status(400).json({ status: "error", message: error }); return; }
    const values = req.body;
    const result = await database.query(
      `INSERT INTO influencer_profiles
       (user_id, display_name, bio, niche, instagram_url, tiktok_url, youtube_url, x_url,
        facebook_url, website_url, location, follower_count, engagement_rate, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name,
         bio = EXCLUDED.bio, niche = EXCLUDED.niche, instagram_url = EXCLUDED.instagram_url,
         tiktok_url = EXCLUDED.tiktok_url, youtube_url = EXCLUDED.youtube_url, x_url = EXCLUDED.x_url,
         facebook_url = EXCLUDED.facebook_url, website_url = EXCLUDED.website_url,
         location = EXCLUDED.location, follower_count = EXCLUDED.follower_count,
         engagement_rate = EXCLUDED.engagement_rate, completed_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [req.user?.id, values.display_name.trim(), values.bio ?? null, values.niche.trim(),
        values.instagram_url ?? null, values.tiktok_url ?? null, values.youtube_url ?? null,
        values.x_url ?? null, values.facebook_url ?? null, values.website_url ?? null,
        values.location ?? null, values.follower_count ?? null, values.engagement_rate ?? null]
    );
    res.status(200).json({ status: "ok", influencerProfile: result.rows[0] });
  });

  app.get("/api/influencers", requireAuth, async (_req, res) => {
    const result = await database.query(
      `SELECT id, display_name, bio, niche, instagram_url, tiktok_url, youtube_url,
              x_url, facebook_url, website_url, location, follower_count, engagement_rate
       FROM influencer_profiles ORDER BY display_name ASC`
    );
    res.status(200).json({ status: "ok", influencers: result.rows });
  });

  app.patch("/api/admin/users/:id/role", requireAuth, requireRole("admin"), async (req: AuthenticatedRequest, res) => {
    const requestedRole = req.body?.role;
    const validRoles: UserRole[] = ["admin", "manager", "user", "influencer"];
    if (!validRoles.includes(requestedRole)) { res.status(400).json({ status: "error", message: "Invalid role. Role must be admin, manager, user, or influencer" }); return; }
    if (String(req.user?.id) === req.params.id) { res.status(400).json({ status: "error", message: "Users cannot change their own role" }); return; }
    const result = await database.query("UPDATE users SET role = $1 WHERE id = $2 RETURNING id, firebase_uid, email, role, created_at", [requestedRole, req.params.id]);
    if (!result.rows[0]) { res.status(404).json({ status: "error", message: "User not found" }); return; }
    res.status(200).json({ status: "ok", user: result.rows[0] });
  });

  return app;
}