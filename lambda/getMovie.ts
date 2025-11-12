import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

// Handler returns a single movie by id
// Movies use keys: pk = m{movieId}, sk = "xxxx"
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // Log username and request path
  const rc: any = (event as any).requestContext;
  const username = rc?.authorizer?.username || rc?.authorizer?.principalId || "";
  const path = (event as any).rawPath || (event as any).path || "/";
  console.log(`${username} ${path}`);

  try {
    // Read and validate path parameter
    const movieIdStr = event.pathParameters?.movieId;
    const movieId = movieIdStr ? parseInt(movieIdStr) : undefined;
    if (!movieId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing movieId" }) };
    }

    // Get item by pk/sk
    const { Item } = await ddbDocClient.send(
      new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: `m${movieId}`, sk: "xxxx" },
    }));
    if (!Item) {
      return { statusCode: 404, body: JSON.stringify({ message: "Movie not found" }) };
    }
    // Return movie
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: Item }),
    };
  } catch (error: any) {
    console.error(error);
    return { statusCode: 500, body: JSON.stringify({ error }) };
  }
};

// Create a DynamoDB document client
function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  return DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true, convertClassInstanceToMap: true },
    unmarshallOptions: { wrapNumbers: false },
  });
}
