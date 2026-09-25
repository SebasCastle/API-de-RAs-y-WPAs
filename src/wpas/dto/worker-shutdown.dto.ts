import { IsNumber, IsOptional, IsString } from "class-validator";

export class WorkerShutdownDto {
  @IsString()
  workerId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  idleSeconds?: number;
}
