import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WpaJob } from "./entities/wpa-job.entity";
import { WPA } from "./entities/wpa.entity";
import { WpaWorker } from "./entities/wpa-worker.entity";
import { WpaWorkerLog } from "./entities/wpa-worker-log.entity";
import { WpaController } from "./wpas.controller";
import { WpasService } from "./wpas.service";
import { WorkerActivationService } from "./worker-activation.service";
import { AwsService } from "./aws/aws-service";

@Module({
  imports: [TypeOrmModule.forFeature([WPA, WpaJob, WpaWorker, WpaWorkerLog])],
  controllers: [WpaController],
  providers: [WpasService, WorkerActivationService, AwsService],
  exports: [WpasService],
})
export class WpasModule {}
