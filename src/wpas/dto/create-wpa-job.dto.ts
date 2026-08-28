import { IsArray, IsIn, IsOptional, IsString } from "class-validator";
export class CreateWpaJobDto {
  @IsOptional() @IsIn(["FILE", "HTTP"]) source?: "FILE" | "HTTP";
  @IsOptional() @IsArray() @IsString({ each: true }) reservations?: string[];
}
