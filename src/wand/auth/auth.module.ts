import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SessionService } from "./session.service";
import { WandCredentialStore } from "./wand-credential-store.service";
import { WandPasswordRotationService } from "./wand-password-rotation.service";

@Module({
  providers: [
    AuthService,
    SessionService,
    WandCredentialStore,
    WandPasswordRotationService,
  ],
  exports: [
    AuthService,
    SessionService,
    WandCredentialStore,
    WandPasswordRotationService,
  ],
})
export class AuthModule {}
