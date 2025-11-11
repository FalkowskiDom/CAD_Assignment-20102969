import { Aws } from "aws-cdk-lib";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

type AppApiProps = {
  userPoolId: string;
  userPoolClientId: string;
  table: dynamodb.ITable;
};

export class AppApi extends Construct {
  constructor(scope: Construct, id: string, props: AppApiProps) {
    super(scope, id);

    const appApi = new apig.RestApi(this, "AppApi", {
      description: "App RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

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

    const protectedRes = appApi.root.addResource("protected");

    const publicRes = appApi.root.addResource("public");

    const protectedFn = new node.NodejsFunction(this, "ProtectedFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/protected.ts`,
    });

    const publicFn = new node.NodejsFunction(this, "PublicFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/public.ts`,
    });

    const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/auth/authorizer.ts`,
    });

    const requestAuthorizer = new apig.RequestAuthorizer(
      this,
      "RequestAuthorizer",
      {
        identitySources: [apig.IdentitySource.header("cookie")],
        handler: authorizerFn,
        resultsCacheTtl: cdk.Duration.minutes(0),
      }
    );

    protectedRes.addMethod("GET", new apig.LambdaIntegration(protectedFn), {
      authorizer: requestAuthorizer,
      authorizationType: apig.AuthorizationType.CUSTOM,
    });

    publicRes.addMethod("GET", new apig.LambdaIntegration(publicFn));

    // API key for admin (POST/DELETE)
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
    const movies = appApi.root.addResource("movies");
    const movie = movies.addResource("{movieId}");
    const actors = movie.addResource("actors");
    const actor = actors.addResource("{actorId}");
    const awards = appApi.root.addResource("awards");

    // Lambdas for single-table operations
    const env = { TABLE_NAME: props.table.tableName, REGION: cdk.Aws.REGION } as Record<string,string>;

    const getMovieFn = new node.NodejsFunction(this, "GetMovieFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getMovie.ts`,
      environment: env,
    });
    props.table.grantReadData(getMovieFn);

    const getCastMemberFn = new node.NodejsFunction(this, "GetMovieCastMemberFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getMovieCastMembers.ts`,
      environment: env,
    });
    props.table.grantReadData(getCastMemberFn);

    const getActorsFn = new node.NodejsFunction(this, "GetActorsFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getActors.ts`,
      environment: env,
    });
    props.table.grantReadData(getActorsFn);

    const getAwardsFn = new node.NodejsFunction(this, "GetAwardsFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/getAwards.ts`,
      environment: env,
    });
    props.table.grantReadData(getAwardsFn);

    const addMovieFn = new node.NodejsFunction(this, "AddMovieFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/addMovie.ts`,
      environment: env,
    });
    props.table.grantWriteData(addMovieFn);

    const deleteMovieFn = new node.NodejsFunction(this, "DeleteMovieFn", {
      ...appCommonFnProps,
      entry: `${__dirname}/../../lambda/deleteMovie.ts`,
      environment: env,
    });
    props.table.grantWriteData(deleteMovieFn);

    // Methods and auth
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

    movies.addMethod("POST", new apig.LambdaIntegration(addMovieFn), {
      apiKeyRequired: true,
    });
    movie.addMethod("DELETE", new apig.LambdaIntegration(deleteMovieFn), {
      apiKeyRequired: true,
    });
  }
}
