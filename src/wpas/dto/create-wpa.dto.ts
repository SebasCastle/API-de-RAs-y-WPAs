import { IsString, Min } from "class-validator";

export class CreateWpaDto {
  @Min(11)
  @IsString()
  Reservation!: number;
  @IsString()
  WPA!: string;
}
