// Auth API construct
// - Provisions a standalone API Gateway REST API for auth flows
// - Exposes /auth endpoints backed by Lambda functions (signup, confirm, signin, signout)
// - Injects Cognito config via env vars to each Lambda
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";

// Props required to configure the auth service API
// - userPoolId and userPoolClientId are passed to auth lambdas
type AuthApiProps = {
  userPoolId: string;
  userPoolClientId: string;
};

export class AuthApi extends Construct {
  // Base resource /auth under the REST API
  private auth: apig.IResource;
  private userPoolId: string;
  private userPoolClientId: string;

  constructor(scope: Construct, id: string, props: AuthApiProps) {
    super(scope, id);

    ({ userPoolId: this.userPoolId, userPoolClientId: this.userPoolClientId } =
      props);

    // REST API hosting Cognito-related endpoints
    const api = new apig.RestApi(this, "AuthServiceApi", {
      description: "Authentication Service RestApi",
      endpointTypes: [apig.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apig.Cors.ALL_ORIGINS,
      },
    });

    // /auth base resource
    this.auth = api.root.addResource("auth");

    // Routes: /auth/signup, /auth/confirm_signup, /auth/signout, /auth/signin
    this.addAuthRoute("signup", "POST", "SignupFn", "signup.ts");

    this.addAuthRoute(
      "confirm_signup",
      "POST",
      "ConfirmFn",
      "confirm-signup.ts"
    );

    this.addAuthRoute("signout", "GET", "SignoutFn", "signout.ts");
    this.addAuthRoute("signin", "POST", "SigninFn", "signin.ts");
  }

  // Helper to add an auth route with consistent Lambda settings
  private addAuthRoute(
    resourceName: string,
    method: string,
    fnName: string,
    fnEntry: string
  ): void {
    // Common function settings applied to all auth lambdas
    const commonFnProps = {
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      runtime: lambda.Runtime.NODEJS_16_X,
      handler: "handler",
      environment: {
        USER_POOL_ID: this.userPoolId,
        CLIENT_ID: this.userPoolClientId,
        REGION: cdk.Aws.REGION,
      },
    };

    // Create child resource and wire Lambda integration
    const resource = this.auth.addResource(resourceName);

    const fn = new node.NodejsFunction(this, fnName, {
      ...commonFnProps,
      entry: `${__dirname}/../../lambda/auth/${fnEntry}`,
    });

    resource.addMethod(method, new apig.LambdaIntegration(fn));
  }
}
