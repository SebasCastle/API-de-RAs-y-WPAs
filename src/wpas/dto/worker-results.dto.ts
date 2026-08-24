import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class WorkerResultDto {
  @IsString()
  reservation!: string;

  @IsBoolean()
  success!: boolean;

  @IsString()
  status!: string;

  @IsString()
  wpa!: string;

  @IsString()
  message!: string;

  @IsOptional()
  attempts?: number;
}

export class WorkerResultsDto {
  @IsOptional()
  @IsObject()
  worker?: Record<string, string>;

  @IsOptional()
  @IsObject()
  stats?: Record<string, number>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkerResultDto)
  results!: WorkerResultDto[];
}
