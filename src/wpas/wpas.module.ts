import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { WpaJob, WpaJobSchema } from "./entities/wpa-job.entity";
import { WPA, WpaSchema } from "./entities/wpa.entity";
import { WpaWorker, WpaWorkerSchema } from "./entities/wpa-worker.entity";
import { WpaController } from "./wpas.controller";
import { WpasService } from "./wpas.service";
import { WorkerActivationService } from "./worker-activation.service";
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WPA.name, schema: WpaSchema },
      { name: WpaJob.name, schema: WpaJobSchema },
      { name: WpaWorker.name, schema: WpaWorkerSchema },
    ]),
  ],
  controllers: [WpaController],
  providers: [WpasService, WorkerActivationService],
  exports: [WpasService],
})
export class WpasModule {}
