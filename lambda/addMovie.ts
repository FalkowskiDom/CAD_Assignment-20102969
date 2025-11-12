import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    // Print Event
    console.log("[EVENT]", JSON.stringify(event));
    const body = event.body ? JSON.parse(event.body) : undefined;
    if (!body) {
      return {
        statusCode: 500,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: "Missing request body" }),
      };
    }

    const id = Number(body.id);
    const title = String(body.title || "").trim();
    const overview = typeof body.overview === "string" ? body.overview : undefined;
    const release_date = typeof body.release_date == "string" ? body.release_date : undefined;
    const year = body.year != undefined ? Number(body.year) : undefined;

    if (!(Number.isFinite(id) && title)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Missing required fields: id, title" }),
      };
    }

    const item: Record<string, any> = { pk: `m${id}`, sk: "xxxx", id, title };
    if (overview) item.overview = overview;
    if (release_date) item.release_date = release_date;
    if (Number.isFinite(year as number)) item.year = year;

    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
    return {
      statusCode: 201,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ data: item }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    if (error && error.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Movie already exists" }),
      };
    }
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
