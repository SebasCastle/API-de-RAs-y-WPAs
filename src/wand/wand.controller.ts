import { Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { WandRentalService } from "./WandRental.service";

@Controller("wand")
export class WandController {
  constructor(private readonly wandService: WandRentalService) {}

  @Post("login")
  login() {
    return this.wandService.login();
  }

  @Get("password/rotation-status")
  getPasswordRotationStatus() {
    return this.wandService.getPasswordRotationStatus();
  }

  @Post("password/rotate")
  rotatePassword(@Query("force") force?: string) {
    return this.wandService.rotatePassword(force === "true");
  }

  @Get(":ra")
  findOne(@Param("ra") ra: string) {
    return this.wandService.findOne(ra);
  }
  // @Get('res/:res')
  // findRes(@Param('res') res: string) {
  //   return this.wandService.findRes(res);
  // }

  @Delete(":ra")
  remove(@Param("ra") ra: string) {
    return this.wandService.remove(ra);
  }
}
