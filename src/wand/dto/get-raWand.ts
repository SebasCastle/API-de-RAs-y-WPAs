import { IsInt, IsPositive, IsString, Min, MinLength } from "class-validator";
export class getRaWand {
  @Min(1)
  @IsPositive()
  @IsInt()
  raNum!: number;

  @IsString()
  resNum!: string;

  @IsString()
  @MinLength(1)
  coverages!: string;

  @IsString()
  @MinLength(3)
  amtDueRateAmt!: string;

  @IsString()
  @Min(1)
  ldw!: string;

  @IsString()
  @Min(1)
  pai!: string;

  @IsString()
  @Min(1)
  pep!: string;

  @IsString()
  @Min(1)
  ali!: string;

  @IsString()
  @Min(1)
  qvDiEstTotal;

  @IsString()
  @Min(1)
  qvDiEstTotalClosed;
}
