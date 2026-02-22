import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let firebaseApp: App | null = null;
let firebaseAuth: Auth | null = null;

export function getFirebaseAdmin() {
  if (firebaseApp && firebaseAuth) {
    return { app: firebaseApp, auth: firebaseAuth };
  }

  if (getApps().length > 0) {
    firebaseApp = getApps()[0];
    firebaseAuth = getAuth(firebaseApp);
    return { app: firebaseApp, auth: firebaseAuth };
  }

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccount) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is missing");
  }

  let serviceAccountJson: object;
  try {
    serviceAccountJson = JSON.parse(serviceAccount);
  } catch {
    serviceAccountJson = require(serviceAccount);
  }

  firebaseApp = initializeApp({
    credential: cert(serviceAccountJson),
  });
  firebaseAuth = getAuth(firebaseApp);
  return { app: firebaseApp, auth: firebaseAuth };
}
