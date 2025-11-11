import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const rc: any = (event as any).requestContext;
  let username = "";
  if (rc && rc.authorizer && rc.authorizer.username) {
    username = rc.authorizer.username;
  } else if (rc && rc.authorizer && rc.authorizer.principalId) {
    username = rc.authorizer.principalId;
  }
  let path = "/";
  if ((event as any).rawPath) {
    path = (event as any).rawPath;
  } else if ((event as any).path) {
    path = (event as any).path;
  }
  console.log(`${username} ${path}`);

  try {
    const movieIdStr = event.pathParameters && event.pathParameters.movieId;
    const movieId = movieIdStr ? parseInt(movieIdStr) : NaN;
    if (!Number.isFinite(movieId)) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing movieId" }) };
    }

    const { Items } = await ddbDocClient.send(
      new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: {
          ":pk": `c${movieId}`,
        },
      })
    );

    const data = Items && Items.length > 0 ? Items : [];
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data }),
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

