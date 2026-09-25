import { IsObject, IsOptional, IsString } from "class-validator";

export class WorkerFailureDto {
  @IsString()
  workerId!: string;

  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  step?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;
}
