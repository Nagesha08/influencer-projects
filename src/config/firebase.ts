import fs from "node:fs";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import "dotenv/config";

type FirebaseServiceAccount = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function normalizePrivateKey(value?: string) {
  if (!value) {
    return undefined;
  }

  return value.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
}

function loadFirebaseServiceAccount(): FirebaseServiceAccount | null {
  const directJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (directJson) {
    try {
      const parsed = JSON.parse(directJson) as FirebaseServiceAccount;

      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: normalizePrivateKey(parsed.private_key),
        };
      }
    } catch {
      // fall through to file-path and individual env-var formats below
    }
  }

  const filePath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    process.env.FIREBASE_CREDENTIALS_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(fileContent) as FirebaseServiceAccount;

      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: normalizePrivateKey(parsed.private_key),
        };
      }
    } catch {
      // fall through to the legacy env-variable format below
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey,
    };
  }

  return null;
}

export function getFirebaseAdmin() {
  const serviceAccount = loadFirebaseServiceAccount();

  if (!serviceAccount) {
    return null;
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id!,
        clientEmail: serviceAccount.client_email!,
        privateKey: serviceAccount.private_key!,
      }),
    });
  }

  return getAuth();
}

export async function verifyFirebaseToken(token: string) {
  const firebaseAuth = getFirebaseAdmin();

  if (!firebaseAuth) {
    throw new Error(
      "Firebase Admin is not configured. Set one of these in backend/.env: FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_SERVICE_ACCOUNT_PATH, or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY."
    );
  }

  return firebaseAuth.verifyIdToken(token);
}
