// netlify/functions/desmosKey.js
var JSON_HEADERS = { "Content-Type": "application/json" };
exports.handler = async function(event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey: process.env.DESMOS_API_KEY || "" })
  };
};
//# sourceMappingURL=desmosKey.js.map
