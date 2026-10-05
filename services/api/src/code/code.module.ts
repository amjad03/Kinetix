import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { CodeController } from './code.controller.js';
import { CodeRunnerClient, HttpCodeRunner, NoCodeRunner } from './code-runner.client.js';

/** The code lab's server side: C, C++ and Java on the code runner (services/code-runner). */
@Module({
  providers: [
    {
      provide: CodeRunnerClient,
      inject: [ENV],
      useFactory: (env: Env) => (env.CODE_RUNNER_URL ? new HttpCodeRunner(env.CODE_RUNNER_URL, env.CODE_RUNNER_TOKEN, env.CODE_RUNNER_TIMEOUT_MS) : new NoCodeRunner()),
    },
  ],
  controllers: [CodeController],
})
export class CodeModule {}
