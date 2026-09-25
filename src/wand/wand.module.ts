import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WandController } from "./wand.controller";
import { WandRentalService } from "./WandRental.service";
import { WandRA } from "./entities/wand.entity";
import { AuthModule } from "./auth/auth.module";

@Module({
  controllers: [WandController],
  providers: [WandRentalService],
  imports: [AuthModule, TypeOrmModule.forFeature([WandRA])],
  exports: [WandRentalService],
})
export class WandModule {}
