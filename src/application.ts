import {AuthenticationComponent, registerAuthenticationStrategy} from '@loopback/authentication';
import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RestApplication} from '@loopback/rest';
import {RestExplorerBindings, RestExplorerComponent} from '@loopback/rest-explorer';
import path from 'path';
import {JwtAuthenticationStrategy} from './auth/jwt.strategy';
import {runMigrations} from './migrate';
import {DbService} from './services/db.service';
import {MaintenanceService} from './services/maintenance.service';
import {OtpService} from './services/otp.service';
import {createSmsProvider, SMS_PROVIDER} from './services/sms.service';
import {SyncService} from './services/sync.service';
import {TokenService} from './services/token.service';
import {UserService} from './services/user.service';

export class SyriaOmApiApplication extends BootMixin(RestApplication) {
  constructor(options: ApplicationConfig = {}) {
    super(options);

    this.api({
      openapi: '3.0.0',
      info: {title: 'Syria Organic Maps API', version: '0.1.0'},
      paths: {},
    });

    this.component(RestExplorerComponent);
    this.configure(RestExplorerBindings.COMPONENT).to({path: '/explorer'});

    this.component(AuthenticationComponent);
    registerAuthenticationStrategy(this, JwtAuthenticationStrategy);

    this.service(DbService);
    this.service(TokenService);
    this.service(OtpService);
    this.service(UserService);
    this.service(SyncService);
    this.service(MaintenanceService);
    this.bind(SMS_PROVIDER).to(createSmsProvider());

    this.static('/admin', path.join(__dirname, '../../public/admin'));

    this.projectRoot = __dirname;
    this.bootOptions = {
      controllers: {dirs: ['controllers'], extensions: ['.controller.js'], nested: true},
    };

    this.onStop(async () => {
      const maintenance = await this.get<MaintenanceService>('services.MaintenanceService');
      maintenance.stopTimer();
      const db = await this.get<DbService>('services.DbService');
      await db.close();
    });
  }

  async migrateAndSeed(): Promise<void> {
    const db = await this.get<DbService>('services.DbService');
    const applied = await runMigrations(db.pool);
    if (applied.length) console.log('Applied migrations:', applied.join(', '));
    const users = await this.get<UserService>('services.UserService');
    await users.seedAdmin();
    const maintenance = await this.get<MaintenanceService>('services.MaintenanceService');
    await maintenance.start();
  }
}
