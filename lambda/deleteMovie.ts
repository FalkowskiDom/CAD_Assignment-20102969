import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

// Handler deletes a movie item by id
// Movies use keys: pk = m{id}, sk = "xxxx"
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // Log username and path
  const rc: any = (event as any).requestContext;
  const username = rc?.authorizer?.username || rc?.authorizer?.principalId || "";
  const path = (event as any).rawPath || (event as any).path || "/";
  console.log(`${username} ${path}`);

  try {
    // Read movieId from path
    const movieIdStr = event.pathParameters?.movieId;
    const movieId = movieIdStr ? parseInt(movieIdStr) : undefined;
    if (!movieId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing movieId" }) };
    }

    // Delete item; return 404 if not found
    const result = await ddbDocClient.send(
      new DeleteCommand({
        TableName: process.env.TABLE_NAME,
        Key: { pk: `m${movieId}`, sk: "xxxx" },
        ReturnValues: "ALL_OLD",
      })
    );

    if (!result.Attributes) {
      return { statusCode: 404, body: JSON.stringify({ message: "Movie not found" }) };
    }

    // No content on success
    return { statusCode: 204, body: "" };
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
