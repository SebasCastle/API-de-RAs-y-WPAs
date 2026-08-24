import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';

@Module({
  providers: [AuthService, SessionService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
