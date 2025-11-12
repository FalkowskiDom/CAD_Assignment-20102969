import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { AuthApi } from './constructs/auth-api'
import { AppApi } from './constructs/app-api'
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as custom from "aws-cdk-lib/custom-resources";
import { marshall } from "@aws-sdk/util-dynamodb";
import { movies, movieCasts, awards } from "../seed/movies";

export class MovieApiStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new UserPool(this, "UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolId = userPool.userPoolId;

    const appClient = userPool.addClient("AppClient", {
      authFlows: { userPassword: true },
    });

    const userPoolClientId = appClient.userPoolClientId;

    new AuthApi(this, 'AuthServiceApi', {
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
    });

    // Single-table for app data
    const singleTable = new dynamodb.Table(this, "AppSingleTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new AppApi(this, 'AppApi', {
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
      table: singleTable,
      castTable: singleTable,
    });

    // Seed data into single table
    const movieSeedBatch = movies.map((m) => ({
      PutRequest: {
        Item: marshall({
          pk: `m${m.id}`,
          sk: "xxxx",
          id: m.id,
          title: m.title,
          overview: (m as any).overview,
          release_date: (m as any).release_date,
        }),
      },
    }));

    const castSeedBatch = movieCasts.map((c) => ({
      PutRequest: {
        Item: marshall({
          pk: `c${c.movieId}`,
          sk: String((c as any).actorId),
          movieId: c.movieId,
          actorId: (c as any).actorId,
          actorName: c.actorName,
          roleName: c.roleName,
          roleDescription: c.roleDescription,
        }),
      },
    }));

    const awardSeedBatch = awards.map((a) => ({
      PutRequest: {
        Item: marshall({
          pk: `w${(a as any).movieId ?? (a as any).actorId}`,
          sk: a.body,
          awardId: `w${(a as any).movieId ?? (a as any).actorId}-${a.body}-${a.year}`,
          category: a.category,
          year: a.year,
          ...(('movieId' in a && (a as any).movieId != null) ? { movieId: (a as any).movieId } : {}),
          ...(('actorId' in a && (a as any).actorId != null) ? { actorId: (a as any).actorId } : {}),
        }),
      },
    }));

    new custom.AwsCustomResource(this, `SeedMoviesBatch`, {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [singleTable.tableName]: movieSeedBatch,
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of(`SeedMoviesBatch-v1`),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [singleTable.tableArn],
      }),
    });

    new custom.AwsCustomResource(this, `SeedCastsBatch`, {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [singleTable.tableName]: castSeedBatch,
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of(`SeedCastsBatch-v2`),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [singleTable.tableArn],
      }),
    });

    new custom.AwsCustomResource(this, `SeedAwardsBatch`, {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [singleTable.tableName]: awardSeedBatch,
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of(`SeedAwardsBatch-v1`),
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [singleTable.tableArn],
      }),
    });

    // Stream logger for state changes
    const logFn = new node.NodejsFunction(this, "StateChangeLoggerFn", {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      entry: `${__dirname}/../lambda/logStateChange.ts`,
      environment: { REGION: cdk.Aws.REGION },
    });
    logFn.addEventSource(new sources.DynamoEventSource(singleTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 25,
      retryAttempts: 2,
    }));
  }
}
