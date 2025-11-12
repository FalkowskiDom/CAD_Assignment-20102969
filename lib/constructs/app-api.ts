// App API construct
// - Provisions the main API Gateway REST API for application routes
// - Configures a request authorizer that reads the Cookie header
// - Wires Lambda functions for movies, cast, and awards using a single DynamoDB table
import { Aws } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

// Props passed into the AppApi construct
// - Cognito user pool info for the custom authorizer Lambda
// - Single-table used for movies, cast, and awards
type AppApiProps = {
  userPoolId: string;
  userPoolClientId: string;
  table: dynamodb.ITable;
  castTable: dynamodb.ITable;
};

export class AppApi extends Construct {
  constructor(scope: Construct, id: string, props: AppApiProps) {
    super(scope, id);

    // Public REST API for app operations
    const appApi = new apig.RestApi(this, "AppApi", {
      description: "App RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    // Common Lambda settings for all app handlers
    const appCommonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: props.userPoolId,
        CLIENT_ID: props.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    // Example public/protected endpoints (used for testing auth)
    const protectedRes = appApi.root.addResource("protected");

    const publicRes = appApi.root.addResource("public");

    // Lambda handlers for public/protected endpoints
    const protectedFn = new node.NodejsFunction(this, "ProtectedFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/protected.ts`,
    });

    const publicFn = new node.NodejsFunction(this, "PublicFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/public.ts`,
    });

    // Request authorizer backed by a lambda that validates Cognito JWT from cookie
    // Custom request authorizer: extracts username from session cookie
    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/auth/authorizer.ts`,
    });

    // Wire authorizer to use Cookie header as identity source
    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

    protectedRes.addMethod("GET", new apig.LambdaIntegration(protectedFn));

    publicRes.addMethod("GET", new apig.LambdaIntegration(publicFn));

    // API key for admin (used by POST/DELETE routes)
    const apiKey = new apig.ApiKey(this, "AdminApiKey", {
      apiKeyName: "admin-api-key",
    });
    const plan = new apig.UsagePlan(this, "AdminUsagePlan", {
      name: "admin-plan",
      throttle: { rateLimit: 10, burstLimit: 2 },
    });
    plan.addApiKey(apiKey);
    plan.addApiStage({ stage: appApi.deploymentStage });

    // Resources per spec
    // /movies, /movies/{movieId}, /movies/{movieId}/actors, /movies/{movieId}/actors/{actorId}, /awards
    const movies = appApi.root.addResource("movies");
    const movie = movies.addResource("{movieId}");
    const actors = movie.addResource("actors");
    const actor = actors.addResource("{actorId}");
    const awards = appApi.root.addResource("awards");

    // Lambdas for single-table operations (DynamoDB table name/region injected via env)
    const env = { TABLE_NAME: props.table.tableName, REGION: cdk.Aws.REGION } as Record<string,string>;

    // Read a single movie by id (pk=m{movieId}, sk="xxxx")
    const getMovieFn = new node.NodejsFunction(this, "GetMovieFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getMovie.ts`,
      environment: env,
    });
    props.table.grantReadData(getMovieFn);

    // Read cast member details for a movie/actor pair
    const getCastMemberFn = new node.NodejsFunction(this, "GetMovieCastMemberFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getMovieCastMembers.ts`,
      environment: env,
    });
    props.table.grantReadData(getCastMemberFn);

    // List actors for a movie
    const getActorsFn = new node.NodejsFunction(this, "GetActorsFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getActors.ts`,
      environment: env,
    });
    props.table.grantReadData(getActorsFn);

    // Get awards by movie/actor/awardBody query params
    const getAwardsFn = new node.NodejsFunction(this, "GetAwardsFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getAwards.ts`,
      environment: env,
    });
    props.table.grantReadData(getAwardsFn);

    // List all movies (scan limited to movie items)
    const getAllMoviesFn = new node.NodejsFunction(this, "GetAllMoviesFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getAllMovies.ts`,
      environment: env,
    });
    props.table.grantReadData(getAllMoviesFn);

    // Create a movie item (conditional put)
    const addMovieFn = new node.NodejsFunction(this, "AddMovieFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/addMovie.ts`,
      environment: env,
    });
    props.table.grantWriteData(addMovieFn);

    // Delete a movie item by id
    const deleteMovieFn = new node.NodejsFunction(this, "DeleteMovieFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/deleteMovie.ts`,
      environment: env,
    });
    props.table.grantWriteData(deleteMovieFn);

    // Methods and auth (GET routes require custom authorizer, admin routes require API key)
    movie.addMethod("GET", new apig.LambdaIntegration(getMovieFn), {
      authorizer: requestAuthorizer,
      authorizationType: apig.AuthorizationType.CUSTOM,
    });
    actor.addMethod("GET", new apig.LambdaIntegration(getCastMemberFn), {
      authorizer: requestAuthorizer,
      authorizationType: apig.AuthorizationType.CUSTOM,
    });
    actors.addMethod("GET", new apig.LambdaIntegration(getActorsFn), {
      authorizer: requestAuthorizer,
      authorizationType: apig.AuthorizationType.CUSTOM,
    });
    awards.addMethod("GET", new apig.LambdaIntegration(getAwardsFn), {
      authorizer: requestAuthorizer,
      authorizationType: apig.AuthorizationType.CUSTOM,
    });
    movies.addMethod("GET", new apig.LambdaIntegration(getAllMoviesFn), {
      authorizer: requestAuthorizer,
      authorizationType: apig.AuthorizationType.CUSTOM,
    });
    movies.addMethod("POST", new apig.LambdaIntegration(addMovieFn), {
      apiKeyRequired: true,
    });
    movie.addMethod("DELETE", new apig.LambdaIntegration(deleteMovieFn), {
      apiKeyRequired: true,
    });
  }
}

