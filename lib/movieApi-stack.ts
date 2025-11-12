import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { AuthApi } from './constructs/auth-api'
import {AppApi } from './constructs/app-api'
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as custom from "aws-cdk-lib/custom-resources";
import { marshall } from "@aws-sdk/util-dynamodb";
import { movies, movieCasts } from "../seed/movies";

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
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new AppApi(this, 'AppApi', {
      userPoolId: userPoolId,
      userPoolClientId: userPoolClientId,
      table: singleTable,
      castTable: singleTable,
    });
  }
}
