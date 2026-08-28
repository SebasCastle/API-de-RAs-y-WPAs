import { IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { WorkerStatus } from "../entities/wpa-worker.entity";
export class WorkerHeartbeatDto {
  @IsString() workerId!: string;
  @IsOptional() @IsIn(Object.values(WorkerStatus)) status?: WorkerStatus;
  @IsOptional() @IsString() jobId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, string>;
}
