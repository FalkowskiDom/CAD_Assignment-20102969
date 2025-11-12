// CDK stack for the Movie API
// - Provisions Cognito (User Pool + App Client)
// - Provisions a single DynamoDB table (pk/sk) and enables stream
// - Deploys two API Gateway constructs: AuthApi and AppApi
// - Seeds movies, casts, and awards via Custom Resources
// - Adds a DynamoDB Stream Lambda to log state changes
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
    // Cognito User Pool for authentication
    const userPool = new UserPool(this, "UserPool", {
      signInAliases: { username: true, email: true },
      selfSignUpEnabled: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolId = userPool.userPoolId;
    // App client for username/password auth
    const appClient = userPool.addClient("AppClient", {
      authFlows: { userPassword: true },
    });

    const userPoolClientId = appClient.userPoolClientId;

    // Auth API (signup, confirm, signin, signout)
    new AuthApi(this, 'AuthServiceApi', {
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
    });

    // Single-table for app data (entities share pk/sk)
    // pk: m{movieId}|c{movieId}|w{movieId|actorId}, sk varies by entity
    const singleTable = new dynamodb.Table(this, "AppSingleTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Application API (movies, actors, awards; custom authorizer + API key)
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
          adult: m.adult,
          backdrop_path: m.backdrop_path,
          genre_ids: m.genre_ids,
          id: m.id,
          original_language: m.original_language,
          original_title: m.original_title,
          overview: m.overview,
          popularity: m.popularity,
          poster_path: m.poster_path,
          release_date: m.release_date,
          title: m.title,
          video: m.video,
          vote_average: m.vote_average,
          vote_count: m.vote_count,
          pk: `m${m.id}`,
          sk: "xxxx",
        }),
      },
    }));

    // Cast items: pk=c{movieId}, sk={actorId}
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

    // Award items: pk=w{movieId|actorId}, sk={awardBody}
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

    // Custom resource: batch write movie seed items
    // Update physicalResourceId to force re-seeding on stack updates
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

    // Custom resource: batch write cast seed items
    // Bump physicalResourceId suffix when changing the seed set
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

    // Custom resource: batch write award seed items
    // Bump physicalResourceId suffix to force re-run when seed changes
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

    // Stream logger for state changes (DynamoDB Streams -> Lambda)
    const logFn = new node.NodejsFunction(this, "StateChangeLoggerFn", {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      entry: `${__dirname}/../lambda/logStateChange.ts`,
      environment: { REGION: cdk.Aws.REGION },
    });
    // Subscribe the logger to the table's stream
    logFn.addEventSource(new sources.DynamoEventSource(singleTable, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 25,
      retryAttempts: 2,
    }));
  }
}
