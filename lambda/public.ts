import { APIGatewayProxyHandlerV2 } from "aws-lambda";

// Public endpoint
// Does not require authentication
export const handler = async function (event: any) {
	return {
		statusCode: 200,
		body: 'Unauthenticated access allowed', // simple message
	};
};
