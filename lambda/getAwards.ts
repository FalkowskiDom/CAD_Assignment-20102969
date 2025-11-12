import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // Extract username and path from event
  const rc: any = (event as any).requestContext;
  const username = rc?.authorizer?.username || rc?.authorizer?.principalId || "";
  const path = (event as any).rawPath || (event as any).path || "/";
  console.log(`${username} ${path}`);

  try {
    // Read query params: movie, actor, awardBody
    const qs = event.queryStringParameters || {};
    const movieStr = qs.movie;
    const actorStr = qs.actor;
    const awardBody = qs.awardBody;

    // Validate which params are provided
    const hasMovie = typeof movieStr == "string" && movieStr.trim() != "";
    const hasActor = typeof actorStr == "string" && actorStr.trim() != "";
    const hasBody = typeof awardBody == "string" && awardBody.trim() != "";

    // Require at least one of movie or actor to be provided
    if (!(hasMovie || hasActor)) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Invalid Award Id" }),
      };
    }

    // Collect results from one or both queries
    const results: any[] = [];

    if (hasMovie) {
      // Query awards for a movie: pk = w{movieId}, optional body filter on sk
      const movieId = parseInt(movieStr!);
      const exprVals: Record<string, any> = { ":pk": `w${movieId}` };
      let keyCond = "pk = :pk";
      if (hasBody) {
        keyCond += " AND sk = :sk";
        exprVals[":sk"] = awardBody;
      }
      const out = await ddbDocClient.send(new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: keyCond,
        ExpressionAttributeValues: exprVals,
      }));
      if (out.Items) results.push(...out.Items);
    }

    if (hasActor) {
      // Query awards for an actor: pk = w{actorId}, optional body filter on sk
      const actorId = parseInt(actorStr!);
      const exprVals: Record<string, any> = { ":pk": `w${actorId}` };
      let keyCond = "pk = :pk";
      if (hasBody) {
        keyCond += " AND sk = :sk";
        exprVals[":sk"] = awardBody;
      }
      const out = await ddbDocClient.send(new QueryCommand({
        TableName: process.env.TABLE_NAME,
        KeyConditionExpression: keyCond,
        ExpressionAttributeValues: exprVals,
      }));
      if (out.Items) results.push(...out.Items);
    }

    // Return all matched awards
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: results }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ error }),
    };
  }
};

// Create a DynamoDB document client
function createDDbDocClient() {
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