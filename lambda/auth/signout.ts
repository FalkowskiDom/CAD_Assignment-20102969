import { APIGatewayProxyResult } from "aws-lambda";

// Handler signs the user out
// Clears the auth cookie by setting it expired in the past
exports.handler = async function (): Promise<APIGatewayProxyResult> {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Origin": "*",
      "Set-Cookie":
        "token=x; SameSite=None; Secure; HttpOnly; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;",
    },
    body: JSON.stringify({
      message: "Signout successfull",
    }),
  };
};
