import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

// Handler creates a new movie in the single table
// Movies use keys: pk = m{id}, sk = "xxxx"
export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    // Print Event
    console.log("[EVENT]", JSON.stringify(event));
    // Parse JSON body
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

    // Extract and validate fields
    const id = Number(body.id);
    const title = String(body.title || "").trim();
    const overview = typeof body.overview == "string" ? body.overview : undefined;
    const release_date = typeof body.release_date == "string" ? body.release_date : undefined;
    const year = body.year != undefined ? Number(body.year) : undefined;

    // Input validation
    if (!(Number.isFinite(id) && title)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Missing required fields: id, title" }),
      };
    }

    // Build single-table item with correct keys
    const item: Record<string, any> = { pk: `m${id}`, sk: "xxxx", id, title };
    if (overview) item.overview = overview;
    if (release_date) item.release_date = release_date;
    if (Number.isFinite(year as number)) item.year = year;

    // Conditional put to prevent overwriting existing item
    await ddbDocClient.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
    // Return Created
    return {
      statusCode: 201,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ data: item }),
    };
  } catch (error: any) {
    console.log(JSON.stringify(error));
    // Conflict if movie already exists
    if (error && error.name === "ConditionalCheckFailedException") {
      return {
        statusCode: 409,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: "Movie already exists" }),
      };
    }
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
