import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { WPA, WpaSchema } from "./entities/wpa.entity";
import { WpaController } from "./wpa.controller";
import { WpasService } from "./wpa.service";

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: WPA.name,
        schema: WpaSchema,
      },
    ]),
  ],
  controllers: [WpaController],
  providers: [WpasService],
  exports: [WpasService],
})
export class WpasModule {}
