import { IsIn, IsObject, IsOptional, IsString } from "class-validator";
import { WpaLogLevel } from "../entities/wpa-worker-log.entity";

export class WorkerLogDto {
  @IsString()
  source!: string;

  @IsIn(Object.values(WpaLogLevel))
  level!: WpaLogLevel;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  workerId?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
