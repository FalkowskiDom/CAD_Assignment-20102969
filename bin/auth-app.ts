#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MovieApiStack } from '../lib/movieApi-stack';

const app = new cdk.App();

new MovieApiStack(app, 'MovieApiStack', {
  env: { region: 'eu-west-1' },
});
