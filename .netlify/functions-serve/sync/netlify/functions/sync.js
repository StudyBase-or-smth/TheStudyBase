// netlify/functions/sync.js
var JSON_HEADERS = { "Content-Type": "application/json" };
exports.handler = async function() {
  return {
    statusCode: 410,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: "This endpoint has been disabled. See comments in netlify/functions/sync.js." })
  };
};
//# sourceMappingURL=sync.js.map
