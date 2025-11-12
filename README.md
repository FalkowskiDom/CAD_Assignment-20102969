## Assignment - Cloud App Development.

__Name:__ Dominik Falkowski

### Links.
__Demo:__ A link to your YouTube video demonstration.

### Screenshots.

AppApi.png


DynamoDBTable.png

[A screenshot from CloudWatch logs showing an example of User Activity logging, e.g.

jbloggs /awards?movie=1234&awardBody=Academy
]

### Design features (if required).
Resources: /movies, /movies/{movieId}, /movies/{movieId}/actors, /movies/{movieId}/actors/{actorId}, /awards.
Adds a custom request authorizer (Lambda) reading the Cookie header.
Applies API key protection to admin routes (POST/DELETE).
Seeding with AwsCustomResource

###  Extra (If relevant).

[ State any other aspects of your solution that use CDK/serverless features not covered in the lectures.]

### References.
AI prompts.md
https://serverlessland.com/patterns/dynamodb-seed-data-on-create-cdk