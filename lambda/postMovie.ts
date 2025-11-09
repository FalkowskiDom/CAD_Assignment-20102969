import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const rc: any = (event as any).requestContext;
  const username = rc?.authorizer?.username || rc?.authorizer?.principalId || "";
  const path = (event as any).rawPath || (event as any).path || "/";
  console.log(`${username} ${path}`);

  try {
    if (!event.body) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      return { statusCode: 400, headers, body: JSON.stringify({ message: "Missing body" }) };
    }

    let data: any;
    try {
      data = JSON.parse(event.body);
    } catch {
      const headers: Record<string, string> = { "content-type": "application/json" };
      return { statusCode: 400, headers, body: JSON.stringify({ message: "Invalid JSON body" }) };
    }

    const id = Number(data.id);
    const title = String(data.title ?? "").trim();
    const year = Number(data.year);

    if (!(Number.isFinite(id) && title && Number.isFinite(year))) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      return { statusCode: 400, headers, body: JSON.stringify({ message: "Missing required fields: id, title, year" }) };
    }

    const item = { pk: `m${id}`, sk: "xxxx", id, title, year };

    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );

    const headers: Record<string, string> = { "content-type": "application/json", Location: `/movies/${id}` };
    return { statusCode: 201, headers, body: JSON.stringify({ data: item }) };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (error && (error as any).name == "ConditionalCheckFailedException") {
      return { statusCode: 409, headers, body: JSON.stringify({ message: "Movie already exists" }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error }) };
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