import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { WandRentalService } from './WandRental.service';

@Controller('wand')
export class WandController {
  constructor(private readonly wandService: WandRentalService) {}

  @Post('login')
  login() {
    return this.wandService.login();
  }

  @Get(':ra')
  findOne(@Param('ra') ra: string) {
    return this.wandService.findOne(ra);
  }
  // @Get('res/:res')
  // findRes(@Param('res') res: string) {
  //   return this.wandService.findRes(res);
  // }

  @Delete(':ra')
  remove(@Param('ra', ParseMongoIdPipe) ra: string) {
    return this.wandService.remove(ra);
  }
}
