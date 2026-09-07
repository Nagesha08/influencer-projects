import { verifyFirebaseToken } from "../config/firebase.js";
import { pool } from "../config/db.js";
export function createRequireAuth(database, verifyToken) {
    return async function requireAuth(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                res.status(401).json({
                    status: "error",
                    message: "Missing or invalid Authorization header",
                });
                return;
            }
            const token = authHeader.replace("Bearer ", "").trim();
            if (!token) {
                res.status(401).json({
                    status: "error",
                    message: "Missing Firebase ID token",
                });
                return;
            }
            const decodedToken = await verifyToken(token);
            const firebaseUid = decodedToken.uid;
            if (!firebaseUid) {
                res.status(401).json({
                    status: "error",
                    message: "Firebase user identity missing",
                });
                return;
            }
            const result = await database.query(`
        SELECT id, firebase_uid, email, role, created_at
        FROM users
        WHERE firebase_uid = $1
        LIMIT 1
      `, [firebaseUid]);
            const user = result.rows[0];
            if (!user) {
                res.status(401).json({
                    status: "error",
                    message: "User not found in PostgreSQL for this Firebase account",
                });
                return;
            }
            req.user = user;
            next();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Authentication failed";
            res.status(401).json({
                status: "error",
                message: "Invalid or expired Firebase token",
                details: message,
            });
        }
    };
}
export const requireAuth = createRequireAuth(pool, verifyFirebaseToken);
export function requireRole(...allowedRoles) {
    return function authorizeRole(req, res, next) {
        if (!req.user) {
            res.status(401).json({
                status: "error",
                message: "Authentication required",
            });
            return;
        }
        if (!allowedRoles.includes(req.user.role)) {
            res.status(403).json({
                status: "error",
                message: "Insufficient permissions for this resource",
            });
            return;
        }
        next();
    };
}
