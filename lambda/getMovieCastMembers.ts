import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

// Handler returns a cast member for a movie
// Requires movieId and actorId
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    // Log event for debugging
    const rc: any = (event as any).requestContext;
    const username = rc?.authorizer?.username || rc?.authorizer?.principalId || "";
    const path = (event as any).rawPath || (event as any).path || "/";
    console.log(`${username} ${path}`);

    // Parse the movie id and actor id
    const movieIdStr = event.pathParameters?.movieId;
    const actorIdStr = event.pathParameters?.actorId;
    const movieId = movieIdStr ? parseInt(movieIdStr) : undefined;
    const actorId = actorIdStr ? parseInt(actorIdStr) : undefined;

    // Validate movieId and actorId
    if (!(movieId && actorId)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Missing movieId or actorId" }),
      };
    }

    // Query DynamoDB for the cast member
    const { Item } = await ddbDocClient.send(
      new GetCommand({
        TableName: process.env.TABLE_NAME,
        Key: { pk: `c${movieId}`, sk: String(actorId) },
      })
    );

    // If the cast member is not found, return 404
    if (!Item) {
      return { statusCode: 404, body: JSON.stringify({ message: "Cast member not found" }) };
    }

    // Return the cast member
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ data: Item }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    // Unexpected error
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error }),
    };
  }
};

function createDocumentClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
