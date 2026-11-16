import {ApplicationConfig} from '@loopback/core';
import {SyriaOmApiApplication} from './application';
import {config} from './config';

export async function main(options: ApplicationConfig = {}): Promise<SyriaOmApiApplication> {
  const app = new SyriaOmApiApplication(options);
  await app.boot();
  await app.migrateAndSeed();
  await app.start();
  console.log(`Syria OM API listening at ${app.restServer.url}`);
  return app;
}

if (require.main === module) {
  main({
    rest: {
      port: config.port,
      host: '0.0.0.0',
      gracePeriodForClose: 5000,
      openApiSpec: {setServersFromRequest: true},
    },
  }).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
