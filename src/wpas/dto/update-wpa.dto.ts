import { PartialType } from "@nestjs/mapped-types";
import { CreateWpaDto } from "./create-wpa.dto";

export class UpdateWpaDto extends PartialType(CreateWpaDto) {}
