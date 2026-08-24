import { Module } from "@nestjs/common";
import { WandController } from "./wand.controller";
import { WandRentalService } from "./WandRental.service";
import { MongooseModule } from "@nestjs/mongoose";
import { WandRA, WandSchema } from "./entities/wand.entity";
import { AuthModule } from "./auth/auth.module";

@Module({
  controllers: [WandController],
  providers: [WandRentalService],
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      {
        name: WandRA.name,
        schema: WandSchema,
      },
    ]),
  ],
  exports: [WandRentalService, MongooseModule],
})
export class WandModule {}
