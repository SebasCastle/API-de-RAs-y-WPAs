/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WandRA } from './entities/wand.entity';
import { AuthService } from './auth/auth.service';
import { SessionService } from './auth/session.service';
import { RA } from './interface/ra.interface';
import { RentalMapper } from './mapper/RentalMapper';

@Injectable()
export class WandRentalService {
  constructor(
    @InjectModel(WandRA.name)
    private readonly wandRaModel: Model<WandRA>,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  //verificar el login de wand, si no esta logueado, loguear y guardar el agentId en la session
  login() {
    return this.authService.login();
  }


  //buscar y obtener el RA desde WAND
  async findOne(ra: string): Promise<RA> {
    const agentId = this.sessionService.getAgentId();
    if (!agentId) {
      
      await this.login();
    }
    // await this.authService.ensureLogin();

    const body = new URLSearchParams({
      raNo: ra,
      wizardNo: '',
      discountNo: '',
      haveCustInfo: 'false',
      fromCache: 'false',
    });

    // Realizar la solicitud POST a WAND con los parámetros y encabezados necesarios
    const response = await this.sessionService
      .getClient()
      .post<RA>('/wand/rental', body.toString(), {
        params: {
          brand: 'Avis',
          brandCode: 'A',
          agentId,
          selectedModule: 'DISPLAY-RENTAL',
          stationMnemonic: this.sessionService.getStation(),
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
      });

    if (!response.data) {
      // throw new BadGatewayException(
      //   'WAND devolvió una respuesta rental vacía.',
      // );
      return response.data;
    }
      const RA = RentalMapper.toDomain(response.data);
      const existingRA = await this.wandRaModel.findOne({
        raNum: response.data.rentalData.raNum,
      });
      if (!existingRA) {
        await this.wandRaModel.create(RA.rentalData);
      }

      return RA;
  }

  // async findRes(res: string){
  //   const agentId = this.sessionService.getAgentId();
  //   if (!agentId) {
  //     await this.login();
  //   }
  //   await this.authService.ensureLogin();

  // }


  async remove(_id: string): Promise<void> {
    const { deletedCount } = await this.wandRaModel.deleteOne({ _id });

    if (deletedCount === 0) {
      throw new BadRequestException(`RA with id "${_id}" not found`);
    }
  }

  private handleExcepotions (error: any){
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if(error.code === 11000){
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            throw new NotFoundException(`The RA exist in db ${ JSON.stringify(error.keyValue) }`)
          }
          console.error(error);
          throw new InternalServerErrorException(`Review server logs for more info`)
    }
}
