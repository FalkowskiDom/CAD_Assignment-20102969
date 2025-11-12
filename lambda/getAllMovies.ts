import { APIGatewayProxyHandlerV2  } from "aws-lambda";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

// Handler returns all movie items from the single table
// Movies use keys: pk starts with "m" and sk is "xxxx"
export const handler: APIGatewayProxyHandlerV2  = async (event) => {
  try {
    // Log username and request path for auditing
    const rc: any = (event as any).requestContext;
    const username = rc?.authorizer?.username || rc?.authorizer?.principalId || "";
    const path = (event as any).rawPath || (event as any).path || "/";
    console.log(`${username} ${path}`);

    // Scan table and filter only movie rows
    const commandOutput = await ddbDocClient.send(
      new ScanCommand({
        TableName: process.env.TABLE_NAME,
        FilterExpression: "begins_with(pk, :m) AND sk = :x",
        ExpressionAttributeValues: { ":m": "m", ":x": "xxxx" },
      })
    );
    // If none found return 404
    if (!commandOutput.Items) {
      return {
        statusCode: 404,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ Message: "Invalid movie Id" }),
      };
    }
    // Return list of movies
    const body = {
      data: commandOutput.Items,
    };

    // Return Response
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
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
