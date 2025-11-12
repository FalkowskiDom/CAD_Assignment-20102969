import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import {
  CookieMap,
  createPolicy,
  JwtToken,
  parseCookies,
  verifyToken,
} from "./utils";

// Protected endpoint
// Requires a valid token cookie; otherwise returns an unauthorised message
export const handler: APIGatewayProxyHandlerV2 = async function (event: any) {
  console.log("[EVENT]", JSON.stringify(event));
  // Read cookies from request
  const cookies: CookieMap = parseCookies(event);
  if (!cookies) {
    return {
      statusCode: 200,
      body: "Unauthorised request!!",
    };
  }

  // Verify JWT with Cognito details
  const verifiedJwt: JwtToken = await verifyToken(
    cookies.token,
    process.env.USER_POOL_ID,
    process.env.REGION!
  );
  console.log(JSON.stringify(verifiedJwt));
  // Return a simple message on success
  return {
    statusCode: 200,
    body: "You received a super secret!!",
  };
};
