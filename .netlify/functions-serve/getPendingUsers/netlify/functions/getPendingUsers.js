// netlify/functions/getPendingUsers.js
var admin = require("firebase-admin");
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    })
  });
}
var JSON_HEADERS = { "Content-Type": "application/json" };
async function requireDev(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw { statusCode: 401, message: "Missing Authorization header" };
  const decoded = await admin.auth().verifyIdToken(token, true);
  if (decoded.role !== "dev" || decoded.status !== "active") {
    throw { statusCode: 403, message: "Dev access required" };
  }
  return decoded;
}
exports.handler = async function(event) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    await requireDev(event);
    const pending = [];
    let nextPageToken;
    do {
      const page = await admin.auth().listUsers(1e3, nextPageToken);
      page.users.forEach((u) => {
        const claims = u.customClaims || {};
        if (claims.status === "pending") {
          pending.push({
            uid: u.uid,
            email: u.email || "",
            displayName: u.displayName || "",
            requestedRole: claims.role || "student",
            requestedAt: claims.requestedAt || u.metadata.creationTime
          });
        }
      });
      nextPageToken = page.pageToken;
    } while (nextPageToken);
    pending.sort((a, b) => new Date(a.requestedAt) - new Date(b.requestedAt));
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ pending }) };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message || "Unexpected server error" }) };
  }
};
//# sourceMappingURL=getPendingUsers.js.map
