import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { AuthService } from "./auth/auth.service";
import { SessionService } from "./auth/session.service";
import {
  PasswordRotationResult,
  WandPasswordRotationService,
} from "./auth/wand-password-rotation.service";
import { WandRA } from "./entities/wand.entity";
import { RA } from "./interface/ra.interface";
import { RentalMapper } from "./mapper/RentalMapper";

@Injectable()
export class WandRentalService {
  constructor(
    @InjectModel(WandRA.name)
    private readonly wandRaModel: Model<WandRA>,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly passwordRotationService: WandPasswordRotationService,
  ) {}

  async login() {
    await this.passwordRotationService.rotateIfDue();

    return this.authService.login();
  }

  rotatePassword(force = false): Promise<PasswordRotationResult> {
    return this.passwordRotationService.rotateIfDue({ force });
  }

  getPasswordRotationStatus(): PasswordRotationResult {
    return this.passwordRotationService.getRotationStatus();
  }

  async findOne(ra: string): Promise<RA> {
    await this.passwordRotationService.rotateIfDue();
    await this.authService.ensureLogin();

    const agentId = this.sessionService.getAgentId();

    if (!agentId) {
      throw new BadGatewayException(
        "No hay agentId activo para consultar WAND.",
      );
    }

    const body = new URLSearchParams({
      raNo: ra,
      wizardNo: "",
      discountNo: "",
      haveCustInfo: "false",
      fromCache: "false",
    });

    const response = await this.sessionService
      .getClient()
      .post<RA>("/wand/rental", body.toString(), {
        params: {
          brand: "Avis",
          brandCode: "A",
          agentId,
          selectedModule: "DISPLAY-RENTAL",
          stationMnemonic: this.sessionService.getStation(),
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
      });

    if (!response.data) {
      throw new BadGatewayException(
        "WAND devolvió una respuesta rental vacía.",
      );
    }

    const rental = RentalMapper.toDomain(response.data);
    const existingRA = await this.wandRaModel.findOne({
      raNum: response.data.rentalData.raNum,
    });

    if (!existingRA) {
      await this.wandRaModel.create(rental.rentalData);
    }

    return rental;
  }

  async remove(_id: string): Promise<void> {
    const { deletedCount } = await this.wandRaModel.deleteOne({ _id });

    if (deletedCount === 0) {
      throw new BadRequestException(`RA with id "${_id}" not found`);
    }
  }
}
