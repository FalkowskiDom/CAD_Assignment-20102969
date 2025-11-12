import { APIGatewayRequestAuthorizerHandler } from "aws-lambda";
import { CookieMap, createPolicy, parseCookies, verifyToken } from "../utils";

// API Gateway request authorizer
// Reads token cookie, verifies it, and returns an Allow/Deny policy
export const handler: APIGatewayRequestAuthorizerHandler = async (event) => {
  console.log("[EVENT]", event);

  // Parse cookies from request
  const cookies: CookieMap = parseCookies(event);

  if (!cookies) {
    return {
      principalId: "",
      policyDocument: createPolicy(event, "Deny"),
      context: { username: "" },
    };
  }

  // Verify JWT token against Cognito
  const verifiedJwt = await verifyToken(
    cookies.token,
    process.env.USER_POOL_ID,
    process.env.REGION!
  );

  // Build response policy and context (username)
  return {
    principalId: verifiedJwt ? verifiedJwt.sub!.toString() : "",
    policyDocument: createPolicy(event, verifiedJwt ? "Allow" : "Deny"),
    context: {
      username: verifiedJwt?.email || verifiedJwt?.sub || "",
    },
  };
};

