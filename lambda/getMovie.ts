import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const username = (event.requestContext?.authorizer as any)?.username || (event.requestContext?.authorizer as any)?.principalId || "";
  const path = (event as any).rawPath || (event as any).path || "/";
  console.log(`${username} ${path}`);

  try {
    const movieIdStr = event.pathParameters?.movieId;
    const movieId = movieIdStr ? parseInt(movieIdStr) : undefined;
    if (!movieId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing movieId" }) };
    }

    const { Item } = await ddbDocClient.send(new GetCommand({
      TableName: process.env.TABLE_NAME,
      Key: { pk: `m${movieId}`, sk: "xxxx" },
    }));
    if (!Item) {
      return { statusCode: 404, body: JSON.stringify({ message: "Movie not found" }) };
    }
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

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  return DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true, convertClassInstanceToMap: true },
    unmarshallOptions: { wrapNumbers: false },
  });
}
