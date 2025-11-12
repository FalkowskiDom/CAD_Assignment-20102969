import { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";

// Handler logs DynamoDB stream state changes to CloudWatch
// It prints a short line describing the action and key details
export const handler = async (event: DynamoDBStreamEvent) => {
  try {
    for (const record of event.Records) {
      const action = record.eventName; // INSERT | MODIFY | REMOVE
      if (action == "INSERT") {
        const newItem = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : undefined;
        console.log(`POST + ${formatItem(newItem)}`);
      } else if (action == "REMOVE") {
        const oldItem = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage as any) : undefined;
        console.log(`DELETE ${formatItem(oldItem)}`);
      } else if (action == "MODIFY") {
        const oldItem = record.dynamodb?.OldImage ? unmarshall(record.dynamodb.OldImage as any) : undefined;
        const newItem = record.dynamodb?.NewImage ? unmarshall(record.dynamodb.NewImage as any) : undefined;
        console.log(`MODIFY ${formatItem(oldItem)} -> ${formatItem(newItem)}`);
      }
    }
  } catch (err) {
    console.error("[STATE-LOGGER-ERROR]", err);
  }
};

// Format a few important attributes for compact logs
function formatItem(item: any): string {
  if (!item) return "<undefined>";
  const parts: string[] = [];
  if (item.pk) parts.push(String(item.pk));
  if (item.sk) parts.push(String(item.sk));
  if (item.title) parts.push(String(item.title));
  if (item.release_date) parts.push(String(item.release_date));
  if (item.overview) parts.push(String(item.overview));
  if (item.category) parts.push(String(item.category));
  if (item.year) parts.push(String(item.year));
  return parts.join(" | ") || JSON.stringify(item);
}
